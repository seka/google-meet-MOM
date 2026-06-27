import { env, pipeline } from "@huggingface/transformers";
import { saveRecording, updateRecording } from "../../db";
import type { ExtensionMessage } from "../../messages";
import type { ExtensionSettings, SpeakerEvent } from "../../types";

// SharedArrayBuffer なしで動作させるためシングルスレッドに固定
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

type WordChunk = { text: string; timestamp: [number, number] | [null, null] };
type ASRResult = { text: string; chunks?: WordChunk[] };
type ASRPipeline = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<ASRResult | ASRResult[]>;

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let whisperPipeline: ASRPipeline | null = null;
let currentMeetingTitle = "Google Meet";

// チャンク処理の状態
let processedChunkCount = 0;
let isProcessingChunk = false;
let chunkIntervalId: ReturnType<typeof setInterval> | null = null;
let pendingSettings: ExtensionSettings | null = null;

async function loadWhisper(model: string): Promise<ASRPipeline> {
  if (!whisperPipeline) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    whisperPipeline = (await (pipeline as any)("automatic-speech-recognition", model, {
      progress_callback: (info: Record<string, unknown>) => {
        if (info["status"] === "progress") {
          chrome.runtime.sendMessage(
            {
              type: "TRANSCRIPTION_PROGRESS",
              payload: { progress: (info["progress"] as number) ?? 0 },
            },
            () => {},
          );
        }
      },
    })) as ASRPipeline;
  }
  return whisperPipeline;
}

async function decodeAndResample(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

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

// 話者ラベルなしの高速転写（録音中のプレビュー用）
async function transcribeChunk(blob: Blob, settings: ExtensionSettings): Promise<string> {
  const audioData = await decodeAndResample(blob);
  const asr = await loadWhisper(settings.whisperModel);
  const result = await asr(audioData, {
    language: settings.language === "ja" ? "japanese" : "english",
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const singleResult = Array.isArray(result) ? result[0] : result;
  return singleResult?.text ?? "";
}

// 設定間隔ごとに蓄積チャンクを処理してサイドパネルへ送信
async function processNextChunk(): Promise<void> {
  if (!pendingSettings) return;
  const WINDOW = pendingSettings.chunkIntervalSec; // 1秒チャンク × N秒分
  const available = audioChunks.length - processedChunkCount;
  if (available < WINDOW || isProcessingChunk) return;

  isProcessingChunk = true;
  const startIdx = processedChunkCount;
  const window = audioChunks.slice(startIdx, startIdx + WINDOW);
  processedChunkCount += WINDOW;

  try {
    const blob = new Blob(window, { type: "audio/webm;codecs=opus" });
    const text = await transcribeChunk(blob, pendingSettings);
    chrome.runtime.sendMessage(
      {
        type: "TRANSCRIPT_CHUNK",
        target: "background",
        payload: { text, chunkIndex: Math.floor(startIdx / WINDOW) },
      },
      () => {},
    );
  } catch {
    // 失敗した場合はカーソルを戻して次回リトライ
    processedChunkCount = startIdx;
  } finally {
    isProcessingChunk = false;
  }
}

async function startRecording(
  streamId: string,
  meetingTitle: string,
  settings: ExtensionSettings,
): Promise<void> {
  currentMeetingTitle = meetingTitle;
  pendingSettings = settings;
  processedChunkCount = 0;
  isProcessingChunk = false;

  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId,
    } as unknown as MediaTrackConstraints,
    video: false,
  });

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  audioCtx.createMediaStreamSource(tabStream).connect(destination);
  audioCtx.createMediaStreamSource(micStream).connect(destination);

  audioChunks = [];

  mediaRecorder = new MediaRecorder(destination.stream, {
    mimeType: "audio/webm;codecs=opus",
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.start(1000);

  chunkIntervalId = setInterval(() => {
    void processNextChunk();
  }, settings.chunkIntervalSec * 1000);
}

// 話者イベントと Whisper のワードタイムスタンプを突き合わせてセグメント化したトランスクリプトを生成する
function buildSpeakerTranscript(
  chunks: WordChunk[],
  speakerEvents: SpeakerEvent[],
  recordingStartTime: number,
): string {
  if (speakerEvents.length === 0) {
    return chunks.map((c) => c.text).join("");
  }

  // 話者イベントを録音開始からの相対秒に変換
  const relativeEvents = speakerEvents.map((e) => ({
    name: e.name,
    startSec: (e.absoluteTime - recordingStartTime) / 1000,
  }));

  // ワードごとに話者を割り当て
  const segments: Array<{ speaker: string; text: string }> = [];
  let currentSpeaker = relativeEvents[0]?.name ?? "不明";
  let currentText = "";

  for (const chunk of chunks) {
    const [start] = chunk.timestamp;
    // タイムスタンプが null の場合は直前の話者を引き継ぐ
    if (start !== null) {
      const speaker =
        [...relativeEvents].reverse().find((e) => e.startSec <= start)?.name ?? currentSpeaker;
      if (speaker !== currentSpeaker && currentText.trim()) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim() });
        currentText = "";
      }
      currentSpeaker = speaker;
    }
    currentText += chunk.text;
  }

  if (currentText.trim()) {
    segments.push({ speaker: currentSpeaker, text: currentText.trim() });
  }

  return segments.map((s) => `[${s.speaker}] ${s.text}`).join("\n");
}

async function stopAndTranscribe(
  settings: ExtensionSettings,
  speakerEvents: SpeakerEvent[],
  recordingStartTime: number,
): Promise<void> {
  if (!mediaRecorder) return;

  // チャンクインターバルを停止し、処理中のチャンクが完了するまで待つ
  if (chunkIntervalId) {
    clearInterval(chunkIntervalId);
    chunkIntervalId = null;
  }
  while (isProcessingChunk) {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }

  const recordingActualStart = recordingStartTime;

  return new Promise((resolve) => {
    mediaRecorder!.onstop = async () => {
      const duration = (Date.now() - recordingActualStart) / 1000;
      const audioBlob = new Blob(audioChunks, { type: "audio/webm;codecs=opus" });

      const recordingId = await saveRecording({
        date: new Date().toISOString(),
        meetingTitle: currentMeetingTitle,
        duration,
        audioBlob,
        transcript: "",
        minutes: "",
      });

      chrome.runtime.sendMessage(
        {
          type: "RECORDING_SAVED",
          target: "background",
          payload: { recordingId },
        },
        () => {},
      );

      await transcribe(audioBlob, recordingId, settings, speakerEvents, recordingActualStart);
      resolve();
    };

    mediaRecorder!.stop();
  });
}

// 全音声を話者ラベル付きで転写（録音終了後の最終トランスクリプト）
async function transcribe(
  audioBlob: Blob,
  recordingId: string,
  settings: ExtensionSettings,
  speakerEvents: SpeakerEvent[],
  recordingStartTime: number,
): Promise<void> {
  try {
    const audioData = await decodeAndResample(audioBlob);
    const asr = await loadWhisper(settings.whisperModel);

    const result = await asr(audioData, {
      language: settings.language === "ja" ? "japanese" : "english",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: "word",
    });

    const singleResult = Array.isArray(result) ? result[0] : result;
    const chunks = singleResult?.chunks ?? [];

    const transcript =
      speakerEvents.length > 0
        ? buildSpeakerTranscript(chunks, speakerEvents, recordingStartTime)
        : (singleResult?.text ?? "");

    await updateRecording(recordingId, { transcript });

    chrome.runtime.sendMessage(
      {
        type: "TRANSCRIPTION_DONE",
        target: "background",
        payload: { transcript, recordingId },
      },
      () => {},
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    chrome.runtime.sendMessage(
      {
        type: "ERROR",
        payload: { message: `文字起こしエラー: ${msg}` },
      },
      () => {},
    );
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    if (message.target !== "offscreen") return false;

    void (async () => {
      switch (message.type) {
        case "FORWARD_TO_OFFSCREEN": {
          const { streamId, meetingTitle, settings } = message.payload;
          await startRecording(streamId, meetingTitle, settings);
          sendResponse({ ok: true });
          break;
        }

        case "OFFSCREEN_STOP": {
          const { speakerEvents, recordingStartTime } = message.payload;
          const stored = await chrome.storage.sync.get({
            ollamaUrl: "http://localhost:11434",
            ollamaModel: "llama3.2",
            whisperModel: "onnx-community/whisper-tiny",
            language: "ja",
          });
          await stopAndTranscribe(stored as ExtensionSettings, speakerEvents, recordingStartTime);
          sendResponse({ ok: true });
          break;
        }
      }
    })();

    return true;
  },
);
