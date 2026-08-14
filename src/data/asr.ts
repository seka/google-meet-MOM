import {
  configureWhisperRuntime,
  transcribeWithWhisper,
  type WhisperProgressHandler,
  type WhisperRuntimeOptions,
  type WhisperTranscription,
} from "@core/api/whisper/client";

export type AsrProgressHandler = WhisperProgressHandler;
export type AsrTranscription = WhisperTranscription;

export interface AsrTranscribeOptions {
  model: string;
  language: string;
  onProgress?: AsrProgressHandler;
}

export function configureAsrRuntime(options: WhisperRuntimeOptions): void {
  configureWhisperRuntime(options);
}

export async function decodeAndResample(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * targetSampleRate),
    targetSampleRate,
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();
  const resampled = await offlineCtx.startRendering();
  return resampled.getChannelData(0);
}

export async function transcribeChunk(blob: Blob, options: AsrTranscribeOptions): Promise<string> {
  const audioData = await decodeAndResample(blob);
  const result = await transcribeWithWhisper(audioData, {
    model: options.model,
    language: options.language,
    onProgress: options.onProgress,
    returnTimestamps: false,
  });
  return result.text;
}

export async function transcribe(
  audioBlob: Blob,
  options: AsrTranscribeOptions,
): Promise<AsrTranscription> {
  const audioData = await decodeAndResample(audioBlob);
  return transcribeWithWhisper(audioData, {
    model: options.model,
    language: options.language,
    onProgress: options.onProgress,
    returnTimestamps: true,
  });
}

export async function transcribeSamples(
  audioData: Float32Array,
  options: AsrTranscribeOptions,
): Promise<string> {
  const result = await transcribeWithWhisper(audioData, {
    model: options.model,
    language: options.language,
    onProgress: options.onProgress,
    returnTimestamps: false,
  });
  return result.text;
}
