import { DEFAULT_SETTINGS } from "../../types";

const ollamaUrl = document.getElementById("ollama-url") as HTMLInputElement;
const ollamaModel = document.getElementById("ollama-model") as HTMLInputElement;
const whisperModel = document.getElementById("whisper-model") as HTMLSelectElement;
const language = document.getElementById("language") as HTMLSelectElement;
const chunkInterval = document.getElementById("chunk-interval") as HTMLSelectElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const savedMsg = document.getElementById("saved-msg") as HTMLSpanElement;
const whisperTestBtn = document.getElementById("whisper-test-btn") as HTMLButtonElement;
const whisperTestStatus = document.getElementById("whisper-test-status") as HTMLSpanElement;
const whisperTestResult = document.getElementById("whisper-test-result") as HTMLDivElement;
const whisperTestOutput = document.getElementById("whisper-test-output") as HTMLDivElement;

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

async function recordAudio(durationMs: number): Promise<Float32Array> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  const chunks: Blob[] = [];

  const blob = await new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: "audio/webm;codecs=opus" }));
    };
    recorder.onerror = () => reject(new Error("録音に失敗しました"));
    recorder.start();
    setTimeout(() => recorder.stop(), durationMs);
  });

  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * targetSampleRate),
    targetSampleRate,
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();
  const resampled = await offlineCtx.startRendering();
  return resampled.getChannelData(0);
}

whisperTestBtn.addEventListener("click", async () => {
  whisperTestBtn.disabled = true;
  whisperTestResult.hidden = true;
  whisperTestOutput.textContent = "";

  let countdown = 3;
  whisperTestStatus.textContent = `録音中... あと ${countdown} 秒`;
  const timer = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      whisperTestStatus.textContent = `録音中... あと ${countdown} 秒`;
    }
  }, 1000);

  try {
    const audioSamples = await recordAudio(3000);
    clearInterval(timer);

    whisperTestStatus.textContent = "文字起こし中...";
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
        whisperTestBtn.disabled = false;
      },
    );
  } catch (err) {
    clearInterval(timer);
    whisperTestStatus.textContent = `エラー: ${err instanceof Error ? err.message : String(err)}`;
    whisperTestBtn.disabled = false;
  }
});

chrome.runtime.onMessage.addListener((message: { type: string; payload?: unknown }) => {
  if (message.type === "TRANSCRIPTION_PROGRESS") {
    const { progress } = message.payload as { progress: number };
    whisperTestStatus.textContent = `モデルをダウンロード中... ${Math.round(progress)}%`;
  }
});

void load();
