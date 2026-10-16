import { describe, expect, it, vi } from "vite-plus/test";
import { subscribeOffscreenRecordingCommands } from "./recording";

describe("subscribeOffscreenRecordingCommands", () => {
  it("offscreenの準備確認へ応答する", () => {
    const start = vi.fn();
    const stop = vi.fn();
    const handlers: Parameters<typeof subscribeOffscreenRecordingCommands>[0] = {
      start,
      stop,
    };
    let listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] | undefined;
    (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (registeredListener) => {
        listener = registeredListener;
      },
    );
    const respond = vi.fn();

    subscribeOffscreenRecordingCommands(handlers);
    const keepChannelOpen = listener?.(
      { type: "OFFSCREEN_RECORDING_READY", target: "offscreen" },
      {} as chrome.runtime.MessageSender,
      respond,
    );

    expect(keepChannelOpen).toBe(false);
    expect(respond).toHaveBeenCalledWith({ ok: true });
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
});
