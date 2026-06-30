import { vi } from "vite-plus/test";

vi.stubGlobal("chrome", {
  runtime: {
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    lastError: undefined,
  },
  tabs: { sendMessage: vi.fn() },
  storage: { sync: { get: vi.fn() } },
});
