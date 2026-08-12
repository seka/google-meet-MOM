import type { ExtensionMessage } from "./messages";

export type RuntimeMessageListener = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

export function sendRuntimeMessage<Response = unknown>(
  message: ExtensionMessage,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: Response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

export function postRuntimeMessage(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}

export function addRuntimeMessageListener(listener: RuntimeMessageListener): void {
  chrome.runtime.onMessage.addListener(listener);
}
