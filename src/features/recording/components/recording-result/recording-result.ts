type ResultTab = "transcript" | "minutes";

export interface RecordingResult {
  reset(): void;
  showMinutes(minutes: string): void;
  showTranscript(transcript: string): void;
}

interface RecordingResultDownloads {
  recording(): Promise<void>;
  transcript(text: string): Promise<void>;
  minutes(text: string): Promise<void>;
}

export function createRecordingResult(
  onError: (message: string) => void,
  downloads: RecordingResultDownloads,
): RecordingResult {
  const transcriptText = document.getElementById("transcript-text") as HTMLPreElement;
  const minutesText = document.getElementById("minutes-text") as HTMLPreElement;
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));

  function switchTab(tab: ResultTab): void {
    tabs.forEach((element) => {
      element.classList.toggle("active", element.dataset.tab === tab);
    });
    const transcriptTab = document.getElementById("transcript-tab") as HTMLElement;
    const minutesTab = document.getElementById("minutes-tab") as HTMLElement;
    transcriptTab.hidden = tab !== "transcript";
    minutesTab.hidden = tab !== "minutes";
  }

  tabs.forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab as ResultTab);
    });
  });

  function copyText(text: string): void {
    if (!text) return;
    navigator.clipboard.writeText(text).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      onError(`コピーに失敗しました: ${message}`);
    });
  }

  function runDownload(download: () => Promise<void>): void {
    download().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      onError(`ダウンロードに失敗しました: ${message}`);
    });
  }

  (document.getElementById("copy-transcript-btn") as HTMLButtonElement).addEventListener(
    "click",
    () => copyText(transcriptText.textContent ?? ""),
  );
  (document.getElementById("copy-minutes-btn") as HTMLButtonElement).addEventListener("click", () =>
    copyText(minutesText.textContent ?? ""),
  );
  (document.getElementById("download-transcript-btn") as HTMLButtonElement).addEventListener(
    "click",
    () => runDownload(() => downloads.transcript(transcriptText.textContent ?? "")),
  );
  (document.getElementById("download-minutes-btn") as HTMLButtonElement).addEventListener(
    "click",
    () => runDownload(() => downloads.minutes(minutesText.textContent ?? "")),
  );
  (document.getElementById("download-recording-btn") as HTMLButtonElement).addEventListener(
    "click",
    () => runDownload(() => downloads.recording()),
  );

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
