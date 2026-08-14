import {
  addChromeRuntimeMessageListener,
  sendChromeRuntimeMessage,
} from "@core/runtime/chrome";
import { withDataCommunicationError } from "./error";

interface DownloadResult {
  ok: boolean;
  error?: string;
}

export function downloadRuntimeUrl(url: string, filename: string): Promise<DownloadResult | null> {
  return withDataCommunicationError("ファイルのダウンロード", () =>
    sendChromeRuntimeMessage<DownloadResult | null>({
      type: "DOWNLOAD_URL",
      target: "background",
      payload: { url, filename },
    }),
  );
}

export function subscribeRuntimeUrlDownloads(
  handler: (url: string, filename: string, respond: (response?: unknown) => void) => void,
): void {
  addChromeRuntimeMessageListener((message, _sender, respond) => {
    if (typeof message !== "object" || message === null) return false;
    const runtimePayload = message as { type?: string; payload?: unknown };
    if (runtimePayload.type !== "DOWNLOAD_URL") return false;
    const payload = runtimePayload.payload as { url: string; filename: string };
    handler(payload.url, payload.filename, respond);
    return true;
  });
}
