import type { SpeakerEvent } from "@features/recording/types";
import { subscribeMeetingCommands } from "@data/api/meeting-runtime";

export function getMeetingTitle(): string {
  const selectors = ["[data-meeting-title]", 'c-wiz [jsname="r4nke"]', '[jsname="ZaFQO"]'];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }

  return document.title.replace(" - Google Meet", "").trim() || "Google Meet";
}

// Google Meet のアクティブスピーカー名を取得する。
// Meet の DOM は変更されることがあるため複数のセレクタを試し、どれも一致しなければ null を返す。
export function getActiveSpeaker(): string | null {
  const candidates = [
    // ピン留めされていないアクティブスピーカータイル内の名前
    '[data-participant-id][data-is-speaking="true"] [data-self-name]',
    '[data-participant-id][data-is-speaking="true"] [jsname="r4nke"]',
    // 発言インジケーターが付いているタイルの aria-label（"田中 太郎 が話しています" 形式）
    '[jsname="EydYod"][aria-label*="話しています"]',
    '[jsname="EydYod"][aria-label*="is speaking"]',
  ];

  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (!el) continue;

    // aria-label から名前部分のみ抽出（"○○ が話しています" → "○○"）
    const label = el.getAttribute("aria-label");
    if (label) {
      return label.replace(/\s*(が話しています|is speaking).*$/i, "").trim() || null;
    }

    const text = el.textContent?.trim();
    if (text) return text;
  }

  return null;
}

let speakerEvents: SpeakerEvent[] = [];
let observer: MutationObserver | null = null;

function startSpeakerTracking(_startTime: number): void {
  speakerEvents = [];

  observer = new MutationObserver(() => {
    const name = getActiveSpeaker();
    if (!name) return;
    const last = speakerEvents[speakerEvents.length - 1];
    if (!last || last.name !== name) {
      speakerEvents.push({ name, absoluteTime: Date.now() });
    }
  });

  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-is-speaking", "aria-label", "class"],
    childList: true,
  });
}

function stopSpeakerTracking(): void {
  observer?.disconnect();
  observer = null;
}

subscribeMeetingCommands({
  getTitle() {
    return { title: getMeetingTitle() };
  },
  startSpeakerTracking(recordingStartTime) {
    startSpeakerTracking(recordingStartTime);
  },
  getSpeakerEvents() {
    stopSpeakerTracking();
    return { speakerEvents };
  },
});
