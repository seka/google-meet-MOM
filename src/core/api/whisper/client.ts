import { env, pipeline } from "@huggingface/transformers";
import type {
  TranscriberClient,
  TranscribeOptions,
  Transcription,
  TranscriptionChunk,
  TranscriptionProgressHandler,
} from "../transcriber_client";

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
    const asr = await this.loadWhisper(options.model, options.onProgress);
    const result = await asr(audioData, {
      language: toWhisperLanguage(options.language),
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
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
