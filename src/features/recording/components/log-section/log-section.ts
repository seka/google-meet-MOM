import { createLogChunk } from "../log-item/log-item";

export interface RecordingLog {
  append(text: string): void;
  reset(): void;
}

export function appendChunk(logContent: HTMLElement, placeholder: HTMLElement, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  placeholder.hidden = true;
  logContent.appendChild(createLogChunk(trimmed));
  logContent.scrollTop = logContent.scrollHeight;
}

export function resetLog(logContent: HTMLElement, placeholder: HTMLElement): void {
  logContent.innerHTML = "";
  logContent.appendChild(placeholder);
  placeholder.hidden = false;
}

export function initializeRecordingLog(): RecordingLog {
  const logContent = document.getElementById("log-content") as HTMLDivElement;
  const placeholder = document.getElementById("log-placeholder") as HTMLParagraphElement;

  return {
    append: (text) => appendChunk(logContent, placeholder, text),
    reset: () => resetLog(logContent, placeholder),
  };
}
