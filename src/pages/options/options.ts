import { DEFAULT_SETTINGS } from "@features/theme-settings/types";
import {
  applyAppearance,
  normalizeAppearance,
  subscribeAppearanceChanges,
} from "../../core/components/styles/theme";

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
const saveRow = document.getElementById("save-row") as HTMLElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const savedMsg = document.getElementById("saved-msg") as HTMLSpanElement;
const ollamaTestBtn = document.getElementById("ollama-test-btn") as HTMLButtonElement;
const ollamaTestStatus = document.getElementById("ollama-test-status") as HTMLSpanElement;
const whisperTestBtn = document.getElementById("whisper-test-btn") as HTMLButtonElement;
const whisperTestStatus = document.getElementById("whisper-test-status") as HTMLSpanElement;
const whisperTestResult = document.getElementById("whisper-test-result") as HTMLDivElement;
const whisperTestOutput = document.getElementById("whisper-test-output") as HTMLDivElement;
const appVersion = document.getElementById("app-version") as HTMLElement;
const navItems = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-screen-target]"));
const screens = Array.from(document.querySelectorAll<HTMLElement>("[data-screen]"));

interface RecordingSession {
  audioCtx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  stream: MediaStream;
  chunks: Float32Array[];
  startedAt: number;
}

let recordingSession: RecordingSession | null = null;
let recordingTimer: ReturnType<typeof setInterval> | null = null;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function load(): Promise<void> {
  const s = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  ollamaUrl.value = s["ollamaUrl"] as string;
  ollamaModel.value = s["ollamaModel"] as string;
  whisperModel.value = s["whisperModel"] as string;
  language.value = s["language"] as string;
  chunkInterval.value = String(s["chunkIntervalSec"]);
  minutesOutputDestination.value = s["minutesOutputDestination"] as string;
  recordingOutputDestination.value = s["recordingOutputDestination"] as string;
  appearance.value = normalizeAppearance(s["appearance"]);
  applyAppearance(normalizeAppearance(s["appearance"]));
  appVersion.textContent = `${chrome.runtime.getManifest().version} (${__BUILD_ID__})`;
}

function showScreen(screenName: string): void {
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.screenTarget === screenName);
  });
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === screenName);
  });
  saveRow.hidden = screenName === "about";
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    showScreen(item.dataset.screenTarget ?? "general");
  });
});

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

ollamaTestBtn.addEventListener("click", () => {
  ollamaTestBtn.disabled = true;
  ollamaTestStatus.textContent = "確認中...";

  chrome.runtime.sendMessage(
    {
      type: "OLLAMA_TEST",
      target: "background",
      payload: {
        ollamaUrl: ollamaUrl.value.trim() || DEFAULT_SETTINGS.ollamaUrl,
        ollamaModel: ollamaModel.value.trim() || DEFAULT_SETTINGS.ollamaModel,
      },
    },
    (result: { ok: boolean; error?: string } | null) => {
      if (result?.ok) {
        ollamaTestStatus.textContent = "接続できました";
      } else {
        ollamaTestStatus.textContent = `エラー: ${result?.error ?? "不明なエラー"}`;
      }
      ollamaTestBtn.disabled = false;
    },
  );
});

function updateRecordingStatus(startedAt: number): void {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  whisperTestStatus.textContent = `録音中... ${elapsed} 秒`;
}

async function startRecordingTest(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);

  recordingSession = { audioCtx, source, processor, stream, chunks, startedAt: Date.now() };
  updateRecordingStatus(recordingSession.startedAt);
  recordingTimer = setInterval(() => {
    if (recordingSession) updateRecordingStatus(recordingSession.startedAt);
  }, 1000);
}

async function stopRecordingTest(): Promise<Float32Array> {
  if (!recordingSession) return new Float32Array();

  const { audioCtx, source, processor, stream, chunks } = recordingSession;
  recordingSession = null;

  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }

  processor.disconnect();
  source.disconnect();
  stream.getTracks().forEach((t) => t.stop());

  const inputLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (inputLength === 0) {
    await audioCtx.close();
    throw new Error("音声を取得できませんでした");
  }

  const input = new Float32Array(inputLength);
  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }

  const buffer = audioCtx.createBuffer(1, input.length, audioCtx.sampleRate);
  buffer.copyToChannel(input, 0);

  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(buffer.duration * targetSampleRate),
    targetSampleRate,
  );
  const resampleSource = offlineCtx.createBufferSource();
  resampleSource.buffer = buffer;
  resampleSource.connect(offlineCtx.destination);
  resampleSource.start();
  const resampled = await offlineCtx.startRendering();
  await audioCtx.close();
  return resampled.getChannelData(0);
}

whisperTestBtn.addEventListener("click", async () => {
  if (!recordingSession) {
    whisperTestBtn.disabled = true;
    whisperTestResult.hidden = true;
    whisperTestOutput.textContent = "";

    try {
      await startRecordingTest();
      whisperTestBtn.textContent = "録音停止";
      whisperTestBtn.disabled = false;
    } catch (err) {
      whisperTestStatus.textContent = `エラー: ${err instanceof Error ? err.message : String(err)}`;
      whisperTestBtn.textContent = "録音開始";
      whisperTestBtn.disabled = false;
    }
    return;
  }

  whisperTestBtn.disabled = true;
  whisperTestStatus.textContent = "文字起こし中...";

  try {
    const audioSamples = await stopRecordingTest();

    const s = await chrome.storage.sync.get(DEFAULT_SETTINGS);

    chrome.runtime.sendMessage(
      {
        type: "WHISPER_TEST",
        target: "background",
        payload: {
          audioSamples: Array.from(audioSamples),
          model: s["whisperModel"],
          language: s["language"],
        },
      },
      (result: { ok: boolean; transcript?: string; error?: string } | null) => {
        if (result?.ok) {
          whisperTestOutput.textContent =
            result.transcript?.trim() || "（音声が認識できませんでした）";
          whisperTestResult.hidden = false;
          whisperTestStatus.textContent = "完了";
        } else {
          whisperTestStatus.textContent = `エラー: ${result?.error ?? "不明なエラー"}`;
        }
        whisperTestBtn.textContent = "録音開始";
        whisperTestBtn.disabled = false;
      },
    );
  } catch (err) {
    whisperTestStatus.textContent = `エラー: ${err instanceof Error ? err.message : String(err)}`;
    whisperTestBtn.textContent = "録音開始";
    whisperTestBtn.disabled = false;
  }
});

chrome.runtime.onMessage.addListener((message: { type: string; payload?: unknown }) => {
  if (message.type === "TRANSCRIPTION_PROGRESS") {
    const { progress } = message.payload as { progress: number };
    whisperTestStatus.textContent = `モデルをダウンロード中... ${Math.round(progress)}%`;
  }
});

subscribeAppearanceChanges();
load().catch((err: unknown) => {
  savedMsg.textContent = `設定を読み込めませんでした: ${toErrorMessage(err)}`;
  savedMsg.style.display = "inline";
});
