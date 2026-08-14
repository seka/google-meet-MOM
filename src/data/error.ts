export class DataCommunicationError extends Error {
  readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${operation}に失敗しました: ${detail}`);
    this.name = "DataCommunicationError";
    this.cause = cause;
  }
}

export async function withDataCommunicationError<Response = void>(
  operation: string,
  send: () => Promise<Response>,
): Promise<Response> {
  try {
    return await send();
  } catch (error) {
    throw new DataCommunicationError(operation, error);
  }
}
