import { DEFAULT_SETTINGS } from "../../types";

const ollamaUrl = document.getElementById("ollama-url") as HTMLInputElement;
const ollamaModel = document.getElementById("ollama-model") as HTMLInputElement;
const whisperModel = document.getElementById("whisper-model") as HTMLSelectElement;
const language = document.getElementById("language") as HTMLSelectElement;
const chunkInterval = document.getElementById("chunk-interval") as HTMLSelectElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const savedMsg = document.getElementById("saved-msg") as HTMLSpanElement;

async function load(): Promise<void> {
  const s = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  ollamaUrl.value = s["ollamaUrl"] as string;
  ollamaModel.value = s["ollamaModel"] as string;
  whisperModel.value = s["whisperModel"] as string;
  language.value = s["language"] as string;
  chunkInterval.value = String(s["chunkIntervalSec"]);
}

saveBtn.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    ollamaUrl: ollamaUrl.value.trim() || DEFAULT_SETTINGS.ollamaUrl,
    ollamaModel: ollamaModel.value.trim() || DEFAULT_SETTINGS.ollamaModel,
    whisperModel: whisperModel.value,
    language: language.value,
    chunkIntervalSec: Number(chunkInterval.value),
  });

  savedMsg.style.display = "inline";
  setTimeout(() => {
    savedMsg.style.display = "none";
  }, 2000);
});

void load();
