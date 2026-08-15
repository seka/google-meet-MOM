export type ChromeRuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

export function sendChromeRuntimeMessage<Response = void>(payload: unknown): Promise<Response> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response: Response) => {
      // lastError は、この API 呼び出しが失敗した場合に限り、このコールバック内で設定される。
      // https://developer.chrome.com/docs/extensions/reference/api/runtime?hl=ja#property-lastError
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

export function addChromeRuntimeMessageListener(listener: ChromeRuntimeListener): void {
  chrome.runtime.onMessage.addListener(listener);
}
