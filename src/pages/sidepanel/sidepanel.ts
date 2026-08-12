import type { RecordingState } from "@features/recording/types";
import { DEFAULT_SETTINGS } from "@features/settings/types";
import { appendChunk, resetLog } from "@features/recording/components/log-section";
import { loadAndApplyAppearance, subscribeAppearanceChanges } from "@features/settings/theme";

const recordBtn = document.getElementById("record-btn") as HTMLButtonElement;
const iconMic = document.getElementById("icon-mic") as HTMLElement;
const iconStop = document.getElementById("icon-stop") as HTMLElement;
const statusBadge = document.getElementById("status-badge") as HTMLSpanElement;
const statusLabel = document.getElementById("status-label") as HTMLSpanElement;
const statusSpinner = document.getElementById("status-spinner") as HTMLElement;
const statusBar = document.getElementById("status-bar") as HTMLDivElement;
const statusMessage = document.getElementById("status-message") as HTMLParagraphElement;
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

const STATE_LABELS: Record<RecordingState, string> = {
  idle: "待機中",
  recording: "録音中",
  transcribing: "文字起こし中",
  summarizing: "議事録作成中",
  done: "完了",
  error: "エラー",
};

const SPINNER_STATES = new Set<RecordingState>(["transcribing", "summarizing"]);

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getTabMediaStreamId(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({}, (id: string) => {
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

function updateUI(state: RecordingState, message = ""): void {
  currentState = state;

  statusBadge.className = `badge badge-${state}`;
  statusLabel.textContent = STATE_LABELS[state];
  statusSpinner.classList.toggle("hidden", !SPINNER_STATES.has(state));

  const isError = state === "error" && message !== "";
  statusBar.classList.toggle("hidden", !isError);
  statusMessage.textContent = isError ? message : "";

  if (state === "idle" || state === "done" || state === "error") {
    iconMic.classList.remove("hidden");
    iconStop.classList.add("hidden");
    recordBtn.classList.remove("recording");
    recordBtn.disabled = false;
  } else if (state === "recording") {
    iconMic.classList.add("hidden");
    iconStop.classList.remove("hidden");
    recordBtn.classList.add("recording");
    recordBtn.disabled = false;
  } else {
    iconMic.classList.remove("hidden");
    iconStop.classList.add("hidden");
    recordBtn.disabled = true;
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

  // tabCapture はユーザー操作の直後に同期的に開始する必要がある。
  const streamIdPromise = getTabMediaStreamId();

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

    chrome.runtime.sendMessage(
      {
        type: "START_RECORDING",
        target: "background",
        payload: { streamId, meetingTitle, settings, tabId: meetTab.id },
      },
      () => {},
    );
  } catch (err) {
    updateUI("error", `録音対象タブをキャプチャできません: ${toErrorMessage(err)}`);
  }
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
