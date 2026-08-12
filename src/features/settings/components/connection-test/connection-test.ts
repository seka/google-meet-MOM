import { DEFAULT_SETTINGS } from "../../types";
import {
  testOllamaConnection,
  testWhisperConnection,
} from "@data/api/connection-test-runtime";
import { subscribeTranscriptionEvents } from "@data/api/transcription-runtime";

interface RecordingSession {
  audioCtx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  stream: MediaStream;
  chunks: Float32Array[];
  startedAt: number;
}

export function initializeConnectionTest(): void {
  const ollamaUrl = document.getElementById("ollama-url") as HTMLInputElement;
  const ollamaModel = document.getElementById("ollama-model") as HTMLInputElement;
  const ollamaTestBtn = document.getElementById("ollama-test-btn") as HTMLButtonElement;
  const ollamaTestStatus = document.getElementById("ollama-test-status") as HTMLSpanElement;
  const whisperTestBtn = document.getElementById("whisper-test-btn") as HTMLButtonElement;
  const whisperTestStatus = document.getElementById("whisper-test-status") as HTMLSpanElement;
  const whisperTestResult = document.getElementById("whisper-test-result") as HTMLDivElement;
  const whisperTestOutput = document.getElementById("whisper-test-output") as HTMLDivElement;
  let recordingSession: RecordingSession | null = null;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;

  ollamaTestBtn.addEventListener("click", async () => {
    ollamaTestBtn.disabled = true;
    ollamaTestStatus.textContent = "確認中...";

    try {
      const result = await testOllamaConnection({
        ollamaUrl: ollamaUrl.value.trim() || DEFAULT_SETTINGS.ollamaUrl,
        ollamaModel: ollamaModel.value.trim() || DEFAULT_SETTINGS.ollamaModel,
      });
      ollamaTestStatus.textContent = result?.ok
        ? "接続できました"
        : `エラー: ${result?.error ?? "不明なエラー"}`;
    } catch (err) {
      ollamaTestStatus.textContent = `エラー: ${err instanceof Error ? err.message : String(err)}`;
    }
    ollamaTestBtn.disabled = false;
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
    stream.getTracks().forEach((track) => track.stop());

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
      const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

      const result = await testWhisperConnection({
        audioSamples: Array.from(audioSamples),
        model: settings["whisperModel"],
        language: settings["language"],
      });
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
    } catch (err) {
      whisperTestStatus.textContent = `エラー: ${err instanceof Error ? err.message : String(err)}`;
      whisperTestBtn.textContent = "録音開始";
      whisperTestBtn.disabled = false;
    }
  });

  subscribeTranscriptionEvents({
    progress(progress) {
      whisperTestStatus.textContent = `モデルをダウンロード中... ${Math.round(progress)}%`;
    },
  });
}
