import { addChromeRuntimeMessageListener, sendChromeRuntimeMessage } from "@core/runtime/chrome";
import { withDataCommunicationError } from "./error";

type Respond = (response?: unknown) => void;

interface RuntimePayload {
  type?: string;
  target?: string;
  payload?: unknown;
}

function toRuntimePayload(message: unknown): RuntimePayload {
  return typeof message === "object" && message !== null ? (message as RuntimePayload) : {};
}

export function publishTranscriptionProgress(progress: number): Promise<void> {
  return withDataCommunicationError("文字起こし進捗の通知", () =>
    sendChromeRuntimeMessage({ type: "TRANSCRIPTION_PROGRESS", payload: { progress } }),
  );
}

export function publishTranscriptChunk(text: string, chunkIndex: number): Promise<void> {
  return withDataCommunicationError("文字起こしチャンクの通知", () =>
    sendChromeRuntimeMessage({
      type: "TRANSCRIPT_CHUNK",
      target: "background",
      payload: { text, chunkIndex },
    }),
  );
}

export function broadcastTranscriptChunk(text: string, chunkIndex: number): Promise<void> {
  return withDataCommunicationError("文字起こしチャンクの配信", () =>
    sendChromeRuntimeMessage({ type: "TRANSCRIPT_CHUNK", payload: { text, chunkIndex } }),
  );
}

export function publishTranscriptionComplete(
  transcript: string,
  recordingId: string,
): Promise<void> {
  return withDataCommunicationError("文字起こし完了の通知", () =>
    sendChromeRuntimeMessage({
      type: "TRANSCRIPTION_DONE",
      target: "background",
      payload: { transcript, recordingId },
    }),
  );
}

export function publishRuntimeError(message: string): Promise<void> {
  return withDataCommunicationError("実行時エラーの通知", () =>
    sendChromeRuntimeMessage({ type: "ERROR", payload: { message } }),
  );
}

export function subscribeBackgroundTranscriptionEvents(handlers: {
  completed(transcript: string, recordingId: string): void;
  chunk(text: string, chunkIndex: number): void;
  error(message: string): void;
}): void {
  addChromeRuntimeMessageListener((message, _sender, respond) => {
    const runtimePayload = toRuntimePayload(message);
    if (runtimePayload.target === "offscreen") return false;

    switch (runtimePayload.type) {
      case "TRANSCRIPTION_DONE": {
        const payload = runtimePayload.payload as { transcript: string; recordingId: string };
        handlers.completed(payload.transcript, payload.recordingId);
        respond();
        return false;
      }
      case "TRANSCRIPT_CHUNK": {
        const payload = runtimePayload.payload as { text: string; chunkIndex: number };
        handlers.chunk(payload.text, payload.chunkIndex);
        respond();
        return false;
      }
      case "ERROR":
        handlers.error((runtimePayload.payload as { message: string }).message);
        respond();
        return false;
      default:
        return false;
    }
  });
}

export function subscribeTranscriptionEvents(handlers: {
  progress?(progress: number): void;
  chunk?(text: string, chunkIndex: number): void;
  completed?(transcript: string, recordingId: string): void;
}): void {
  addChromeRuntimeMessageListener((message, _sender, respond: Respond) => {
    const runtimePayload = toRuntimePayload(message);
    switch (runtimePayload.type) {
      case "TRANSCRIPTION_PROGRESS":
        if (!handlers.progress) return false;
        handlers.progress((runtimePayload.payload as { progress: number }).progress);
        break;
      case "TRANSCRIPT_CHUNK": {
        if (!handlers.chunk) return false;
        const payload = runtimePayload.payload as { text: string; chunkIndex: number };
        handlers.chunk(payload.text, payload.chunkIndex);
        break;
      }
      case "TRANSCRIPTION_DONE": {
        if (!handlers.completed) return false;
        const payload = runtimePayload.payload as { transcript: string; recordingId: string };
        handlers.completed(payload.transcript, payload.recordingId);
        break;
      }
      default:
        return false;
    }
    respond();
    return false;
  });
}
