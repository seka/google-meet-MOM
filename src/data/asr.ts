import {
  type TranscriberClient,
  type Transcription,
  type TranscriptionProgressHandler,
} from "@core/api/transcriber_client";

export type AsrProgressHandler = TranscriptionProgressHandler;
export type AsrTranscription = Transcription;

export interface AsrTranscribeOptions {
  model: string;
  language: string;
  onProgress?: AsrProgressHandler;
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

export class Asr {
  constructor(private readonly client: TranscriberClient) {}

  async transcribeChunk(blob: Blob, options: AsrTranscribeOptions): Promise<string> {
    const audioData = await decodeAndResample(blob);
    const result = await this.client.transcribe(audioData, {
      ...options,
      returnTimestamps: false,
    });
    return result.text;
  }

  async transcribe(audioBlob: Blob, options: AsrTranscribeOptions): Promise<AsrTranscription> {
    const audioData = await decodeAndResample(audioBlob);
    return this.client.transcribe(audioData, {
      ...options,
      returnTimestamps: true,
    });
  }

  async transcribeSamples(audioData: Float32Array, options: AsrTranscribeOptions): Promise<string> {
    const result = await this.client.transcribe(audioData, {
      ...options,
      returnTimestamps: false,
    });
    return result.text;
  }
}
