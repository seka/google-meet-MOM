import type { RecordingState } from "../../types";

const STATE_LABELS: Record<RecordingState, string> = {
  idle: "待機中",
  recording: "録音中",
  transcribing: "文字起こし中",
  summarizing: "議事録作成中",
  done: "完了",
  error: "エラー",
};

const SPINNER_STATES = new Set<RecordingState>(["transcribing", "summarizing"]);

interface RecordingControlElements {
  recordButton: HTMLButtonElement;
  microphoneIcon: HTMLElement;
  stopIcon: HTMLElement;
  statusBadge: HTMLElement;
  statusLabel: HTMLElement;
  statusSpinner: HTMLElement;
  statusBar: HTMLElement;
  statusMessage: HTMLElement;
}

export interface RecordingControls {
  render(state: RecordingState, message?: string): void;
}

export function renderRecordingControls(
  elements: RecordingControlElements,
  state: RecordingState,
  message = "",
): void {
  elements.statusBadge.className = `badge badge-${state}`;
  elements.statusLabel.textContent = STATE_LABELS[state];
  elements.statusSpinner.classList.toggle("hidden", !SPINNER_STATES.has(state));

  const isError = state === "error" && message !== "";
  elements.statusBar.classList.toggle("hidden", !isError);
  elements.statusMessage.textContent = isError ? message : "";

  const isRecording = state === "recording";
  const isBusy = state === "transcribing" || state === "summarizing";
  elements.microphoneIcon.classList.toggle("hidden", isRecording);
  elements.stopIcon.classList.toggle("hidden", !isRecording);
  elements.recordButton.classList.toggle("recording", isRecording);
  elements.recordButton.disabled = isBusy;
}

export function initializeRecordingControls(onToggle: () => void): RecordingControls {
  const elements: RecordingControlElements = {
    recordButton: document.getElementById("record-btn") as HTMLButtonElement,
    microphoneIcon: document.getElementById("icon-mic") as HTMLElement,
    stopIcon: document.getElementById("icon-stop") as HTMLElement,
    statusBadge: document.getElementById("status-badge") as HTMLElement,
    statusLabel: document.getElementById("status-label") as HTMLElement,
    statusSpinner: document.getElementById("status-spinner") as HTMLElement,
    statusBar: document.getElementById("status-bar") as HTMLElement,
    statusMessage: document.getElementById("status-message") as HTMLElement,
  };

  elements.recordButton.addEventListener("click", onToggle);
  return {
    render: (state, message) => renderRecordingControls(elements, state, message),
  };
}
