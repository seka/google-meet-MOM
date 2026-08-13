import type { RecordingState, SpeakerEvent } from "@features/recording/types";
import type { ExtensionSettings } from "@features/settings/types";
import { updateRecording } from "../db";
import type { ExtensionMessage } from "../messages";
import {
  assertMinutesModelAvailable,
  generateMinutes,
  toMinutesErrorMessage,
} from "../data/api/minutes";
import {
  buildMinutesMarkdown,
  buildOutputFilename,
  downloadTextFile,
  downloadUrlFile,
} from "@core/io/file_writer";

let currentState: RecordingState = "idle";
let currentRecordingId: string | null = null;
let currentMeetingTitle = "Google Meet";
let recordingStartTime = 0;
let meetTabId: number | null = null;
let currentSettings: ExtensionSettings | null = null;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function ignoreOptionalMessageError(): void {
  void chrome.runtime.lastError;
}

function reportBackgroundError(err: unknown): void {
  setState("error", { message: toErrorMessage(err) });
}

// アイコンクリックでサイドパネルを開く
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(reportBackgroundError);

// SW が録音中に終了しないよう定期アラームで維持
chrome.alarms.create("keepalive", { periodInMinutes: 0.2 }).catch(reportBackgroundError);
chrome.alarms.onAlarm.addListener(() => {});

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: "workers/offscreen/offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
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
    ignoreOptionalMessageError,
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

async function generateAndSaveMinutes(transcript: string, recordingId: string): Promise<void> {
  setState("summarizing", { recordingId });
  if (!currentSettings) throw new Error("録音設定を取得できませんでした");
  const generatedAt = new Date().toISOString();

  try {
    const minutes = await generateMinutes({
      ollamaUrl: currentSettings.ollamaUrl,
      ollamaModel: currentSettings.ollamaModel,
      transcript,
    });

    await updateRecording(recordingId, { minutes });

    if (currentSettings.minutesOutputDestination === "download") {
      const filename = buildOutputFilename({
        meetingTitle: currentMeetingTitle,
        date: generatedAt,
        kind: "minutes",
        extension: "md",
      });
      const markdown = buildMinutesMarkdown({
        meetingTitle: currentMeetingTitle,
        generatedAt,
        minutes,
      });

      try {
        await downloadTextFile({
          text: markdown,
          filename,
          mimeType: "text/markdown",
        });
      } catch {
        // ファイル保存が失敗しても、生成済みの議事録とブラウザ内保存は維持する。
      }
    }

    setState("done", { recordingId, minutes });
  } catch (err) {
    setState("error", { message: `議事録生成エラー: ${toMinutesErrorMessage(err)}` });
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    if (message.target !== "background" && message.type !== "GET_STATE") return false;

    (async () => {
      switch (message.type) {
        case "START_RECORDING": {
          try {
            await ensureOffscreenDocument();

            recordingStartTime = Date.now();
            meetTabId = message.payload.tabId ?? null;
            currentMeetingTitle = message.payload.meetingTitle;
            currentSettings = message.payload.settings;

            // content script に話者追跡を開始させる
            if (meetTabId) {
              chrome.tabs.sendMessage(
                meetTabId,
                { type: "START_SPEAKER_TRACKING", payload: { recordingStartTime } },
                ignoreOptionalMessageError,
              );
            }

            chrome.runtime.sendMessage(
              {
                type: "FORWARD_TO_OFFSCREEN",
                target: "offscreen",
                payload: { ...message.payload, recordingStartTime },
              },
              ignoreOptionalMessageError,
            );
            setState("recording");
            sendResponse({ ok: true });
          } catch (err) {
            const msg = toErrorMessage(err);
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
            ignoreOptionalMessageError,
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
          await generateAndSaveMinutes(transcript, recordingId);
          await closeOffscreenDocument();
          break;
        }

        case "TRANSCRIPT_CHUNK": {
          // サイドパネルへ中継（target なしで全拡張ページにブロードキャスト）
          chrome.runtime.sendMessage(
            { type: "TRANSCRIPT_CHUNK", payload: message.payload },
            ignoreOptionalMessageError,
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

        case "OLLAMA_TEST": {
          try {
            await assertMinutesModelAvailable(
              message.payload.ollamaUrl,
              message.payload.ollamaModel,
            );
            sendResponse({ ok: true });
          } catch (err) {
            const msg = toMinutesErrorMessage(err);
            sendResponse({ ok: false, error: msg });
          }
          break;
        }

        case "DOWNLOAD_URL": {
          try {
            await downloadUrlFile(message.payload.url, message.payload.filename);
            sendResponse({ ok: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            sendResponse({ ok: false, error: msg });
          }
          break;
        }
      }
    })().catch(reportBackgroundError);

    return true;
  },
);
