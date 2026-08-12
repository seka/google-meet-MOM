import { requestChromeRuntime, subscribeChromeRuntime } from "@core/runtime/chrome";

export interface RuntimeResult {
  ok: boolean;
  error?: string;
}

export interface WhisperTestResult extends RuntimeResult {
  transcript?: string;
}

type Respond = (response?: unknown) => void;

interface RuntimePayload {
  type?: string;
  target?: string;
  payload?: unknown;
}

function toRuntimePayload(message: unknown): RuntimePayload {
  return typeof message === "object" && message !== null ? (message as RuntimePayload) : {};
}

export function testOllamaConnection(input: {
  ollamaUrl: string;
  ollamaModel: string;
}): Promise<RuntimeResult | null> {
  return requestChromeRuntime<RuntimeResult | null>({
    type: "OLLAMA_TEST",
    target: "background",
    payload: input,
  });
}

export function testWhisperConnection(input: {
  audioSamples: number[];
  model: string;
  language: string;
}): Promise<WhisperTestResult | null> {
  return requestChromeRuntime<WhisperTestResult | null>({
    type: "WHISPER_TEST",
    target: "background",
    payload: input,
  });
}

export function testWhisperOffscreen(input: {
  audioSamples: number[];
  model: string;
  language: string;
}): Promise<WhisperTestResult | null> {
  return requestChromeRuntime<WhisperTestResult | null>({
    type: "WHISPER_TEST",
    target: "offscreen",
    payload: input,
  });
}

export function subscribeBackgroundConnectionTests(handlers: {
  ollama(input: { ollamaUrl: string; ollamaModel: string }, respond: Respond): void;
  whisper(
    input: { audioSamples: number[]; model: string; language: string },
    respond: Respond,
  ): void;
}): void {
  subscribeChromeRuntime((message, _sender, respond) => {
    const runtimePayload = toRuntimePayload(message);
    if (runtimePayload.target === "offscreen") return false;

    if (runtimePayload.type === "OLLAMA_TEST") {
      handlers.ollama(
        runtimePayload.payload as { ollamaUrl: string; ollamaModel: string },
        respond,
      );
      return true;
    }
    if (runtimePayload.type === "WHISPER_TEST") {
      handlers.whisper(
        runtimePayload.payload as { audioSamples: number[]; model: string; language: string },
        respond,
      );
      return true;
    }
    return false;
  });
}

export function subscribeOffscreenConnectionTests(
  handler: (
    input: { audioSamples: number[]; model: string; language: string },
    respond: Respond,
  ) => void,
): void {
  subscribeChromeRuntime((message, _sender, respond) => {
    const runtimePayload = toRuntimePayload(message);
    if (runtimePayload.target !== "offscreen" || runtimePayload.type !== "WHISPER_TEST") {
      return false;
    }
    handler(
      runtimePayload.payload as { audioSamples: number[]; model: string; language: string },
      respond,
    );
    return true;
  });
}
