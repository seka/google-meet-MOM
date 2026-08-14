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
  desktopCapture: { chooseDesktopMedia: vi.fn() },
  storage: {
    sync: { get: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  downloads: { download: vi.fn() },
  sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
  alarms: {
    create: vi.fn().mockResolvedValue(undefined),
    onAlarm: { addListener: vi.fn() },
  },
  offscreen: {
    createDocument: vi.fn().mockResolvedValue(undefined),
    closeDocument: vi.fn().mockResolvedValue(undefined),
    Reason: { USER_MEDIA: "USER_MEDIA" },
  },
});
