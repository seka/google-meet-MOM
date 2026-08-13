import type { RecordingState } from "@features/recording/types";
import { DEFAULT_SETTINGS } from "@features/settings/types";
import { createRecordingLog } from "@features/recording/components/log-section/log-section";
import { createRecordingControls } from "@features/recording/components/recording-controls/recording-controls";
import { createRecordingResult } from "@features/recording/components/recording-result/recording-result";
import { loadAndApplyAppearance, subscribeAppearanceChanges } from "@features/settings/theme";

let currentState: RecordingState = "idle";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function updateUI(state: RecordingState, message = ""): void {
  currentState = state;
  recordingControls.render(state, message);
}

async function toggleRecording(): Promise<void> {
  if (currentState === "recording") {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING", target: "background" }, () => {});
    return;
  }

  if (currentState !== "idle" && currentState !== "done" && currentState !== "error") return;

  recordingLog.reset();
  recordingResult.reset();

  const [meetTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    url: "https://meet.google.com/*",
  });

  if (!meetTab?.id) {
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

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

  chrome.runtime.sendMessage(
    {
      type: "START_RECORDING",
      target: "background",
      payload: { meetingTitle, settings, tabId: meetTab.id },
    },
    () => {},
  );
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

chrome.runtime.onMessage.addListener((message: { type: string; payload?: unknown }) => {
  if (message.type === "TRANSCRIPT_CHUNK") {
    const { text } = message.payload as { text: string; chunkIndex: number };
    recordingLog.append(text);
  }

  if (message.type === "STATE_CHANGED") {
    const {
      state,
      minutes,
      message: msg,
    } = message.payload as {
      state: RecordingState;
      minutes?: string;
      message?: string;
    };

    updateUI(state, msg ?? "");

    if (state === "done" && minutes) {
      recordingResult.showMinutes(minutes);
    }
  }

  if (message.type === "TRANSCRIPTION_DONE") {
    const { transcript } = (message as { payload: { transcript: string } }).payload;
    recordingResult.showTranscript(transcript);
  }
});

chrome.runtime.sendMessage({ type: "GET_STATE" }, (res: { state: RecordingState } | null) => {
  if (res) updateUI(res.state);
});

subscribeAppearanceChanges();
loadAndApplyAppearance().catch((err: unknown) => {
  updateUI("error", `テーマ設定を読み込めませんでした: ${toErrorMessage(err)}`);
});
