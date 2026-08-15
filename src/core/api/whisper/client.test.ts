import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createWhisperClient } from "./client";

type TestAsrPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;
type TestPipelineFactory = (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<TestAsrPipeline>;

const transformers = vi.hoisted(() => ({
  env: {
    backends: { onnx: { wasm: { numThreads: 0, wasmPaths: "" } } },
    allowLocalModels: false,
    localModelPath: "",
  },
  pipeline: vi.fn<TestPipelineFactory>(),
}));

vi.mock("@huggingface/transformers", () => transformers);

const runtimeOptions = {
  wasmPaths: "/vendor/transformers/",
  localModelPath: "/models/",
};

const baseRunOptions = {
  model: "whisper-tiny",
  language: "ja",
  returnTimestamps: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  transformers.env.backends.onnx.wasm.numThreads = 0;
  transformers.env.backends.onnx.wasm.wasmPaths = "";
  transformers.env.allowLocalModels = false;
  transformers.env.localModelPath = "";
});

describe("createWhisperClient", () => {
  it("Whisper の実行環境を初期化する", () => {
    createWhisperClient(runtimeOptions);

    expect(transformers.env.backends.onnx.wasm).toEqual({
      numThreads: 1,
      wasmPaths: "/vendor/transformers/",
    });
    expect(transformers.env.allowLocalModels).toBe(true);
    expect(transformers.env.localModelPath).toBe("/models/");
  });

  it.each([
    ["ja", "japanese"],
    ["en", "english"],
  ])("言語指定 %s を Transformers.js の %s へ変換する", async (language, expected) => {
    const asrPipeline = vi.fn<TestAsrPipeline>().mockResolvedValue({ text: "result", chunks: [] });
    transformers.pipeline.mockResolvedValue(asrPipeline);
    const client = createWhisperClient(runtimeOptions);
    const audio = new Float32Array([0.1]);

    await client.transcribe(audio, { ...baseRunOptions, language });

    expect(asrPipeline).toHaveBeenCalledWith(audio, {
      language: expected,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
  });

  it("タイムスタンプが必要な場合だけ return_timestamps を指定する", async () => {
    const asrPipeline = vi.fn<TestAsrPipeline>().mockResolvedValue({ text: "result", chunks: [] });
    transformers.pipeline.mockResolvedValue(asrPipeline);
    const client = createWhisperClient(runtimeOptions);
    const audio = new Float32Array();

    await client.transcribe(audio, { ...baseRunOptions, returnTimestamps: false });
    await client.transcribe(audio, { ...baseRunOptions, returnTimestamps: true });

    expect(asrPipeline.mock.calls[0]?.[1]).not.toHaveProperty("return_timestamps");
    expect(asrPipeline.mock.calls[1]?.[1]).toMatchObject({ return_timestamps: true });
  });

  it("同じモデルを使う間は pipeline を再利用する", async () => {
    const asrPipeline = vi.fn<TestAsrPipeline>().mockResolvedValue({ text: "result", chunks: [] });
    transformers.pipeline.mockResolvedValue(asrPipeline);
    const client = createWhisperClient(runtimeOptions);

    await client.transcribe(new Float32Array(), baseRunOptions);
    await client.transcribe(new Float32Array(), baseRunOptions);

    expect(transformers.pipeline).toHaveBeenCalledOnce();
    expect(asrPipeline).toHaveBeenCalledTimes(2);
  });

  it("モデルが変わると pipeline を再生成する", async () => {
    transformers.pipeline
      .mockResolvedValueOnce(
        vi.fn<TestAsrPipeline>().mockResolvedValue({ text: "tiny", chunks: [] }),
      )
      .mockResolvedValueOnce(
        vi.fn<TestAsrPipeline>().mockResolvedValue({ text: "small", chunks: [] }),
      );
    const client = createWhisperClient(runtimeOptions);

    await client.transcribe(new Float32Array(), baseRunOptions);
    await client.transcribe(new Float32Array(), { ...baseRunOptions, model: "whisper-small" });

    expect(transformers.pipeline).toHaveBeenNthCalledWith(
      1,
      "automatic-speech-recognition",
      "whisper-tiny",
      expect.objectContaining({ dtype: "q8" }),
    );
    expect(transformers.pipeline).toHaveBeenNthCalledWith(
      2,
      "automatic-speech-recognition",
      "whisper-small",
      expect.objectContaining({ dtype: "q8" }),
    );
  });

  it("pipeline の状態を client 間で共有しない", async () => {
    transformers.pipeline.mockResolvedValue(
      vi.fn<TestAsrPipeline>().mockResolvedValue({ text: "result", chunks: [] }),
    );
    const firstClient = createWhisperClient(runtimeOptions);
    const secondClient = createWhisperClient(runtimeOptions);

    await firstClient.transcribe(new Float32Array(), baseRunOptions);
    await secondClient.transcribe(new Float32Array(), baseRunOptions);

    expect(transformers.pipeline).toHaveBeenCalledTimes(2);
  });

  it("モデルロードの進捗だけを呼び出し元へ通知する", async () => {
    const onProgress = vi.fn();
    transformers.pipeline.mockResolvedValue(
      vi.fn<TestAsrPipeline>().mockResolvedValue({ text: "result", chunks: [] }),
    );
    const client = createWhisperClient(runtimeOptions);

    await client.transcribe(new Float32Array(), { ...baseRunOptions, onProgress });
    const loadOptions = transformers.pipeline.mock.calls[0]?.[2] as {
      progress_callback: (info: Record<string, unknown>) => void;
    };
    loadOptions.progress_callback({ status: "initiate", progress: 10 });
    loadOptions.progress_callback({ status: "progress", progress: 75 });

    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(75);
  });

  it("配列形式の結果を単一結果へ正規化する", async () => {
    transformers.pipeline.mockResolvedValue(
      vi.fn<TestAsrPipeline>().mockResolvedValue([{ text: "first" }, { text: "second" }]),
    );
    const client = createWhisperClient(runtimeOptions);

    await expect(client.transcribe(new Float32Array(), baseRunOptions)).resolves.toEqual({
      text: "first",
      chunks: [],
    });
  });
});
