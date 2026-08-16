import { ApiError, HttpClient } from "../http-client";

export interface OllamaModel {
  name?: string;
  model?: string;
}

export interface OllamaTagsResponse {
  models?: OllamaModel[];
}

export interface OllamaChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  stream: false;
  messages: OllamaChatMessage[];
}

export interface OllamaChatResponse {
  message?: {
    content: string;
  };
}

export class OllamaClient {
  private readonly httpClient: HttpClient;

  constructor(ollamaUrl: string) {
    this.httpClient = new HttpClient({ baseUrl: ollamaUrl });
  }

  async getModels(): Promise<OllamaModel[]> {
    const data = await this.httpClient.get<OllamaTagsResponse>("/api/tags");
    return data.models ?? [];
  }

  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    return this.httpClient.post<OllamaChatResponse>("/api/chat", request);
  }
}

export function toOllamaErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail =
      typeof error.data === "object" && error.data !== null && "error" in error.data
        ? String(error.data.error)
        : typeof error.data === "string"
          ? error.data
          : "";
    return `Ollama API: ${error.status} ${error.statusText}${detail ? `: ${detail}` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}
