import { DEFAULT_SETTINGS, type RecordingState, type SpeakerEvent } from "../types";
import { updateRecording } from "../db";
import type { ExtensionMessage } from "../messages";

let currentState: RecordingState = "idle";
let currentRecordingId: string | null = null;
let recordingStartTime = 0;
let meetTabId: number | null = null;

// アイコンクリックでサイドパネルを開く
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// SW が録音中に終了しないよう定期アラームで維持
void chrome.alarms.create("keepalive", { periodInMinutes: 0.2 });
chrome.alarms.onAlarm.addListener(() => {});

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: "workers/offscreen/offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Recording Google Meet tab audio and microphone",
  });
}

async function closeOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length === 0) return;
  await chrome.offscreen.closeDocument();
}

async function sendMessageToOffscreen(message: ExtensionMessage): Promise<unknown> {
  const attempts = 3;

  for (let i = 0; i < attempts; i++) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (result: unknown) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result);
        });
      });
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
  }

  throw new Error("Offscreen document did not respond");
}

function setState(state: RecordingState, extra: Record<string, unknown> = {}): void {
  currentState = state;
  chrome.runtime.sendMessage(
    {
      type: "STATE_CHANGED",
      payload: { state, ...extra },
    },
    () => {},
  );
}

async function collectSpeakerEvents(): Promise<SpeakerEvent[]> {
  if (!meetTabId) return [];
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(meetTabId!, { type: "GET_SPEAKER_EVENTS" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        resolve([]);
        return;
      }
      resolve((res as { speakerEvents: SpeakerEvent[] }).speakerEvents ?? []);
    });
  });
}

async function generateMinutes(transcript: string, recordingId: string): Promise<void> {
  setState("summarizing", { recordingId });
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

  try {
    const res = await fetch(`${settings["ollamaUrl"]}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings["ollamaModel"],
        stream: false,
        messages: [
          {
            role: "user",
            content:
              "以下はミーティングの文字起こしです。\n" +
              "日時・参加者・決定事項・アクションアイテムを含む議事録を日本語で Markdown 形式で作成してください。\n\n" +
              "---\n" +
              transcript,
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Ollama API: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as { message?: { content: string } };
    const minutes = data.message?.content ?? "";

    await updateRecording(recordingId, { minutes });
    setState("done", { recordingId, minutes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setState("error", { message: `議事録生成エラー: ${msg}` });
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    if (message.target === "offscreen") return false;

    void (async () => {
      switch (message.type) {
        case "START_RECORDING": {
          try {
            await ensureOffscreenDocument();

            recordingStartTime = Date.now();
            meetTabId = message.payload.tabId ?? null;

            // バックグラウンドで streamId を取得（tabCapture パーミッションにより可能）
            const streamId = await new Promise<string>((resolve, reject) => {
              chrome.tabCapture.getMediaStreamId({ targetTabId: message.payload.tabId }, (id) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(id);
                }
              });
            });

            // content script に話者追跡を開始させる
            if (meetTabId) {
              chrome.tabs.sendMessage(
                meetTabId,
                { type: "START_SPEAKER_TRACKING", payload: { recordingStartTime } },
                () => {},
              );
            }

            chrome.runtime.sendMessage(
              {
                type: "FORWARD_TO_OFFSCREEN",
                target: "offscreen",
                payload: { ...message.payload, streamId, recordingStartTime },
              },
              () => {},
            );
            setState("recording");
            sendResponse({ ok: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setState("error", { message: msg });
            sendResponse({ ok: false, error: msg });
          }
          break;
        }

        case "STOP_RECORDING": {
          setState("transcribing");
          sendResponse({ ok: true });

          // content から話者イベントを収集してから offscreen に渡す
          const speakerEvents = await collectSpeakerEvents();
          chrome.runtime.sendMessage(
            {
              type: "OFFSCREEN_STOP",
              target: "offscreen",
              payload: { speakerEvents, recordingStartTime },
            },
            () => {},
          );
          break;
        }

        case "GET_STATE": {
          sendResponse({ state: currentState, recordingId: currentRecordingId });
          break;
        }

        case "RECORDING_SAVED": {
          currentRecordingId = message.payload.recordingId;
          break;
        }

        case "TRANSCRIPTION_DONE": {
          const { transcript, recordingId } = message.payload;
          currentRecordingId = recordingId;
          await generateMinutes(transcript, recordingId);
          await closeOffscreenDocument();
          break;
        }

        case "TRANSCRIPT_CHUNK": {
          // サイドパネルへ中継（target なしで全拡張ページにブロードキャスト）
          chrome.runtime.sendMessage(
            { type: "TRANSCRIPT_CHUNK", payload: message.payload },
            () => {},
          );
          break;
        }

        case "ERROR": {
          setState("error", { message: message.payload.message });
          await closeOffscreenDocument();
          break;
        }

        case "WHISPER_TEST": {
          if (currentState !== "idle" && currentState !== "done" && currentState !== "error") {
            sendResponse({ ok: false, error: "録音中はテストできません" });
            break;
          }
          try {
            await ensureOffscreenDocument();
            const result = await sendMessageToOffscreen({
              type: "WHISPER_TEST",
              target: "offscreen",
              payload: message.payload,
            });
            sendResponse(result);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            sendResponse({ ok: false, error: `Offscreen 通信エラー: ${msg}` });
          }
          break;
        }
      }
    })();

    return true;
  },
);
