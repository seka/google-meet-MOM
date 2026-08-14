export class RuntimeCommunicationError extends Error {
  readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${operation}に失敗しました: ${detail}`);
    this.name = "RuntimeCommunicationError";
    this.cause = cause;
  }
}

export async function sendRuntimeMessage<Response = void>(
  operation: string,
  send: () => Promise<Response>,
): Promise<Response> {
  try {
    return await send();
  } catch (error) {
    throw new RuntimeCommunicationError(operation, error);
  }
}
