import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  addRuntimeMessageListener,
  postRuntimeMessage,
  sendRuntimeMessage,
  type RuntimeMessageListener,
} from "./client";

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime as unknown as Record<string, unknown>).lastError = undefined;
});

describe("sendRuntimeMessage", () => {
  it("Chrome Runtime のレスポンスを返す", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_message: unknown, callback: (response: unknown) => void) => {
        callback({ ok: true });
      },
    );

    await expect(sendRuntimeMessage({ type: "GET_STATE" })).resolves.toEqual({ ok: true });
  });

  it("runtime.lastError を Error に変換する", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_message: unknown, callback: (response: unknown) => void) => {
        (chrome.runtime as unknown as Record<string, unknown>).lastError = {
          message: "受信先がありません",
        };
        callback(undefined);
        (chrome.runtime as unknown as Record<string, unknown>).lastError = undefined;
      },
    );

    await expect(sendRuntimeMessage({ type: "GET_STATE" })).rejects.toThrow(
      "受信先がありません",
    );
  });
});

describe("postRuntimeMessage", () => {
  it("応答を待たずにメッセージを送信する", () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_message: unknown, callback: () => void) => callback(),
    );

    postRuntimeMessage({ type: "GET_STATE" });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: "GET_STATE" },
      expect.any(Function),
    );
  });
});

describe("addRuntimeMessageListener", () => {
  it("listener を Chrome Runtime に登録する", () => {
    const listener: RuntimeMessageListener = vi.fn();

    addRuntimeMessageListener(listener);

    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(listener);
  });
});
