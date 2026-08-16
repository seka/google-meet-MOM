import { saveRecording, updateRecording } from "../../db";
import { publishRecordingSaved, subscribeOffscreenRecordingCommands } from "@data/recording";
import {
  publishRuntimeError,
  publishTranscriptChunk,
  publishTranscriptionComplete,
  publishTranscriptionProgress,
} from "@data/transcription";
import { subscribeOffscreenConnectionTests } from "@data/connection-test";
import { downloadRuntimeUrl } from "@data/file-download";
import type { SpeakerEvent } from "@features/recording/types";
import type { ExtensionSettings } from "@features/settings/types";
import {
  configureAsrRuntime,
  transcribe,
  transcribeChunk,
  transcribeSamples,
} from "../../data/asr";
import { buildSpeakerTranscript } from "./transcript";
import { buildOutputFilename } from "@core/io/file_writer";
import { RecordingSession } from "@features/recording/models/recording-session";

// SharedArrayBuffer なしで動作させるためシングルスレッドに固定
configureAsrRuntime({
  wasmPaths: chrome.runtime.getURL("vendor/transformers/"),
  localModelPath: chrome.runtime.getURL("models/"),
});

const recordingSession = new RecordingSession();
let currentMeetingTitle = "Google Meet";

// チャンク処理の状態
let processedChunkCount = 0;
let isProcessingChunk = false;
let chunkIntervalId: ReturnType<typeof setInterval> | null = null;
let pendingSettings: ExtensionSettings | null = null;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function reportOffscreenError(err: unknown, sendResponse?: (response?: unknown) => void): void {
  const msg = toErrorMessage(err);
  sendResponse?.({ ok: false, error: msg });
  publishRuntimeError(msg).catch(console.error);
}

function sendWhisperProgress(progress: number): void {
  publishTranscriptionProgress(progress).catch(console.error);
}

function downloadRecordingBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);

  return downloadRuntimeUrl(url, filename)
    .then((result) => {
      if (!result?.ok) {
        throw new Error(result?.error ?? "録音ファイルを保存できませんでした");
      }
    })
    .finally(() => {
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    });
}

// 設定間隔ごとに蓄積チャンクを処理してサイドパネルへ送信
async function processNextChunk(): Promise<void> {
  if (!pendingSettings) return;
  const WINDOW = pendingSettings.chunkIntervalSec; // 1秒チャンク × N秒分
  const audioChunks = recordingSession.getChunks();
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
    await publishTranscriptChunk(text, Math.floor(startIdx / WINDOW));
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
      chromeMediaSource: "desktop",
      chromeMediaSourceId: streamId,
    } as unknown as MediaTrackConstraints,
    video: false,
  });

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  audioCtx.createMediaStreamSource(tabStream).connect(destination);
  audioCtx.createMediaStreamSource(micStream).connect(destination);

  recordingSession.start(destination.stream);

  chunkIntervalId = setInterval(() => {
    processNextChunk().catch(reportOffscreenError);
  }, settings.chunkIntervalSec * 1000);
}

async function stopAndTranscribe(
  settings: ExtensionSettings,
  speakerEvents: SpeakerEvent[],
  recordingStartTime: number,
): Promise<void> {
  // チャンクインターバルを停止し、処理中のチャンクが完了するまで待つ
  if (chunkIntervalId) {
    clearInterval(chunkIntervalId);
    chunkIntervalId = null;
  }
  while (isProcessingChunk) {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }

  const recordingActualStart = recordingStartTime;
  const audioBlob = await recordingSession.stop();
  if (!audioBlob) return;
  const duration = (Date.now() - recordingActualStart) / 1000;
  const savedAt = new Date().toISOString();

  const recordingId = await saveRecording({
    date: savedAt,
    meetingTitle: currentMeetingTitle,
    duration,
    audioBlob,
    transcript: "",
    minutes: "",
  });

  if (settings.recordingOutputDestination === "download") {
    const filename = buildOutputFilename({
      meetingTitle: currentMeetingTitle,
      date: savedAt,
      kind: "recording",
      extension: "webm",
    });

    try {
      await downloadRecordingBlob(audioBlob, filename);
    } catch {
      // ファイル保存が失敗しても、ブラウザ内保存と文字起こしは継続する。
    }
  }

  await publishRecordingSaved(recordingId);

  await transcribeAndSave(audioBlob, recordingId, settings, speakerEvents, recordingActualStart);
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

    await publishTranscriptionComplete(transcript, recordingId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await publishRuntimeError(`文字起こしエラー: ${msg}`);
  }
}

subscribeOffscreenRecordingCommands({
  start(input, respond) {
    startRecording(input.streamId, input.meetingTitle, input.settings)
      .then(() => respond({ ok: true }))
      .catch((err: unknown) => reportOffscreenError(err, respond));
  },
  stop(input, respond) {
    if (!pendingSettings) {
      respond({ ok: false, error: "録音設定を取得できませんでした" });
      return;
    }
    stopAndTranscribe(pendingSettings, input.speakerEvents, input.recordingStartTime)
      .then(() => respond({ ok: true }))
      .catch((err: unknown) => reportOffscreenError(err, respond));
  },
});

subscribeOffscreenConnectionTests(({ audioSamples, model, language }, respond) => {
  const audioData = new Float32Array(audioSamples);
  transcribeSamples(audioData, { model, language, onProgress: sendWhisperProgress })
    .then((transcript) => respond({ ok: true, transcript }))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      respond({ ok: false, error: message });
    });
});
