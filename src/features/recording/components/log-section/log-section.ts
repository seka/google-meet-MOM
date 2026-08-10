import { createLogChunk } from "../log-item/log-item";

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
