export interface Recording {
  id: string;
  date: string;
  meetingTitle: string;
  duration: number;
  audioBlob: Blob;
  transcript: string;
  minutes: string;
}

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
