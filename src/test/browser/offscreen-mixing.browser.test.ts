import { afterAll, expect, it, vi } from "vite-plus/test";
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

afterAll(async () => {
  vi.restoreAllMocks();
  oscillators.forEach((oscillator) => oscillator.stop());
  streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  await Promise.all(contexts.map((context) => context.close()));
  vi.unstubAllGlobals();
});

it("本番offscreen処理がタブ音声440Hzとマイク音声880Hzを両方保存する", async () => {
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
  const tab = createTone(440);
  const microphone = createTone(880);
  const getUserMedia = vi
    .spyOn(navigator.mediaDevices, "getUserMedia")
    .mockResolvedValueOnce(tab)
    .mockResolvedValueOnce(microphone);
  await import("../../workers/offscreen/offscreen");
  const started = Date.now();
  expect(
    await send({
      type: "FORWARD_TO_OFFSCREEN",
      target: "offscreen",
      payload: {
        streamId: "test-stream",
        meetingTitle: "混合テスト",
        settings: { ...DEFAULT_SETTINGS, chunkIntervalSec: 60 },
        tabId: 42,
        recordingStartTime: started,
      },
    }),
  ).toEqual({ ok: true });
  expect(getUserMedia).toHaveBeenNthCalledWith(1, {
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: "test-stream" } },
    video: false,
  });
  expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: true, video: false });
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  expect(
    await send({
      type: "OFFSCREEN_STOP",
      target: "offscreen",
      payload: { speakerEvents: [], recordingStartTime: started },
    }),
  ).toEqual({ ok: true });
  const saved = messages.find((message) => message.type === "RECORDING_SAVED");
  expect(saved?.payload?.recordingId).toBeTruthy();
  const recording = await getRecording(saved!.payload!.recordingId!);
  expect(recording?.transcript).toBe("混合音声のテスト");
  const decoder = new AudioContext();
  const decoded = await decoder.decodeAudioData(await recording!.audioBlob.arrayBuffer());
  expect(decoded.duration).toBeGreaterThan(0.3);
  const samples = decoded.getChannelData(0);
  expect(amplitude(samples, decoded.sampleRate, 440)).toBeGreaterThan(0.05);
  expect(amplitude(samples, decoded.sampleRate, 880)).toBeGreaterThan(0.05);
  expect(amplitude(samples, decoded.sampleRate, 1760)).toBeLessThan(0.03);
});
