type DownloadKind = "minutes" | "recording" | "transcript";
type DownloadExtension = "md" | "webm" | "txt";

interface FilenameInput {
  meetingTitle: string;
  date: string;
  kind: DownloadKind;
  extension: DownloadExtension;
}

const KIND_LABELS: Record<DownloadKind, string> = {
  minutes: "minutes",
  recording: "recording",
  transcript: "transcript",
};

function sanitizeFilenamePart(value: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "google-meet";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return sanitizeFilenamePart(value);

  const pad = (num: number): string => String(num).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    `${pad(date.getHours())}-${pad(date.getMinutes())}`,
  ].join("-");
}

export function buildOutputFilename({
  meetingTitle,
  date,
  kind,
  extension,
}: FilenameInput): string {
  const timestamp = formatTimestamp(date);
  const title = sanitizeFilenamePart(meetingTitle);
  return `google-meet-mom_${timestamp}_${title}_${KIND_LABELS[kind]}.${extension}`;
}

export function downloadUrlFile(url: string, filename: string): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(downloadId ?? 0);
    });
  });
}
