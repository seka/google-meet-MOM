export type TranscriptionChunk = {
  text: string;
  timestamp: [number, number] | [null, null];
};

export type TranscriptionProgressHandler = (progress: number) => void;

export interface TranscribeOptions {
  model: string;
  language: string;
  returnTimestamps: boolean;
  onProgress?: TranscriptionProgressHandler;
}

export interface Transcription {
  text: string;
  chunks: TranscriptionChunk[];
}

export interface TranscriberClient {
  transcribe(audioData: Float32Array, options: TranscribeOptions): Promise<Transcription>;
}
