import { env, pipeline } from "@huggingface/transformers";
import type {
  TranscriberClient,
  TranscribeOptions,
  Transcription,
  TranscriptionChunk,
  TranscriptionProgressHandler,
} from "../transcriber-client";

export interface WhisperRuntimeOptions {
  wasmPaths: string;
  localModelPath: string;
}

type ASRResult = { text: string; chunks?: TranscriptionChunk[] };
type ASRPipeline = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<ASRResult | ASRResult[]>;

export class WhisperClient implements TranscriberClient {
  private whisperPipeline: ASRPipeline | null = null;
  private whisperPipelineModel: string | null = null;

  constructor(runtimeOptions: WhisperRuntimeOptions) {
    if (env.backends.onnx.wasm) {
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.wasmPaths = runtimeOptions.wasmPaths;
    }
    env.allowLocalModels = true;
    env.localModelPath = runtimeOptions.localModelPath;
  }

  private async loadWhisper(
    model: string,
    onProgress?: TranscriptionProgressHandler,
  ): Promise<ASRPipeline> {
    if (!this.whisperPipeline || this.whisperPipelineModel !== model) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.whisperPipeline = (await (pipeline as any)("automatic-speech-recognition", model, {
        dtype: "q8",
        progress_callback: (info: Record<string, unknown>) => {
          if (info["status"] === "progress") {
            onProgress?.((info["progress"] as number) ?? 0);
          }
        },
      })) as ASRPipeline;
      this.whisperPipelineModel = model;
    }
    return this.whisperPipeline;
  }

  async transcribe(audioData: Float32Array, options: TranscribeOptions): Promise<Transcription> {
    if (!hasAudibleAudio(audioData)) {
      return { text: "", chunks: [] };
    }

    const asr = await this.loadWhisper(options.model, options.onProgress);
    // 日本語会議の最終文字起こしで同じ語句が連続生成されるケースを抑えるため、
    // 評価で効果を確認した small では同じ6トークンの並びの再生成を制限する。
    const suppressRepetition =
      options.model === "onnx-community/whisper-small" &&
      options.language === "ja" &&
      options.returnTimestamps;
    const result = await asr(audioData, {
      language: toWhisperLanguage(options.language),
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(suppressRepetition ? { no_repeat_ngram_size: 6 } : {}),
      ...(options.returnTimestamps ? { return_timestamps: true } : {}),
    });
    const singleResult = Array.isArray(result) ? result[0] : result;

    return {
      text: singleResult?.text ?? "",
      chunks: singleResult?.chunks ?? [],
    };
  }
}

function toWhisperLanguage(language: string): string {
  return language === "ja" ? "japanese" : "english";
}

function hasAudibleAudio(audioData: Float32Array): boolean {
  // 無音に近い入力での誤生成を防ぐ。短い発話を長い無音で平均化しないよう、16 kHz の音声を20 msずつ測る。
  const frameSize = 320;
  const minimumRms = 0.001; // フルスケールに対して -60 dB
  for (let start = 0; start < audioData.length; start += frameSize) {
    const end = Math.min(start + frameSize, audioData.length);
    let sumSquares = 0;
    for (let index = start; index < end; index++) {
      const sample = audioData[index]!;
      sumSquares += sample * sample;
    }
    if (sumSquares >= (end - start) * minimumRms ** 2) {
      return true;
    }
  }
  return false;
}
