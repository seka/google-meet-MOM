import { addChromeRuntimeMessageListener } from "@core/runtime/chrome";

export function subscribeMeetingCommands(handlers: {
  getTitle(): { title: string };
  startSpeakerTracking(recordingStartTime: number): void;
  getSpeakerEvents(): { speakerEvents: Array<{ name: string; absoluteTime: number }> };
}): void {
  addChromeRuntimeMessageListener((message, _sender, respond) => {
    if (typeof message !== "object" || message === null) return false;
    const runtimePayload = message as { type?: string; payload?: unknown };

    switch (runtimePayload.type) {
      case "GET_MEETING_TITLE":
        respond(handlers.getTitle());
        return false;
      case "START_SPEAKER_TRACKING": {
        const payload = runtimePayload.payload as { recordingStartTime: number };
        handlers.startSpeakerTracking(payload.recordingStartTime);
        respond({ ok: true });
        return false;
      }
      case "GET_SPEAKER_EVENTS":
        respond(handlers.getSpeakerEvents());
        return false;
      default:
        return false;
    }
  });
}
