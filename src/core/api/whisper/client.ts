import { env, pipeline } from "@huggingface/transformers";

export type WhisperWordChunk = { text: string; timestamp: [number, number] | [null, null] };

export type WhisperProgressHandler = (progress: number) => void;

export interface WhisperRuntimeOptions {
  wasmPaths: string;
  localModelPath: string;
}

export interface WhisperRunOptions {
  model: string;
  language: string;
  returnTimestamps: boolean;
  onProgress?: WhisperProgressHandler;
}

export interface WhisperTranscription {
  text: string;
  chunks: WhisperWordChunk[];
}

type ASRResult = { text: string; chunks?: WhisperWordChunk[] };
type ASRPipeline = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<ASRResult | ASRResult[]>;

let whisperPipeline: ASRPipeline | null = null;
let whisperPipelineModel: string | null = null;

export function configureWhisperRuntime(options: WhisperRuntimeOptions): void {
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.wasmPaths = options.wasmPaths;
  }
  env.allowLocalModels = true;
  env.localModelPath = options.localModelPath;
}

export async function loadWhisper(
  model: string,
  onProgress?: WhisperProgressHandler,
): Promise<ASRPipeline> {
  if (!whisperPipeline || whisperPipelineModel !== model) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    whisperPipeline = (await (pipeline as any)("automatic-speech-recognition", model, {
      dtype: "q8",
      progress_callback: (info: Record<string, unknown>) => {
        if (info["status"] === "progress") {
          onProgress?.((info["progress"] as number) ?? 0);
        }
      },
    })) as ASRPipeline;
    whisperPipelineModel = model;
  }
  return whisperPipeline;
}

export async function transcribeWithWhisper(
  audioData: Float32Array,
  options: WhisperRunOptions,
): Promise<WhisperTranscription> {
  const asr = await loadWhisper(options.model, options.onProgress);
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

function toWhisperLanguage(language: string): string {
  return language === "ja" ? "japanese" : "english";
}
