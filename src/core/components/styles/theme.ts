import { DEFAULT_SETTINGS, type Appearance } from "@features/theme-settings/types";

const APPEARANCES = new Set<Appearance>(["system", "light", "dark"]);

export function normalizeAppearance(value: unknown): Appearance {
  return typeof value === "string" && APPEARANCES.has(value as Appearance)
    ? (value as Appearance)
    : DEFAULT_SETTINGS.appearance;
}

export function applyAppearance(appearance: Appearance): void {
  if (appearance === "system") {
    delete document.documentElement.dataset.theme;
    return;
  }

  document.documentElement.dataset.theme = appearance;
}

export async function loadAndApplyAppearance(): Promise<void> {
  const settings = await chrome.storage.sync.get({ appearance: DEFAULT_SETTINGS.appearance });
  applyAppearance(normalizeAppearance(settings["appearance"]));
}

export function subscribeAppearanceChanges(): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== "sync" || !changes["appearance"]) return;
    applyAppearance(normalizeAppearance(changes["appearance"].newValue));
  };

  chrome.storage.onChanged.addListener(listener);
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
