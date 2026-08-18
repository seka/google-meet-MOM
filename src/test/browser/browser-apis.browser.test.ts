import { describe, expect, it } from "vite-plus/test";
import { RecordingSession } from "@features/recording/models/recording-session";

describe("browser test foundation", () => {
  it("imports application modules and exposes required browser APIs", () => {
    expect(RecordingSession).toBeTypeOf("function");
    expect(AudioContext).toBeTypeOf("function");
    expect(MediaRecorder).toBeTypeOf("function");
  });
});
