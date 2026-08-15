import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  configureAsrRuntime,
  decodeAndResample,
  transcribe,
  transcribeChunk,
  transcribeSamples,
} from "./asr";

const whisperMocks = vi.hoisted(() => ({
  configureWhisperRuntime: vi.fn(),
  transcribeWithWhisper: vi.fn(),
}));

vi.mock("@core/api/whisper/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/api/whisper/client")>()),
  configureWhisperRuntime: whisperMocks.configureWhisperRuntime,
  transcribeWithWhisper: whisperMocks.transcribeWithWhisper,
}));

const decodedAudio = { duration: 0.5 } as AudioBuffer;
const resampledAudio = new Float32Array([0.1, 0.2, 0.3]);
const decodeAudioData = vi.fn();
const connect = vi.fn();
const start = vi.fn();
const startRendering = vi.fn();
const createBufferSource = vi.fn();
const offlineAudioContext = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  decodeAudioData.mockResolvedValue(decodedAudio);
  startRendering.mockResolvedValue({ getChannelData: vi.fn().mockReturnValue(resampledAudio) });
  createBufferSource.mockReturnValue({ buffer: null, connect, start });

  vi.stubGlobal(
    "AudioContext",
    vi.fn(function AudioContextMock() {
      return { decodeAudioData };
    }),
  );
  vi.stubGlobal(
    "OfflineAudioContext",
    offlineAudioContext.mockImplementation(function OfflineAudioContextMock() {
      return {
        destination: {},
        createBufferSource,
        startRendering,
      };
    }),
  );
});

describe("configureAsrRuntime", () => {
  it("Whisper の実行環境を設定する", () => {
    const options = { wasmPaths: "/wasm/", localModelPath: "/models/" };

    configureAsrRuntime(options);

    expect(whisperMocks.configureWhisperRuntime).toHaveBeenCalledWith(options);
  });
});

describe("decodeAndResample", () => {
  it("音声を 16kHz mono に変換する", async () => {
    const sourceBuffer = new ArrayBuffer(8);
    const blob = { arrayBuffer: vi.fn().mockResolvedValue(sourceBuffer) } as unknown as Blob;

    await expect(decodeAndResample(blob)).resolves.toBe(resampledAudio);

    expect(decodeAudioData).toHaveBeenCalledWith(sourceBuffer);
    expect(offlineAudioContext).toHaveBeenCalledWith(1, 8000, 16000);
    expect(connect).toHaveBeenCalled();
    expect(start).toHaveBeenCalled();
  });
});

describe("transcribeChunk", () => {
  it("タイムスタンプなしで Whisper を呼び出し、テキストを返す", async () => {
    const onProgress = vi.fn();
    const blob = { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) } as unknown as Blob;
    whisperMocks.transcribeWithWhisper.mockResolvedValue({ text: "チャンク", chunks: [] });

    await expect(
      transcribeChunk(blob, { model: "whisper-tiny", language: "ja", onProgress }),
    ).resolves.toBe("チャンク");

    expect(whisperMocks.transcribeWithWhisper).toHaveBeenCalledWith(resampledAudio, {
      model: "whisper-tiny",
      language: "ja",
      onProgress,
      returnTimestamps: false,
    });
  });
});

describe("transcribe", () => {
  it("タイムスタンプ付きで Whisper の結果を返す", async () => {
    const blob = { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) } as unknown as Blob;
    const result = {
      text: "最終結果",
      chunks: [{ text: "最終結果", timestamp: [0, 1] as [number, number] }],
    };
    whisperMocks.transcribeWithWhisper.mockResolvedValue(result);

    await expect(transcribe(blob, { model: "whisper-small", language: "en" })).resolves.toBe(
      result,
    );

    expect(whisperMocks.transcribeWithWhisper).toHaveBeenCalledWith(resampledAudio, {
      model: "whisper-small",
      language: "en",
      onProgress: undefined,
      returnTimestamps: true,
    });
  });
});

describe("transcribeSamples", () => {
  it("入力サンプルとオプションを Whisper に渡す", async () => {
    const samples = new Float32Array([0.25, -0.25]);
    const onProgress = vi.fn();
    whisperMocks.transcribeWithWhisper.mockResolvedValue({ text: "サンプル", chunks: [] });

    await expect(
      transcribeSamples(samples, { model: "whisper-tiny", language: "ja", onProgress }),
    ).resolves.toBe("サンプル");

    expect(whisperMocks.transcribeWithWhisper).toHaveBeenCalledWith(samples, {
      model: "whisper-tiny",
      language: "ja",
      onProgress,
      returnTimestamps: false,
    });
  });

  it("Whisper のエラーを呼び出し元へ返す", async () => {
    whisperMocks.transcribeWithWhisper.mockRejectedValue(new Error("モデルを読み込めません"));

    await expect(
      transcribeSamples(new Float32Array(), { model: "missing", language: "ja" }),
    ).rejects.toThrow("モデルを読み込めません");
  });
});
