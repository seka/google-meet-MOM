import { afterAll, afterEach, beforeAll, expect, it, vi } from "vite-plus/test";
import type { ChromeRuntimeListener } from "@core/runtime/chrome/client";
import { DEFAULT_SETTINGS } from "@features/settings/types";
import { getRecording } from "../../db";

vi.mock("@core/api/whisper/client", () => ({
  WhisperClient: class {
    async transcribe() {
      return { text: "混合音声のテスト", chunks: [] };
    }
  },
}));

const NativeAudioContext = AudioContext;
const contexts: AudioContext[] = [];
const streams: MediaStream[] = [];
const oscillators: OscillatorNode[] = [];
const listeners: ChromeRuntimeListener[] = [];
const messages: { type: string; payload?: { recordingId?: string } }[] = [];

function createTone(frequency: number): MediaStream {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const destination = context.createMediaStreamDestination();
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.2;
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  oscillators.push(oscillator);
  streams.push(destination.stream);
  return destination.stream;
}

function send(message: unknown): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    for (const listener of listeners)
      listener(message, {}, (value) => resolve(value as { ok: boolean }));
  });
}

function amplitude(samples: Float32Array, sampleRate: number, frequency: number): number {
  // 録音開始直後の揺れを避けるため、0.1〜0.3秒の区間を指定周波数のsin/cosへ射影する。
  // 例えば440Hzを消した録音では440Hz側の振幅が低下し、片方だけの録音を検出できる。
  const start = Math.floor(sampleRate * 0.1);
  const length = Math.floor(sampleRate * 0.2);
  let real = 0;
  let imaginary = 0;
  for (let i = 0; i < length; i++) {
    const phase = (2 * Math.PI * frequency * i) / sampleRate;
    real += samples[start + i] * Math.cos(phase);
    imaginary += samples[start + i] * Math.sin(phase);
  }
  return (2 * Math.hypot(real, imaginary)) / length;
}

function startRecording(recordingStartTime: number) {
  return send({
    type: "FORWARD_TO_OFFSCREEN",
    target: "offscreen",
    payload: {
      streamId: "test-stream",
      meetingTitle: "混合テスト",
      settings: { ...DEFAULT_SETTINGS, chunkIntervalSec: 60 },
      tabId: 42,
      recordingStartTime,
    },
  });
}

function stopRecording(recordingStartTime: number) {
  return send({
    type: "OFFSCREEN_STOP",
    target: "offscreen",
    payload: { speakerEvents: [], recordingStartTime },
  });
}

beforeAll(async () => {
  vi.stubGlobal(
    "AudioContext",
    class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
      }
    },
  );
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => new URL(path, location.href).href,
      onMessage: { addListener: (listener: ChromeRuntimeListener) => listeners.push(listener) },
      sendMessage: (message: (typeof messages)[number], callback: (value?: unknown) => void) => {
        messages.push(message);
        callback();
      },
    },
  });
  await import("../../workers/offscreen/offscreen");
});

afterEach(async () => {
  vi.restoreAllMocks();
  oscillators.splice(0).forEach((oscillator) => oscillator.stop());
  streams.splice(0).forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  await Promise.all(
    contexts
      .splice(0)
      .filter((context) => context.state !== "closed")
      .map((context) => context.close()),
  );
  messages.length = 0;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

it("RNNoise が読み込めなくてもタブ音声とマイク音声を両方保存する", async () => {
  // 前提: タブとマイクは別々の合成音声を返し、Workletの読み込みは失敗させる。
  // チェック内容: 本番offscreen処理で録音・保存し、保存Blobを復号して周波数成分を調べる。
  // 期待値: 両入力は停止まで有効で、停止後にトラックと録音用Contextが閉じる。
  // 保存音声では440Hzと880Hzが各0.05超、入力していない1760Hzは0.03未満となる。
  // 実デバイスの権限やtabCaptureによる音声取得は、このテストでは確認しない。
  const addModule = vi
    .spyOn(AudioWorklet.prototype, "addModule")
    .mockRejectedValue(new Error("Worklet unavailable"));
  const tab = createTone(440);
  const microphone = createTone(880);
  const getUserMedia = vi
    .spyOn(navigator.mediaDevices, "getUserMedia")
    .mockResolvedValueOnce(tab)
    .mockResolvedValueOnce(microphone);
  const started = Date.now();
  expect(await startRecording(started)).toEqual({ ok: true });
  const recordingContext = contexts[2]!;
  expect(tab.getAudioTracks()[0]?.readyState).toBe("live");
  expect(microphone.getAudioTracks()[0]?.readyState).toBe("live");
  expect(addModule).toHaveBeenCalledWith(expect.stringContaining("rnnoise-worklet.js"));
  expect(getUserMedia).toHaveBeenNthCalledWith(1, {
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: "test-stream" } },
    video: false,
  });
  expect(getUserMedia).toHaveBeenNthCalledWith(2, {
    audio: { noiseSuppression: true, echoCancellation: true },
    video: false,
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 750));
  expect(await stopRecording(started)).toEqual({ ok: true });
  expect(tab.getAudioTracks()[0]?.readyState).toBe("ended");
  expect(microphone.getAudioTracks()[0]?.readyState).toBe("ended");
  expect(recordingContext.state).toBe("closed");
  const saved = messages.find((message) => message.type === "RECORDING_SAVED");
  expect(saved?.payload?.recordingId).toBeTruthy();
  const recording = await getRecording(saved!.payload!.recordingId!);
  expect(recording?.transcript).toBe("混合音声のテスト");
  const decoder = new AudioContext();
  const decoded = await decoder.decodeAudioData(await recording!.audioBlob.arrayBuffer());
  expect(decoded.duration).toBeGreaterThanOrEqual(0.3);
  const samples = decoded.getChannelData(0);
  expect(amplitude(samples, decoded.sampleRate, 440)).toBeGreaterThan(0.05);
  expect(amplitude(samples, decoded.sampleRate, 880)).toBeGreaterThan(0.05);
  expect(amplitude(samples, decoded.sampleRate, 1760)).toBeLessThan(0.03);
});

it("マイクの取得に失敗したら先に取得したタブのトラックを停止する", async () => {
  // 前提: タブは取得済みで、マイク取得は拒否される。
  // チェック内容: 本番の開始要求への応答とタブの状態を確認する。
  // 期待値: 元のエラーを返し、タブのトラックは終了する。
  const tab = createTone(440);
  vi.spyOn(navigator.mediaDevices, "getUserMedia")
    .mockResolvedValueOnce(tab)
    .mockRejectedValueOnce(new Error("Microphone denied"));

  expect(await startRecording(Date.now())).toEqual({ ok: false, error: "Microphone denied" });
  expect(tab.getAudioTracks()[0]?.readyState).toBe("ended");
});

it("録音用 AudioContext の close が失敗しても録音を保存する", async () => {
  // 前提: 録音開始後に録音用Contextのcloseだけを失敗させる。
  // チェック内容: 本番の停止要求への応答、入力トラック、IndexedDBの保存音声を確認する。
  // 期待値: 両トラックを停止し、録音データを保存して成功を返す。
  const tab = createTone(440);
  const microphone = createTone(880);
  vi.spyOn(navigator.mediaDevices, "getUserMedia")
    .mockResolvedValueOnce(tab)
    .mockResolvedValueOnce(microphone);
  vi.spyOn(AudioWorklet.prototype, "addModule").mockRejectedValue(new Error("Worklet unavailable"));

  const started = Date.now();
  expect(await startRecording(started)).toEqual({ ok: true });
  const close = vi.spyOn(contexts[2]!, "close").mockRejectedValue(new Error("Close failed"));
  await new Promise<void>((resolve) => setTimeout(resolve, 250));

  expect(await stopRecording(started)).toEqual({ ok: true });
  expect(close).toHaveBeenCalledTimes(1);
  expect(tab.getAudioTracks()[0]?.readyState).toBe("ended");
  expect(microphone.getAudioTracks()[0]?.readyState).toBe("ended");
  const saved = messages.find((message) => message.type === "RECORDING_SAVED");
  expect(saved?.payload?.recordingId).toBeTruthy();
  const recording = await getRecording(saved!.payload!.recordingId!);
  expect(recording?.audioBlob.size).toBeGreaterThan(0);
});
