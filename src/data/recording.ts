import { addChromeRuntimeMessageListener, sendChromeRuntimeMessage } from "@core/runtime/chrome";
import { withDataCommunicationError } from "./error";

export type RuntimeRecordingState =
  | "idle"
  | "recording"
  | "transcribing"
  | "summarizing"
  | "done"
  | "error";

export interface RuntimeRecordingSettings {
  ollamaUrl: string;
  ollamaModel: string;
  whisperModel: string;
  language: string;
  chunkIntervalSec: number;
  minutesOutputDestination: "local" | "download";
  recordingOutputDestination: "local" | "download";
  appearance: "system" | "light" | "dark";
}

export interface RuntimeSpeakerEvent {
  name: string;
  absoluteTime: number;
}

export interface StartRecordingInput {
  streamId: string;
  meetingTitle: string;
  settings: RuntimeRecordingSettings;
  tabId: number;
}

export interface StartOffscreenRecordingInput extends StartRecordingInput {
  streamId: string;
  recordingStartTime: number;
}

export interface StopOffscreenRecordingInput {
  speakerEvents: RuntimeSpeakerEvent[];
  recordingStartTime: number;
}

export interface RecordingStateSnapshot {
  state: RuntimeRecordingState;
  recordingId?: string;
}

export interface RecordingStateEvent extends RecordingStateSnapshot {
  message?: string;
  minutes?: string;
}

export interface RuntimeResult {
  ok: boolean;
  error?: string;
}

type Respond = (response?: unknown) => void;

interface RuntimePayload {
  type?: string;
  target?: string;
  payload?: unknown;
}

function toRuntimePayload(message: unknown): RuntimePayload {
  return typeof message === "object" && message !== null ? (message as RuntimePayload) : {};
}

export function startRecording(input: StartRecordingInput): Promise<RuntimeResult | null> {
  return withDataCommunicationError("録音の開始", () =>
    sendChromeRuntimeMessage<RuntimeResult | null>({
      type: "START_RECORDING",
      target: "background",
      payload: input,
    }),
  );
}

export function stopRecording(): Promise<RuntimeResult | null> {
  return withDataCommunicationError("録音の停止", () =>
    sendChromeRuntimeMessage<RuntimeResult | null>({
      type: "STOP_RECORDING",
      target: "background",
    }),
  );
}

export function getRecordingState(): Promise<RecordingStateSnapshot | null> {
  return withDataCommunicationError("録音状態の取得", () =>
    sendChromeRuntimeMessage<RecordingStateSnapshot | null>({ type: "GET_STATE" }),
  );
}

export function publishRecordingState(event: RecordingStateEvent): Promise<void> {
  return withDataCommunicationError("録音状態の通知", () =>
    sendChromeRuntimeMessage({ type: "STATE_CHANGED", payload: event }),
  );
}

export function startOffscreenRecording(
  input: StartOffscreenRecordingInput,
): Promise<RuntimeResult | null> {
  return withDataCommunicationError("Offscreen録音の開始", () =>
    sendChromeRuntimeMessage<RuntimeResult | null>({
      type: "FORWARD_TO_OFFSCREEN",
      target: "offscreen",
      payload: input,
    }),
  );
}

export function stopOffscreenRecording(
  input: StopOffscreenRecordingInput,
): Promise<RuntimeResult | null> {
  return withDataCommunicationError("Offscreen録音の停止", () =>
    sendChromeRuntimeMessage<RuntimeResult | null>({
      type: "OFFSCREEN_STOP",
      target: "offscreen",
      payload: input,
    }),
  );
}

export function publishRecordingSaved(recordingId: string): Promise<void> {
  return withDataCommunicationError("録音保存の通知", () =>
    sendChromeRuntimeMessage({
      type: "RECORDING_SAVED",
      target: "background",
      payload: { recordingId },
    }),
  );
}

export function subscribeBackgroundRecordingCommands(handlers: {
  start(input: StartRecordingInput, respond: Respond): void;
  stop(respond: Respond): void;
  getState(respond: Respond): void;
  recordingSaved(recordingId: string): void;
}): void {
  addChromeRuntimeMessageListener((message, _sender, respond) => {
    const runtimePayload = toRuntimePayload(message);
    if (runtimePayload.target === "offscreen") return false;

    if (runtimePayload.type === "START_RECORDING") {
      handlers.start(runtimePayload.payload as StartRecordingInput, respond);
      return true;
    }
    if (runtimePayload.type === "STOP_RECORDING") {
      handlers.stop(respond);
      return true;
    }
    if (runtimePayload.type === "GET_STATE") {
      handlers.getState(respond);
      return true;
    }
    if (runtimePayload.type === "RECORDING_SAVED") {
      handlers.recordingSaved((runtimePayload.payload as { recordingId: string }).recordingId);
      respond();
      return false;
    }
    return false;
  });
}

export function subscribeOffscreenRecordingCommands(handlers: {
  start(input: StartOffscreenRecordingInput, respond: Respond): void;
  stop(input: StopOffscreenRecordingInput, respond: Respond): void;
}): void {
  addChromeRuntimeMessageListener((message, _sender, respond) => {
    const runtimePayload = toRuntimePayload(message);
    if (runtimePayload.target !== "offscreen") return false;

    if (runtimePayload.type === "FORWARD_TO_OFFSCREEN") {
      handlers.start(runtimePayload.payload as StartOffscreenRecordingInput, respond);
      return true;
    }
    if (runtimePayload.type === "OFFSCREEN_STOP") {
      handlers.stop(runtimePayload.payload as StopOffscreenRecordingInput, respond);
      return true;
    }
    return false;
  });
}

export function subscribeRecordingStateChanged(
  listener: (event: RecordingStateEvent) => void,
): void {
  addChromeRuntimeMessageListener((message, _sender, respond) => {
    const runtimePayload = toRuntimePayload(message);
    if (runtimePayload.type !== "STATE_CHANGED") return false;
    listener(runtimePayload.payload as RecordingStateEvent);
    respond();
    return false;
  });
}
