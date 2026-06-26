export interface Recording {
  id: string;
  date: string;
  meetingTitle: string;
  duration: number;
  audioBlob: Blob;
  transcript: string;
  minutes: string;
}

export interface ExtensionSettings {
  ollamaUrl: string;
  ollamaModel: string;
  whisperModel: string;
  language: string;
  chunkIntervalSec: number;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.2",
  whisperModel: "onnx-community/whisper-tiny",
  language: "ja",
  chunkIntervalSec: 15,
};

export type RecordingState =
  | "idle"
  | "recording"
  | "transcribing"
  | "summarizing"
  | "done"
  | "error";

export interface SpeakerEvent {
  name: string;
  absoluteTime: number; // Date.now() の絶対タイムスタンプ
}
