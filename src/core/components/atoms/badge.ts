const labels: Record<string, string> = {
  idle: "待機中",
  recording: "録音中",
  transcribing: "文字起こし中",
  summarizing: "議事録作成中",
  done: "完了",
  error: "エラー",
};

export function updateBadge(el: HTMLElement, state: string): void {
  el.textContent = labels[state] ?? state;
  el.className = `badge badge-${state}`;
}
