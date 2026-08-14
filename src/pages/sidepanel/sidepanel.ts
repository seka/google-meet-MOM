import type { RecordingState } from "@features/recording/types";
import { DEFAULT_SETTINGS } from "@features/settings/types";
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

let currentState: RecordingState = "idle";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function chooseTabMediaStreamId(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.desktopCapture.chooseDesktopMedia(["tab", "audio"], (id, options) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!id) {
        reject(new Error("タブの選択がキャンセルされました"));
        return;
      }
      if (!options.canRequestAudioTrack) {
        reject(new Error("選択したタブの音声共有を有効にしてください"));
        return;
      }
      resolve(id);
    });
  });
}

function updateUI(state: RecordingState, message = ""): void {
  currentState = state;
  recordingControls.render(state, message);
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

  const streamIdPromise = chooseTabMediaStreamId();

  try {
    const [meetTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
      url: "https://meet.google.com/*",
    });

    if (!meetTab?.id) {
      await streamIdPromise.catch(() => {});
      updateUI("error", "Google Meet のタブが見つかりません");
      return;
    }

    let meetingTitle = "Google Meet";
    try {
      const titleRes = await chrome.tabs.sendMessage(meetTab.id, { type: "GET_MEETING_TITLE" });
      meetingTitle = (titleRes as { title: string })?.title ?? meetingTitle;
    } catch {
      // content script が応答しない場合はスキップ
    }

    const [streamId, settings] = await Promise.all([
      streamIdPromise,
      chrome.storage.sync.get(DEFAULT_SETTINGS),
    ]);

    const result = await startRecording({ streamId, meetingTitle, settings, tabId: meetTab.id });
    if (!result?.ok) throw new Error(result?.error ?? "録音を開始できませんでした");
  } catch (err) {
    updateUI("error", `録音対象タブをキャプチャできません: ${toErrorMessage(err)}`);
  }
}

const recordingControls = createRecordingControls(() => {
  void toggleRecording();
});
const recordingLog = createRecordingLog();
const recordingResult = createRecordingResult((message) => updateUI("error", message));

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
  completed(transcript) {
    recordingResult.showTranscript(transcript);
  },
});

subscribeRecordingStateChanged(({ state, minutes, message }) => {
  updateUI(state, message ?? "");

  if (state === "done" && minutes) {
    recordingResult.showMinutes(minutes);
  }
});

getRecordingState()
  .then((response) => {
    if (response) updateUI(response.state);
  })
  .catch(() => {});

subscribeAppearanceChanges();
loadAndApplyAppearance().catch((err: unknown) => {
  updateUI("error", `テーマ設定を読み込めませんでした: ${toErrorMessage(err)}`);
});
