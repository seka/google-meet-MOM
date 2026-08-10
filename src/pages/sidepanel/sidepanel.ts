import type { RecordingState } from "@features/recording/types";
import { DEFAULT_SETTINGS } from "@features/settings/types";
import { appendChunk, resetLog } from "@features/recording/components/log-section/log-section";
import { initializeRecordingControls } from "@features/recording/components/recording-controls/recording-controls";
import { loadAndApplyAppearance, subscribeAppearanceChanges } from "@features/settings/theme";

const logContent = document.getElementById("log-content") as HTMLDivElement;
const logPlaceholder = document.getElementById("log-placeholder") as HTMLParagraphElement;
const resultSection = document.getElementById("result-section") as HTMLElement;
const transcriptText = document.getElementById("transcript-text") as HTMLPreElement;
const minutesText = document.getElementById("minutes-text") as HTMLPreElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const downloadBtn = document.getElementById("download-btn") as HTMLButtonElement;
const openOptions = document.getElementById("open-options") as HTMLAnchorElement;

let currentState: RecordingState = "idle";
let currentTab: "transcript" | "minutes" = "transcript";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function updateUI(state: RecordingState, message = ""): void {
  currentState = state;
  recordingControls.render(state, message);
}

function switchTab(tab: "transcript" | "minutes"): void {
  currentTab = tab;
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  (document.getElementById("transcript-tab") as HTMLElement).hidden = tab !== "transcript";
  (document.getElementById("minutes-tab") as HTMLElement).hidden = tab !== "minutes";
}

document.querySelectorAll<HTMLButtonElement>(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab as "transcript" | "minutes");
  });
});

async function toggleRecording(): Promise<void> {
  if (currentState === "recording") {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING", target: "background" }, () => {});
    return;
  }

  if (currentState !== "idle" && currentState !== "done" && currentState !== "error") return;

  resetLog(logContent, logPlaceholder);
  resultSection.hidden = true;
  transcriptText.textContent = "";
  minutesText.textContent = "";

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

const recordingControls = initializeRecordingControls(() => {
  void toggleRecording();
});

copyBtn.addEventListener("click", () => {
  const text = currentTab === "transcript" ? transcriptText.textContent : minutesText.textContent;
  if (text) {
    navigator.clipboard.writeText(text).catch((err: unknown) => {
      updateUI("error", `コピーに失敗しました: ${toErrorMessage(err)}`);
    });
  }
});

downloadBtn.addEventListener("click", () => {
  const text = currentTab === "transcript" ? transcriptText.textContent : minutesText.textContent;
  const filename = currentTab === "transcript" ? "transcript.txt" : "minutes.md";
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage().catch((err: unknown) => {
    updateUI("error", `設定画面を開けませんでした: ${toErrorMessage(err)}`);
  });
});

chrome.runtime.onMessage.addListener((message: { type: string; payload?: unknown }) => {
  if (message.type === "TRANSCRIPT_CHUNK") {
    const { text } = message.payload as { text: string; chunkIndex: number };
    appendChunk(logContent, logPlaceholder, text);
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
      minutesText.textContent = minutes;
      resultSection.hidden = false;
      if (!transcriptText.textContent) switchTab("minutes");
    }
  }

  if (message.type === "TRANSCRIPTION_DONE") {
    const { transcript } = (message as { payload: { transcript: string } }).payload;
    transcriptText.textContent = transcript;
    resultSection.hidden = false;
    switchTab("transcript");
  }
});

chrome.runtime.sendMessage({ type: "GET_STATE" }, (res: { state: RecordingState } | null) => {
  if (res) updateUI(res.state);
});

subscribeAppearanceChanges();
loadAndApplyAppearance().catch((err: unknown) => {
  updateUI("error", `テーマ設定を読み込めませんでした: ${toErrorMessage(err)}`);
});
