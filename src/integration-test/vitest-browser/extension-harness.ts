import { vi } from "vite-plus/test";
import type { ChromeRuntimeListener } from "@core/runtime/chrome/client";
import { DEFAULT_SETTINGS } from "@features/settings/types";

export function createExtensionHarness() {
  const listeners: ChromeRuntimeListener[] = [];
  let actionListener: ((tab: chrome.tabs.Tab) => void) | undefined;
  const offscreenMessages: string[] = [];
  let captureError: string | undefined;
  let rejectStateNotification = false;
  const runtime = {
    lastError: undefined as { message: string } | undefined,
    ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
    onMessage: { addListener: (listener: ChromeRuntimeListener) => listeners.push(listener) },
    getContexts: vi.fn().mockResolvedValue([{ contextType: "OFFSCREEN_DOCUMENT" }]),
    openOptionsPage: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn(
      (message: { type: string; target?: string }, callback: (value?: unknown) => void) => {
        if (message.type === "STATE_CHANGED" && rejectStateNotification) {
          rejectStateNotification = false;
          for (const listener of listeners) listener(message, {}, () => {});
          runtime.lastError = {
            message: "The message port closed before a response was received.",
          };
          callback();
          runtime.lastError = undefined;
          return;
        }
        if (message.target === "offscreen") {
          offscreenMessages.push(message.type);
          callback({ ok: true });
          return;
        }
        let responded = false;
        let pending = false;
        const respond = (value?: unknown) => {
          if (responded) return;
          responded = true;
          callback(value);
        };
        for (const listener of listeners) {
          if (listener(message, {}, respond) === true) pending = true;
        }
        // 通知の受信側が応答を返さない場合も成功扱いせず、Chromeの応答エラーを再現する。
        if (!responded && !pending) {
          runtime.lastError = {
            message: "The message port closed before a response was received.",
          };
          respond();
          runtime.lastError = undefined;
        }
      },
    ),
  };
  const downloads = vi.fn(
    (_options: chrome.downloads.DownloadOptions, callback: (id: number) => void) => callback(1),
  );
  const chromeApi = {
    runtime,
    action: {
      onClicked: {
        addListener: (listener: typeof actionListener) => {
          actionListener = listener;
        },
      },
    },
    sidePanel: {
      open: vi.fn().mockResolvedValue(undefined),
      setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    },
    storage: {
      sync: { get: vi.fn().mockResolvedValue(DEFAULT_SETTINGS) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 42 }]),
      sendMessage: vi.fn(
        (_id: number, message: { type: string }, callback?: (value: unknown) => void) => {
          const response =
            message.type === "GET_MEETING_TITLE" ? { title: "テスト会議" } : { speakerEvents: [] };
          callback?.(response);
          return Promise.resolve(response);
        },
      ),
    },
    tabCapture: {
      getMediaStreamId: vi.fn((_options: unknown, callback: (id: string) => void) => {
        runtime.lastError = captureError ? { message: captureError } : undefined;
        callback(captureError ? "" : "test-stream");
        runtime.lastError = undefined;
      }),
    },
    offscreen: {
      Reason: { USER_MEDIA: "USER_MEDIA" },
      createDocument: vi.fn().mockResolvedValue(undefined),
      closeDocument: vi.fn().mockResolvedValue(undefined),
    },
    alarms: { create: vi.fn().mockResolvedValue(undefined), onAlarm: { addListener: vi.fn() } },
    downloads: { download: downloads },
  };
  vi.stubGlobal("chrome", chromeApi);
  return {
    chrome: chromeApi,
    offscreenMessages,
    rejectNextStateNotification: () => {
      rejectStateNotification = true;
    },
    clickAction: () => actionListener?.({ id: 42 } as chrome.tabs.Tab),
    setCaptureError: (message?: string) => {
      captureError = message;
    },
    dispatch: (message: unknown) => {
      for (const listener of listeners) listener(message, {}, () => {});
    },
  };
}
