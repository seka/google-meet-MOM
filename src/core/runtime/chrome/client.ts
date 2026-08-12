export type ChromeRuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

export function requestChromeRuntime<Response>(payload: unknown): Promise<Response> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response: Response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

export function notifyChromeRuntime(payload: unknown): void {
  chrome.runtime.sendMessage(payload, () => {
    void chrome.runtime.lastError;
  });
}

export function subscribeChromeRuntime(listener: ChromeRuntimeListener): void {
  chrome.runtime.onMessage.addListener(listener);
}
