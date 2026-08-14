import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  applyAppearance,
  loadAndApplyAppearance,
  normalizeAppearance,
  subscribeAppearanceChanges,
} from "./theme";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  vi.clearAllMocks();
});

describe("normalizeAppearance", () => {
  it.each(["system", "light", "dark"] as const)("%s を受け入れる", (appearance) => {
    expect(normalizeAppearance(appearance)).toBe(appearance);
  });

  it("不正な値をデフォルト値に戻す", () => {
    expect(normalizeAppearance("unknown")).toBe("system");
  });
});

describe("applyAppearance", () => {
  it("テーマをdata属性へ設定する", () => {
    applyAppearance("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("systemではdata属性を削除する", () => {
    document.documentElement.dataset.theme = "light";

    applyAppearance("system");

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe("loadAndApplyAppearance", () => {
  it("sync storageからテーマを読み込んで適用する", async () => {
    const syncStorage = chrome.storage.sync as unknown as {
      get: ReturnType<typeof vi.fn>;
    };
    syncStorage.get.mockResolvedValue({ appearance: "dark" });

    await loadAndApplyAppearance();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("subscribeAppearanceChanges", () => {
  it("購読解除関数でlistenerを削除する", () => {
    const onChanged = chrome.storage.onChanged as unknown as {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
    const unsubscribe = subscribeAppearanceChanges();
    const listener = onChanged.addListener.mock.calls[0]?.[0];

    unsubscribe();

    expect(onChanged.removeListener).toHaveBeenCalledWith(listener);
  });
});
