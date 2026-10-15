import type { RecordingState } from "@features/recording/types";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "@features/settings/types";
import { createRecordingLog } from "@features/recording/components/log-section/log-section";
import { createRecordingControls } from "@features/recording/components/recording-controls/recording-controls";
import { createRecordingResult } from "@features/recording/components/recording-result/recording-result";
import { loadAndApplyAppearance, subscribeAppearanceChanges } from "@features/settings/theme";
import {
  getRecordingState,
  startRecording,
  stopRecording,
  subscribeRecordingStateChanged,
} from "@data/recording";
import { subscribeTranscriptionEvents } from "@data/transcription";
import { downloadRuntimeUrl } from "@data/file-download";
import { getRecording } from "../../db";
import { buildMinutesMarkdown, buildOutputFilename } from "@core/io/file_writer";

let currentState: RecordingState = "idle";
let currentRecordingId: string | null = null;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getTabMediaStreamId(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({}, (streamId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!streamId) {
        reject(new Error("録音用ストリーム ID を取得できませんでした"));
        return;
      }
      resolve(streamId);
    });
  });
}

function updateUI(state: RecordingState, message = ""): void {
  currentState = state;
  recordingControls.render(state, message);
}

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const result = await downloadRuntimeUrl(url, filename);
    if (!result?.ok) throw new Error(result?.error ?? "ファイルを保存できませんでした");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

async function getCurrentRecording() {
  if (!currentRecordingId) throw new Error("保存済みの録音が見つかりません");
  const recording = await getRecording(currentRecordingId);
  if (!recording) throw new Error("保存済みの録音が見つかりません");
  return recording;
}

async function toggleRecording(): Promise<void> {
  if (currentState === "recording") {
    try {
      const result = await stopRecording();
      if (!result?.ok) throw new Error(result?.error ?? "録音を停止できませんでした");
    } catch (err) {
      updateUI("error", `録音を停止できません: ${toErrorMessage(err)}`);
    }
    return;
  }

  if (currentState !== "idle" && currentState !== "done" && currentState !== "error") return;

  recordingLog.reset();
  recordingResult.reset();
  currentRecordingId = null;

  const streamId = getTabMediaStreamId();

  try {
    const [meetTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
      url: "https://meet.google.com/*",
    });

    if (!meetTab?.id) {
      await streamId.catch(() => {});
      updateUI("error", "Google Meet のタブが見つかりません");
      return;
    }

    let meetingTitle = "Google Meet";
    try {
      const titleRes = await chrome.tabs.sendMessage(meetTab.id, { type: "GET_MEETING_TITLE" });
      meetingTitle = (titleRes as { title?: string } | undefined)?.title ?? meetingTitle;
    } catch {
      // content scriptが応答しない場合もタブの録音は開始できる。
    }

    const [resolvedStreamId, storedSettings] = await Promise.all([
      streamId,
      chrome.storage.sync.get(DEFAULT_SETTINGS),
    ]);
    const result = await startRecording({
      streamId: resolvedStreamId,
      meetingTitle,
      settings: storedSettings as ExtensionSettings,
      tabId: meetTab.id,
    });
    if (!result?.ok) throw new Error(result?.error ?? "録音を開始できませんでした");
  } catch (err) {
    updateUI("error", `録音対象タブをキャプチャできません: ${toErrorMessage(err)}`);
  }
}

const recordingControls = createRecordingControls(() => {
  void toggleRecording();
});
const recordingLog = createRecordingLog();
const recordingResult = createRecordingResult((message) => updateUI("error", message), {
  async recording() {
    const recording = await getCurrentRecording();
    const filename = buildOutputFilename({
      meetingTitle: recording.meetingTitle,
      date: recording.date,
      kind: "recording",
      extension: "webm",
    });
    await downloadBlob(recording.audioBlob, filename);
  },
  async transcript(text) {
    if (!text) throw new Error("文字起こしがありません");
    const recording = await getCurrentRecording();
    const filename = buildOutputFilename({
      meetingTitle: recording.meetingTitle,
      date: recording.date,
      kind: "transcript",
      extension: "txt",
    });
    await downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
  },
  async minutes(text) {
    if (!text) throw new Error("議事録がありません");
    const recording = await getCurrentRecording();
    const filename = buildOutputFilename({
      meetingTitle: recording.meetingTitle,
      date: recording.date,
      kind: "minutes",
      extension: "md",
    });
    const markdown = buildMinutesMarkdown({
      meetingTitle: recording.meetingTitle,
      generatedAt: recording.date,
      minutes: text,
    });
    await downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), filename);
  },
});

const openOptions = document.getElementById("open-options") as HTMLAnchorElement;
openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage().catch((err: unknown) => {
    updateUI("error", `設定画面を開けませんでした: ${toErrorMessage(err)}`);
  });
});

subscribeTranscriptionEvents({
  chunk(text) {
    recordingLog.append(text);
  },
  completed(transcript, recordingId) {
    currentRecordingId = recordingId;
    recordingResult.showTranscript(transcript);
  },
});

subscribeRecordingStateChanged(({ state, recordingId, minutes, message }) => {
  if (recordingId) currentRecordingId = recordingId;
  updateUI(state, message ?? "");

  if (state === "done" && minutes) {
    recordingResult.showMinutes(minutes);
  }
});

getRecordingState()
  .then((response) => {
    if (response) {
      currentRecordingId = response.recordingId ?? null;
      updateUI(response.state);
    }
  })
  .catch(() => {});

subscribeAppearanceChanges();
loadAndApplyAppearance().catch((err: unknown) => {
  updateUI("error", `テーマ設定を読み込めませんでした: ${toErrorMessage(err)}`);
});
