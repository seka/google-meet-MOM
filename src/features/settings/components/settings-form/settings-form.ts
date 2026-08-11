import { applyAppearance, normalizeAppearance, subscribeAppearanceChanges } from "../../theme";
import { DEFAULT_SETTINGS } from "../../types";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function initializeSettingsForm(): void {
  const ollamaUrl = document.getElementById("ollama-url") as HTMLInputElement;
  const ollamaModel = document.getElementById("ollama-model") as HTMLInputElement;
  const whisperModel = document.getElementById("whisper-model") as HTMLSelectElement;
  const language = document.getElementById("language") as HTMLSelectElement;
  const chunkInterval = document.getElementById("chunk-interval") as HTMLSelectElement;
  const minutesOutputDestination = document.getElementById(
    "minutes-output-destination",
  ) as HTMLSelectElement;
  const recordingOutputDestination = document.getElementById(
    "recording-output-destination",
  ) as HTMLSelectElement;
  const appearance = document.getElementById("appearance") as HTMLSelectElement;
  const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
  const savedMsg = document.getElementById("saved-msg") as HTMLSpanElement;

  async function load(): Promise<void> {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    ollamaUrl.value = settings["ollamaUrl"] as string;
    ollamaModel.value = settings["ollamaModel"] as string;
    whisperModel.value = settings["whisperModel"] as string;
    language.value = settings["language"] as string;
    chunkInterval.value = String(settings["chunkIntervalSec"]);
    minutesOutputDestination.value = settings["minutesOutputDestination"] as string;
    recordingOutputDestination.value = settings["recordingOutputDestination"] as string;
    appearance.value = normalizeAppearance(settings["appearance"]);
    applyAppearance(normalizeAppearance(settings["appearance"]));
  }

  saveBtn.addEventListener("click", async () => {
    const selectedAppearance = normalizeAppearance(appearance.value);

    await chrome.storage.sync.set({
      ollamaUrl: ollamaUrl.value.trim() || DEFAULT_SETTINGS.ollamaUrl,
      ollamaModel: ollamaModel.value.trim() || DEFAULT_SETTINGS.ollamaModel,
      whisperModel: whisperModel.value,
      language: language.value,
      chunkIntervalSec: Number(chunkInterval.value),
      minutesOutputDestination: minutesOutputDestination.value,
      recordingOutputDestination: recordingOutputDestination.value,
      appearance: selectedAppearance,
    });

    applyAppearance(selectedAppearance);
    savedMsg.textContent = "保存しました";
    savedMsg.style.display = "inline";
    setTimeout(() => {
      savedMsg.style.display = "none";
    }, 2000);
  });

  appearance.addEventListener("change", () => {
    applyAppearance(normalizeAppearance(appearance.value));
  });

  subscribeAppearanceChanges();
  load().catch((err: unknown) => {
    savedMsg.textContent = `設定を読み込めませんでした: ${toErrorMessage(err)}`;
    savedMsg.style.display = "inline";
  });
}
