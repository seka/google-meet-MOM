import { describe, it, expect } from "vite-plus/test";
import { buildSpeakerTranscript, type WordChunk } from "./transcript";
import type { SpeakerEvent } from "../../types";

const t0 = 1000000; // recordingStartTime (ms)

describe("buildSpeakerTranscript", () => {
  describe("話者イベントなし", () => {
    it("チャンクのテキストをそのまま結合する", () => {
      const chunks: WordChunk[] = [
        { text: "hello ", timestamp: [0, 1] },
        { text: "world", timestamp: [1, 2] },
      ];
      expect(buildSpeakerTranscript(chunks, [], t0)).toBe("hello world");
    });

    it("チャンクが空の場合は空文字を返す", () => {
      expect(buildSpeakerTranscript([], [], t0)).toBe("");
    });
  });

  describe("話者イベントあり", () => {
    it("単一話者のとき [名前] プレフィックスが付く", () => {
      const chunks: WordChunk[] = [
        { text: "こんにちは", timestamp: [0, 1] },
        { text: " 世界", timestamp: [1, 2] },
      ];
      const events: SpeakerEvent[] = [{ name: "田中", absoluteTime: t0 }];

      expect(buildSpeakerTranscript(chunks, events, t0)).toBe("[田中] こんにちは 世界");
    });

    it("話者が切り替わると別行になる", () => {
      const chunks: WordChunk[] = [
        { text: "Aの発言 ", timestamp: [0, 2] },
        { text: "Bの発言", timestamp: [5, 7] },
      ];
      const events: SpeakerEvent[] = [
        { name: "田中", absoluteTime: t0 }, // 0秒
        { name: "佐藤", absoluteTime: t0 + 3 * 1000 }, // 3秒
      ];

      const result = buildSpeakerTranscript(chunks, events, t0);
      expect(result).toBe("[田中] Aの発言\n[佐藤] Bの発言");
    });

    it("null タイムスタンプのチャンクは直前の話者を引き継ぐ", () => {
      const chunks: WordChunk[] = [
        { text: "最初 ", timestamp: [0, 1] },
        { text: "継続", timestamp: [null, null] },
      ];
      const events: SpeakerEvent[] = [{ name: "田中", absoluteTime: t0 }];

      expect(buildSpeakerTranscript(chunks, events, t0)).toBe("[田中] 最初 継続");
    });

    it("空白のみのセグメントは出力しない", () => {
      const chunks: WordChunk[] = [
        { text: "   ", timestamp: [0, 1] },
        { text: "発言", timestamp: [5, 6] },
      ];
      const events: SpeakerEvent[] = [
        { name: "田中", absoluteTime: t0 },
        { name: "佐藤", absoluteTime: t0 + 3 * 1000 },
      ];

      const result = buildSpeakerTranscript(chunks, events, t0);
      expect(result).not.toContain("[田中]");
      expect(result).toContain("[佐藤] 発言");
    });

    it("3人以上の話者を正しく分割する", () => {
      const chunks: WordChunk[] = [
        { text: "A ", timestamp: [0, 1] },
        { text: "B ", timestamp: [10, 11] },
        { text: "C", timestamp: [20, 21] },
      ];
      const events: SpeakerEvent[] = [
        { name: "田中", absoluteTime: t0 },
        { name: "佐藤", absoluteTime: t0 + 5 * 1000 },
        { name: "鈴木", absoluteTime: t0 + 15 * 1000 },
      ];

      const result = buildSpeakerTranscript(chunks, events, t0);
      expect(result).toBe("[田中] A\n[佐藤] B\n[鈴木] C");
    });
  });
});
