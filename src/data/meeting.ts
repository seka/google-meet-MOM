import { addChromeRuntimeMessageListener } from "@core/runtime/chrome";

export function subscribeMeetingCommands(handlers: {
  getTitle(): { title: string };
  startSpeakerTracking(recordingStartTime: number): void;
  getSpeakerEvents(): { speakerEvents: Array<{ name: string; absoluteTime: number }> };
}): void {
  addChromeRuntimeMessageListener((message, _sender, respond) => {
    if (typeof message !== "object" || message === null) return false;
    const runtimePayload = message as { type?: string; payload?: unknown };

    if (runtimePayload.type === "GET_MEETING_TITLE") {
      respond(handlers.getTitle());
    } else if (runtimePayload.type === "START_SPEAKER_TRACKING") {
      const payload = runtimePayload.payload as { recordingStartTime: number };
      handlers.startSpeakerTracking(payload.recordingStartTime);
      respond({ ok: true });
    } else if (runtimePayload.type === "GET_SPEAKER_EVENTS") {
      respond(handlers.getSpeakerEvents());
    } else {
      return false;
    }
    return false;
  });
}
