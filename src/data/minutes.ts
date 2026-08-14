import { OllamaClient, toOllamaErrorMessage } from "../core/api/ollama/client";

export async function assertMinutesModelAvailable(
  ollamaUrl: string,
  ollamaModel: string,
): Promise<void> {
  const client = new OllamaClient(ollamaUrl);
  const models = await client.getModels();
  const normalizedModel = ollamaModel.trim();
  const hasModel = models.some((model) => {
    const name = model.name ?? model.model ?? "";
    return name === normalizedModel || name.split(":")[0] === normalizedModel;
  });

  if (!hasModel) {
    throw new Error(
      `Ollama には接続できましたが、モデル "${normalizedModel}" が見つかりません。ollama pull ${normalizedModel} を実行するか、設定のモデル名を変更してください。`,
    );
  }
}

export async function generateMinutes(params: {
  ollamaUrl: string;
  ollamaModel: string;
  transcript: string;
}): Promise<string> {
  const client = new OllamaClient(params.ollamaUrl);
  const data = await client.chat({
    model: params.ollamaModel,
    stream: false,
    messages: [
      {
        role: "user",
        content:
          "以下はミーティングの文字起こしです。\n" +
          "日時・参加者・決定事項・アクションアイテムを含む議事録を日本語で Markdown 形式で作成してください。\n\n" +
          "---\n" +
          params.transcript,
      },
    ],
  });

  return data.message?.content ?? "";
}

export function toMinutesErrorMessage(error: unknown): string {
  return toOllamaErrorMessage(error);
}
