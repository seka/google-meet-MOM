import type { SpeakerEvent } from "@features/recording/types";

export type WordChunk = { text: string; timestamp: [number, number] | [null, null] };

export function buildSpeakerTranscript(
  chunks: WordChunk[],
  speakerEvents: SpeakerEvent[],
  recordingStartTime: number,
): string {
  if (speakerEvents.length === 0) {
    return chunks.map((c) => c.text).join("");
  }

  const relativeEvents = speakerEvents.map((e) => ({
    name: e.name,
    startSec: (e.absoluteTime - recordingStartTime) / 1000,
  }));

  const segments: Array<{ speaker: string; text: string }> = [];
  let currentSpeaker = relativeEvents[0]?.name ?? "不明";
  let currentText = "";

  for (const chunk of chunks) {
    const [start] = chunk.timestamp;
    if (start !== null) {
      const speaker =
        [...relativeEvents].reverse().find((e) => e.startSec <= start)?.name ?? currentSpeaker;
      if (speaker !== currentSpeaker && currentText.trim()) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim() });
        currentText = "";
      }
      currentSpeaker = speaker;
    }
    currentText += chunk.text;
  }

  if (currentText.trim()) {
    segments.push({ speaker: currentSpeaker, text: currentText.trim() });
  }

  return segments.map((s) => `[${s.speaker}] ${s.text}`).join("\n");
}
