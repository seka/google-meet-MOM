import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { WhisperClient } from "@core/api/whisper/client";
import { Asr, decodeAndResample } from "./asr";

const decodedAudio = { duration: 0.50001 } as AudioBuffer;
const resampledAudio = new Float32Array([0.1, 0.2, 0.3]);
const sourceBuffer = new ArrayBuffer(8);
const destination = {};
const source = {
  buffer: null as AudioBuffer | null,
  connect: vi.fn(),
  start: vi.fn(),
};
const decodeAudioData = vi.fn();
const startRendering = vi.fn();
const createBufferSource = vi.fn();
const offlineAudioContext = vi.fn();
const clientTranscribe = vi.fn<WhisperClient["transcribe"]>();
const client: WhisperClient = { transcribe: clientTranscribe };
const arrayBuffer = vi.fn();
const blob = { arrayBuffer } as unknown as Blob;

beforeEach(() => {
  vi.clearAllMocks();

  source.buffer = null;
  arrayBuffer.mockResolvedValue(sourceBuffer);
  decodeAudioData.mockResolvedValue(decodedAudio);
  createBufferSource.mockReturnValue(source);
  startRendering.mockResolvedValue({ getChannelData: vi.fn().mockReturnValue(resampledAudio) });
  clientTranscribe.mockResolvedValue({ text: "文字起こし結果", chunks: [] });

  vi.stubGlobal(
    "AudioContext",
    vi.fn(function AudioContextMock() {
      return { decodeAudioData };
    }),
  );
  vi.stubGlobal(
    "OfflineAudioContext",
    offlineAudioContext.mockImplementation(function OfflineAudioContextMock() {
      return { destination, createBufferSource, startRendering };
    }),
  );
});

describe("decodeAndResample", () => {
  it("デコードした音声を 16kHz mono に変換する", async () => {
    await expect(decodeAndResample(blob)).resolves.toBe(resampledAudio);

    expect(decodeAudioData).toHaveBeenCalledWith(sourceBuffer);
    expect(offlineAudioContext).toHaveBeenCalledWith(1, 8001, 16000);
    expect(source.buffer).toBe(decodedAudio);
    expect(source.connect).toHaveBeenCalledWith(destination);
    expect(source.start).toHaveBeenCalledOnce();
  });
});

describe("Asr", () => {
  it("録音中のチャンクをタイムスタンプなしで文字起こしする", async () => {
    const onProgress = vi.fn();
    const asr = new Asr(client);

    await asr.transcribeChunk(blob, {
      model: "whisper-tiny",
      language: "ja",
      onProgress,
    });

    expect(clientTranscribe).toHaveBeenCalledWith(resampledAudio, {
      model: "whisper-tiny",
      language: "ja",
      onProgress,
      returnTimestamps: false,
    });
  });

  it("最終音声を話者ラベル用のタイムスタンプ付きで文字起こしする", async () => {
    const onProgress = vi.fn();
    const asr = new Asr(client);

    await asr.transcribe(blob, {
      model: "whisper-small",
      language: "en",
      onProgress,
    });

    expect(clientTranscribe).toHaveBeenCalledWith(resampledAudio, {
      model: "whisper-small",
      language: "en",
      onProgress,
      returnTimestamps: true,
    });
  });
});
