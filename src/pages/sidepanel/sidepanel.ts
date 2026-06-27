import type { RecordingState } from "../../types";
import { DEFAULT_SETTINGS } from "../../types";
import { updateBadge } from "@core/components/atoms/badge";
import { appendChunk, resetLog } from "@features/recording/components/log-section";

const recordBtn = document.getElementById("record-btn") as HTMLButtonElement;
const btnLabel = document.getElementById("btn-label") as HTMLSpanElement;
const iconMic = document.getElementById("icon-mic") as HTMLElement;
const iconStop = document.getElementById("icon-stop") as HTMLElement;
const statusBadge = document.getElementById("status-badge") as HTMLSpanElement;
const statusMessage = document.getElementById("status-message") as HTMLParagraphElement;
const logContent = document.getElementById("log-content") as HTMLDivElement;
const logPlaceholder = document.getElementById("log-placeholder") as HTMLParagraphElement;
const processingIndicator = document.getElementById("processing-indicator") as HTMLSpanElement;
const resultSection = document.getElementById("result-section") as HTMLElement;
const transcriptText = document.getElementById("transcript-text") as HTMLPreElement;
const minutesText = document.getElementById("minutes-text") as HTMLPreElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const downloadBtn = document.getElementById("download-btn") as HTMLButtonElement;
const openOptions = document.getElementById("open-options") as HTMLAnchorElement;

let currentState: RecordingState = "idle";
let currentTab: "transcript" | "minutes" = "transcript";

function updateUI(state: RecordingState, message = ""): void {
  currentState = state;

  updateBadge(statusBadge, state);
  statusMessage.textContent = message;

  if (state === "idle" || state === "done" || state === "error") {
    btnLabel.textContent = "録音開始";
    iconMic.hidden = false;
    iconStop.hidden = true;
    recordBtn.classList.remove("recording");
    recordBtn.disabled = false;
    processingIndicator.hidden = true;
  } else if (state === "recording") {
    btnLabel.textContent = "録音停止";
    iconMic.hidden = true;
    iconStop.hidden = false;
    recordBtn.classList.add("recording");
    recordBtn.disabled = false;
    processingIndicator.hidden = false;
  } else {
    btnLabel.textContent = "処理中...";
    iconMic.hidden = false;
    iconStop.hidden = true;
    recordBtn.disabled = true;
    processingIndicator.hidden = false;
  }
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

recordBtn.addEventListener("click", async () => {
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

  const streamId = await new Promise<string>((resolve) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: meetTab.id }, resolve);
  });

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

  chrome.runtime.sendMessage(
    {
      type: "START_RECORDING",
      target: "background",
      payload: { streamId, meetingTitle, settings, tabId: meetTab.id },
    },
    () => {},
  );
});

copyBtn.addEventListener("click", () => {
  const text = currentTab === "transcript" ? transcriptText.textContent : minutesText.textContent;
  if (text) void navigator.clipboard.writeText(text);
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
  void chrome.runtime.openOptionsPage();
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
