import type { RecordingState, SpeakerEvent } from "@features/recording/types";
import { DEFAULT_SETTINGS } from "@features/settings/types";
import { updateRecording } from "../db";
import {
  publishRecordingState,
  startOffscreenRecording,
  stopOffscreenRecording,
  subscribeBackgroundRecordingCommands,
  type RecordingStateEvent,
} from "@data/api/recording-runtime";
import {
  broadcastTranscriptChunk,
  subscribeBackgroundTranscriptionEvents,
} from "@data/api/transcription-runtime";
import {
  subscribeBackgroundConnectionTests,
  testWhisperOffscreen,
} from "@data/api/connection-test-runtime";
import { subscribeRuntimeUrlDownloads } from "@data/api/file-runtime";
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

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toRecordingStartErrorMessage(err: unknown): string {
  const message = toErrorMessage(err);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("extension has not been invoked") ||
    normalizedMessage.includes("activetab") ||
    normalizedMessage.includes("chrome pages cannot be captured")
  ) {
    return "録音対象タブをキャプチャできません。Google Meet のタブを選択した状態で拡張機能アイコンからサイドパネルを開き直して、もう一度開始してください。chrome:// などの Chrome 内部ページは録音できません。";
  }

  return message;
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

async function testWhisperWithRetry(input: {
  audioSamples: number[];
  model: string;
  language: string;
}): Promise<unknown> {
  const attempts = 3;

  for (let i = 0; i < attempts; i++) {
    try {
      return await testWhisperOffscreen(input);
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
  }

  throw new Error("Offscreen document did not respond");
}

function setState(
  state: RecordingState,
  extra: Omit<RecordingStateEvent, "state"> = {},
): void {
  currentState = state;
  publishRecordingState({ state, ...extra });
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

async function getTabMediaStreamId(tabId: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!id) {
        reject(new Error("録音用ストリーム ID を取得できませんでした"));
        return;
      }
      resolve(id);
    });
  });
}

async function generateAndSaveMinutes(transcript: string, recordingId: string): Promise<void> {
  setState("summarizing", { recordingId });
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const generatedAt = new Date().toISOString();

  try {
    const minutes = await generateMinutes({
      ollamaUrl: settings["ollamaUrl"] as string,
      ollamaModel: settings["ollamaModel"] as string,
      transcript,
    });

    await updateRecording(recordingId, { minutes });

    if (settings["minutesOutputDestination"] === "download") {
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

subscribeBackgroundRecordingCommands({
  start(input, respond) {
    (async () => {
      try {
        await ensureOffscreenDocument();
        recordingStartTime = Date.now();
        meetTabId = input.tabId;
        currentMeetingTitle = input.meetingTitle;
        const streamId = await getTabMediaStreamId(input.tabId);

        if (meetTabId) {
          chrome.tabs.sendMessage(
            meetTabId,
            { type: "START_SPEAKER_TRACKING", payload: { recordingStartTime } },
            () => {},
          );
        }

        startOffscreenRecording({ ...input, streamId, recordingStartTime });
        setState("recording");
        respond({ ok: true });
      } catch (err) {
        const message = toRecordingStartErrorMessage(err);
        setState("error", { message });
        respond({ ok: false, error: message });
      }
    })().catch(reportBackgroundError);
  },
  stop(respond) {
    setState("transcribing");
    respond({ ok: true });
    collectSpeakerEvents()
      .then((speakerEvents) => stopOffscreenRecording({ speakerEvents, recordingStartTime }))
      .catch(reportBackgroundError);
  },
  getState(respond) {
    respond({ state: currentState, recordingId: currentRecordingId });
  },
  recordingSaved(recordingId) {
    currentRecordingId = recordingId;
  },
});

subscribeBackgroundTranscriptionEvents({
  completed(transcript, recordingId) {
    currentRecordingId = recordingId;
    generateAndSaveMinutes(transcript, recordingId)
      .then(closeOffscreenDocument)
      .catch(reportBackgroundError);
  },
  chunk(text, chunkIndex) {
    broadcastTranscriptChunk(text, chunkIndex);
  },
  error(message) {
    setState("error", { message });
    closeOffscreenDocument().catch(reportBackgroundError);
  },
});

subscribeBackgroundConnectionTests({
  ollama({ ollamaUrl, ollamaModel }, respond) {
    assertMinutesModelAvailable(ollamaUrl, ollamaModel)
      .then(() => respond({ ok: true }))
      .catch((err: unknown) => respond({ ok: false, error: toMinutesErrorMessage(err) }));
  },
  whisper(input, respond) {
    if (currentState !== "idle" && currentState !== "done" && currentState !== "error") {
      respond({ ok: false, error: "録音中はテストできません" });
      return;
    }

    ensureOffscreenDocument()
      .then(() => testWhisperWithRetry(input))
      .then(respond)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        respond({ ok: false, error: `Offscreen 通信エラー: ${message}` });
      });
  },
});

subscribeRuntimeUrlDownloads((url, filename, respond) => {
  downloadUrlFile(url, filename)
    .then(() => respond({ ok: true }))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      respond({ ok: false, error: message });
    });
});
