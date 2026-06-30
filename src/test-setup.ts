import { vi } from "vite-plus/test";

vi.stubGlobal("chrome", {
  runtime: {
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    getContexts: vi.fn().mockResolvedValue([]),
    lastError: undefined,
    ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
  },
  tabCapture: { getMediaStreamId: vi.fn() },
  storage: { sync: { get: vi.fn() } },
  sidePanel: { setPanelBehavior: vi.fn() },
  alarms: {
    create: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  offscreen: {
    createDocument: vi.fn().mockResolvedValue(undefined),
    closeDocument: vi.fn().mockResolvedValue(undefined),
    Reason: { USER_MEDIA: "USER_MEDIA" },
  },
});
