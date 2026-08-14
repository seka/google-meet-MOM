import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  addChromeRuntimeMessageListener,
  sendChromeRuntimeMessage,
  type ChromeRuntimeListener,
} from "./client";

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime as unknown as Record<string, unknown>).lastError = undefined;
});

describe("sendChromeRuntimeMessage", () => {
  it("Chrome Runtime のレスポンスを返す", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_payload: unknown, callback: (response: unknown) => void) => callback({ ok: true }),
    );

    await expect(sendChromeRuntimeMessage({ type: "TEST" })).resolves.toEqual({ ok: true });
  });

  it("runtime.lastError を Error に変換する", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_payload: unknown, callback: (response: unknown) => void) => {
        (chrome.runtime as unknown as Record<string, unknown>).lastError = {
          message: "受信先がありません",
        };
        callback(undefined);
        (chrome.runtime as unknown as Record<string, unknown>).lastError = undefined;
      },
    );

    await expect(sendChromeRuntimeMessage({ type: "TEST" })).rejects.toThrow("受信先がありません");
  });
});

describe("addChromeRuntimeMessageListener", () => {
  it("listener を Chrome Runtime に登録する", () => {
    const listener: ChromeRuntimeListener = vi.fn();
    const onMessage = chrome.runtime.onMessage as unknown as {
      addListener: ReturnType<typeof vi.fn>;
    };

    addChromeRuntimeMessageListener(listener);

    expect(onMessage.addListener).toHaveBeenCalledWith(listener);
  });
});
