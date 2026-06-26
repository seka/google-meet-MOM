import type { ExtensionSettings, RecordingState, SpeakerEvent } from "./types";

export type MessageTarget = "background" | "offscreen";

export interface BaseMessage {
  type: string;
  target?: MessageTarget;
}

export interface StartRecordingMsg extends BaseMessage {
  type: "START_RECORDING";
  target: "background";
  payload: { streamId: string; meetingTitle: string; settings: ExtensionSettings; tabId: number };
}

export interface StopRecordingMsg extends BaseMessage {
  type: "STOP_RECORDING";
  target: "background";
}

export interface ForwardToOffscreenMsg extends BaseMessage {
  type: "FORWARD_TO_OFFSCREEN";
  target: "offscreen";
  payload: {
    streamId: string;
    meetingTitle: string;
    settings: ExtensionSettings;
    tabId: number;
    recordingStartTime: number;
  };
}

export interface StartSpeakerTrackingMsg extends BaseMessage {
  type: "START_SPEAKER_TRACKING";
  payload: { recordingStartTime: number };
}

export interface GetSpeakerEventsMsg extends BaseMessage {
  type: "GET_SPEAKER_EVENTS";
}

export interface SpeakerEventsMsg extends BaseMessage {
  type: "SPEAKER_EVENTS";
  payload: { speakerEvents: SpeakerEvent[] };
}

export interface OffscreenStopMsg extends BaseMessage {
  type: "OFFSCREEN_STOP";
  target: "offscreen";
  payload: { speakerEvents: SpeakerEvent[]; recordingStartTime: number };
}

export interface GetStateMsg extends BaseMessage {
  type: "GET_STATE";
}

export interface StateChangedMsg extends BaseMessage {
  type: "STATE_CHANGED";
  payload: { state: RecordingState; recordingId?: string; message?: string; minutes?: string };
}

export interface TranscriptionProgressMsg extends BaseMessage {
  type: "TRANSCRIPTION_PROGRESS";
  payload: { progress: number };
}

export interface TranscriptionDoneMsg extends BaseMessage {
  type: "TRANSCRIPTION_DONE";
  target: "background";
  payload: { transcript: string; recordingId: string };
}

export interface RecordingSavedMsg extends BaseMessage {
  type: "RECORDING_SAVED";
  target: "background";
  payload: { recordingId: string };
}

export interface ErrorMsg extends BaseMessage {
  type: "ERROR";
  payload: { message: string };
}

export interface TranscriptChunkMsg extends BaseMessage {
  type: "TRANSCRIPT_CHUNK";
  target: "background";
  payload: { text: string; chunkIndex: number };
}

export type ExtensionMessage =
  | StartRecordingMsg
  | StopRecordingMsg
  | ForwardToOffscreenMsg
  | OffscreenStopMsg
  | GetStateMsg
  | StateChangedMsg
  | TranscriptionProgressMsg
  | TranscriptionDoneMsg
  | RecordingSavedMsg
  | ErrorMsg
  | StartSpeakerTrackingMsg
  | GetSpeakerEventsMsg
  | SpeakerEventsMsg
  | TranscriptChunkMsg;
