import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  notifyChromeRuntime,
  requestChromeRuntime,
  subscribeChromeRuntime,
  type ChromeRuntimeListener,
} from "./client";

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime as unknown as Record<string, unknown>).lastError = undefined;
});

describe("requestChromeRuntime", () => {
  it("Chrome Runtime のレスポンスを返す", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_payload: unknown, callback: (response: unknown) => void) => callback({ ok: true }),
    );

    await expect(requestChromeRuntime({ type: "TEST" })).resolves.toEqual({ ok: true });
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

    await expect(requestChromeRuntime({ type: "TEST" })).rejects.toThrow("受信先がありません");
  });
});

describe("notifyChromeRuntime", () => {
  it("応答を待たずに payload を送信する", () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_payload: unknown, callback: () => void) => callback(),
    );

    notifyChromeRuntime({ type: "TEST" });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: "TEST" },
      expect.any(Function),
    );
  });
});

describe("subscribeChromeRuntime", () => {
  it("listener を Chrome Runtime に登録する", () => {
    const listener: ChromeRuntimeListener = vi.fn();

    subscribeChromeRuntime(listener);

    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(listener);
  });
});
