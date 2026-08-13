type ResultTab = "transcript" | "minutes";

export interface RecordingResult {
  reset(): void;
  showMinutes(minutes: string): void;
  showTranscript(transcript: string): void;
}

export function createRecordingResult(onError: (message: string) => void): RecordingResult {
  const transcriptText = document.getElementById("transcript-text") as HTMLPreElement;
  const minutesText = document.getElementById("minutes-text") as HTMLPreElement;
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
  let currentTab: ResultTab = "transcript";

  function switchTab(tab: ResultTab): void {
    currentTab = tab;
    tabs.forEach((element) => {
      element.classList.toggle("active", element.dataset.tab === tab);
    });
    const transcriptTab = document.getElementById("transcript-tab") as HTMLElement;
    const minutesTab = document.getElementById("minutes-tab") as HTMLElement;
    transcriptTab.hidden = tab !== "transcript";
    minutesTab.hidden = tab !== "minutes";
  }

  function currentText(): string {
    return currentTab === "transcript"
      ? (transcriptText.textContent ?? "")
      : (minutesText.textContent ?? "");
  }

  tabs.forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab as ResultTab);
    });
  });

  const copyButton = document.getElementById("copy-btn") as HTMLButtonElement;
  copyButton.addEventListener("click", () => {
    const text = currentText();
    if (!text) return;
    navigator.clipboard.writeText(text).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      onError(`コピーに失敗しました: ${message}`);
    });
  });

  const downloadButton = document.getElementById("download-btn") as HTMLButtonElement;
  downloadButton.addEventListener("click", () => {
    const text = currentText();
    if (!text) return;
    const filename = currentTab === "transcript" ? "transcript.txt" : "minutes.md";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  const resultSection = document.getElementById("result-section") as HTMLElement;
  return {
    reset: () => {
      resultSection.hidden = true;
      transcriptText.textContent = "";
      minutesText.textContent = "";
    },
    showMinutes: (minutes) => {
      minutesText.textContent = minutes;
      resultSection.hidden = false;
      if (!transcriptText.textContent) switchTab("minutes");
    },
    showTranscript: (transcript) => {
      transcriptText.textContent = transcript;
      resultSection.hidden = false;
      switchTab("transcript");
    },
  };
}
