import { saveRecording, updateRecording } from "../../db";
import type { ExtensionMessage } from "../../messages";
import type { ExtensionSettings, SpeakerEvent } from "../../types";
import {
  configureAsrRuntime,
  transcribe,
  transcribeChunk,
  transcribeSamples,
} from "../../data/api/asr";
import { buildSpeakerTranscript } from "./transcript";

// SharedArrayBuffer なしで動作させるためシングルスレッドに固定
configureAsrRuntime({
  wasmPaths: chrome.runtime.getURL("vendor/transformers/"),
  localModelPath: chrome.runtime.getURL("models/"),
});

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let currentMeetingTitle = "Google Meet";

// チャンク処理の状態
let processedChunkCount = 0;
let isProcessingChunk = false;
let chunkIntervalId: ReturnType<typeof setInterval> | null = null;
let pendingSettings: ExtensionSettings | null = null;

function sendWhisperProgress(progress: number): void {
  chrome.runtime.sendMessage(
    {
      type: "TRANSCRIPTION_PROGRESS",
      payload: { progress },
    },
    () => {},
  );
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
    const text = await transcribeChunk(blob, {
      model: pendingSettings.whisperModel,
      language: pendingSettings.language,
      onProgress: sendWhisperProgress,
    });
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

      await transcribeAndSave(
        audioBlob,
        recordingId,
        settings,
        speakerEvents,
        recordingActualStart,
      );
      resolve();
    };

    mediaRecorder!.stop();
  });
}

// 全音声を話者ラベル付きで転写（録音終了後の最終トランスクリプト）
async function transcribeAndSave(
  audioBlob: Blob,
  recordingId: string,
  settings: ExtensionSettings,
  speakerEvents: SpeakerEvent[],
  recordingStartTime: number,
): Promise<void> {
  try {
    const result = await transcribe(audioBlob, {
      model: settings.whisperModel,
      language: settings.language,
      onProgress: sendWhisperProgress,
    });

    const transcript =
      speakerEvents.length > 0
        ? buildSpeakerTranscript(result.chunks, speakerEvents, recordingStartTime)
        : result.text;

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

        case "WHISPER_TEST": {
          const { audioSamples, model, language } = message.payload as {
            audioSamples: number[];
            model: string;
            language: string;
          };
          try {
            const audioData = new Float32Array(audioSamples);
            const transcript = await transcribeSamples(audioData, {
              model,
              language,
              onProgress: sendWhisperProgress,
            });
            sendResponse({ ok: true, transcript });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            sendResponse({ ok: false, error: msg });
          }
          break;
        }
      }
    })();

    return true;
  },
);
