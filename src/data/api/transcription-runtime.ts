import { notifyChromeRuntime, subscribeChromeRuntime } from "@core/runtime/chrome";

type Respond = (response?: unknown) => void;

interface RuntimePayload {
  type?: string;
  target?: string;
  payload?: unknown;
}

function toRuntimePayload(message: unknown): RuntimePayload {
  return typeof message === "object" && message !== null ? (message as RuntimePayload) : {};
}

export function publishTranscriptionProgress(progress: number): void {
  notifyChromeRuntime({ type: "TRANSCRIPTION_PROGRESS", payload: { progress } });
}

export function publishTranscriptChunk(text: string, chunkIndex: number): void {
  notifyChromeRuntime({
    type: "TRANSCRIPT_CHUNK",
    target: "background",
    payload: { text, chunkIndex },
  });
}

export function broadcastTranscriptChunk(text: string, chunkIndex: number): void {
  notifyChromeRuntime({ type: "TRANSCRIPT_CHUNK", payload: { text, chunkIndex } });
}

export function publishTranscriptionComplete(transcript: string, recordingId: string): void {
  notifyChromeRuntime({
    type: "TRANSCRIPTION_DONE",
    target: "background",
    payload: { transcript, recordingId },
  });
}

export function publishRuntimeError(message: string): void {
  notifyChromeRuntime({ type: "ERROR", payload: { message } });
}

export function subscribeBackgroundTranscriptionEvents(handlers: {
  completed(transcript: string, recordingId: string): void;
  chunk(text: string, chunkIndex: number): void;
  error(message: string): void;
}): void {
  subscribeChromeRuntime((message) => {
    const runtimePayload = toRuntimePayload(message);
    if (runtimePayload.target === "offscreen") return false;

    if (runtimePayload.type === "TRANSCRIPTION_DONE") {
      const payload = runtimePayload.payload as { transcript: string; recordingId: string };
      handlers.completed(payload.transcript, payload.recordingId);
      return false;
    }
    if (runtimePayload.type === "TRANSCRIPT_CHUNK") {
      const payload = runtimePayload.payload as { text: string; chunkIndex: number };
      handlers.chunk(payload.text, payload.chunkIndex);
      return false;
    }
    if (runtimePayload.type === "ERROR") {
      handlers.error((runtimePayload.payload as { message: string }).message);
      return false;
    }
    return false;
  });
}

export function subscribeTranscriptionEvents(handlers: {
  progress?(progress: number): void;
  chunk?(text: string, chunkIndex: number): void;
  completed?(transcript: string, recordingId: string): void;
}): void {
  subscribeChromeRuntime((message, _sender, _respond: Respond) => {
    const runtimePayload = toRuntimePayload(message);
    if (runtimePayload.type === "TRANSCRIPTION_PROGRESS" && handlers.progress) {
      handlers.progress((runtimePayload.payload as { progress: number }).progress);
    } else if (runtimePayload.type === "TRANSCRIPT_CHUNK" && handlers.chunk) {
      const payload = runtimePayload.payload as { text: string; chunkIndex: number };
      handlers.chunk(payload.text, payload.chunkIndex);
    } else if (runtimePayload.type === "TRANSCRIPTION_DONE" && handlers.completed) {
      const payload = runtimePayload.payload as { transcript: string; recordingId: string };
      handlers.completed(payload.transcript, payload.recordingId);
    } else {
      return false;
    }
    return false;
  });
}
