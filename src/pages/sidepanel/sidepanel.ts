import type { RecordingState } from "@features/recording/types";
import { createRecordingLog } from "@features/recording/components/log-section/log-section";
import { createRecordingControls } from "@features/recording/components/recording-controls/recording-controls";
import { createRecordingResult } from "@features/recording/components/recording-result/recording-result";
import { loadAndApplyAppearance, subscribeAppearanceChanges } from "@features/settings/theme";
import { getRecordingState, stopRecording, subscribeRecordingStateChanged } from "@data/recording";
import { subscribeTranscriptionEvents } from "@data/transcription";

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
    try {
      const result = await stopRecording();
      if (!result?.ok) throw new Error(result?.error ?? "録音を停止できませんでした");
    } catch (err) {
      updateUI("error", `録音を停止できません: ${toErrorMessage(err)}`);
    }
    return;
  }

  updateUI("error", "録音を開始するには、Google Meet タブで拡張機能アイコンをクリックしてください");
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
