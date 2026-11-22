import { afterAll, beforeEach, expect, it, vi } from "vite-plus/test";

type WorkletProcessor = new () => {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};

const rnnoise = vi.hoisted(() => ({
  HEAPF32: new Float32Array(481),
  _malloc: vi.fn(() => 4),
  _rnnoise_create: vi.fn(() => 1),
  _rnnoise_process_frame: vi.fn<(state: number, output: number, input: number) => number>(),
}));

vi.mock("@jitsi/rnnoise-wasm/dist/rnnoise-sync.js", () => ({
  default: () => rnnoise,
}));

const registerProcessor = vi.fn<(name: string, processor: WorkletProcessor) => void>();

beforeEach(async () => {
  vi.resetModules();
  rnnoise.HEAPF32.fill(0);
  rnnoise._rnnoise_process_frame.mockReset();
  registerProcessor.mockClear();
  vi.stubGlobal("AudioWorkletProcessor", class {});
  vi.stubGlobal("registerProcessor", registerProcessor);
  await import("./rnnoise-worklet");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

it("128サンプルの入力を480サンプルずつ処理し、処理済みの音声を順に出力する", () => {
  // 前提: Web Audio から128サンプルずつ入力し、RNNoiseの代わりに各サンプルを半分にする。
  // チェック内容: フレームが揃った時点のPCM入力と、ブロックをまたぐ出力を確認する。
  // 期待値: 480サンプルずつ処理し、先頭の480サンプルは無音、その後は処理結果が入力順に続く。
  expect(registerProcessor).toHaveBeenCalledExactlyOnceWith("rnnoise", expect.any(Function));
  const [, Processor] = registerProcessor.mock.calls[0]!;
  const processor = new Processor();
  const frames: Float32Array[] = [];
  rnnoise._rnnoise_process_frame.mockImplementation(() => {
    const pcm = rnnoise.HEAPF32.subarray(1);
    frames.push(pcm.slice());
    pcm.forEach((sample, index) => {
      pcm[index] = sample / 2;
    });
    return 0;
  });
  const input = Float32Array.from({ length: 1024 }, (_, index) => (index + 1) / 2048);
  const output = new Float32Array(input.length);

  for (let offset = 0; offset < input.length; offset += 128) {
    const inputBlock = input.subarray(offset, offset + 128);
    const outputBlock = output.subarray(offset, offset + 128);
    expect(processor.process([[inputBlock]], [[outputBlock]])).toBe(true);
    expect(frames).toHaveLength(Math.floor((offset + 128) / 480));
  }

  expect(rnnoise._rnnoise_process_frame).toHaveBeenCalledTimes(2);
  expect(rnnoise._rnnoise_process_frame).toHaveBeenCalledWith(1, 4, 4);
  expect(frames[0]).toEqual(input.slice(0, 480).map((sample) => sample * 32768));
  expect(frames[1]).toEqual(input.slice(480, 960).map((sample) => sample * 32768));
  expect(output.slice(0, 480)).toEqual(new Float32Array(480));
  expect(output.slice(480)).toEqual(input.slice(0, 544).map((sample) => sample / 2));
});

it.each([
  ["状態の作成", rnnoise._rnnoise_create],
  ["音声バッファの確保", rnnoise._malloc],
])("%sに失敗した場合は初期化エラーを投げる", (_operation, allocate) => {
  // 前提: WASM側の初期化処理の一つがnullポインターを返す。
  // チェック内容: 登録されたWorkletを生成する。
  // 期待値: 初期化エラーを投げ、無効な状態で処理を始めない。
  const [, Processor] = registerProcessor.mock.calls[0]!;
  allocate.mockReturnValueOnce(0);

  expect(() => new Processor()).toThrow("RNNoise の音声処理を初期化できませんでした");
});
