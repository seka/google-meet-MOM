import { describe, it, expect, vi, beforeAll, beforeEach } from "vite-plus/test";
import { DEFAULT_SETTINGS } from "@features/settings/types";
import type { ExtensionMessage } from "../core/messaging/messages";

type SendResponse = (response?: unknown) => void;
type MessageHandler = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
) => boolean;

// test-setup.ts が先に chrome をスタブしている。
// onMessage.addListener の実装を差し替え、background モジュールが登録するハンドラを捕捉する。
let bgHandler!: MessageHandler;
(chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mockImplementation(
  (fn: MessageHandler) => {
    bgHandler = fn;
  },
);

beforeAll(async () => {
  await import("./background");
});

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime.getContexts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (chrome.offscreen.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
    (_msg: unknown, cb?: () => void) => {
      cb?.();
    },
  );
  (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
    (_tabId: unknown, _msg: unknown, cb?: (res: unknown) => void) => {
      cb?.(undefined);
    },
  );
  vi.stubGlobal("fetch", vi.fn());
});

const BASE_PAYLOAD = {
  meetingTitle: "テスト会議",
  settings: DEFAULT_SETTINGS,
  tabId: 42,
} as const;

const TAB_CAPTURE_PERMISSION_ERROR =
  "録音対象タブをキャプチャできません。Google Meet のタブを選択した状態で拡張機能アイコンからサイドパネルを開き直して、もう一度開始してください。chrome:// などの Chrome 内部ページは録音できません。";

describe("START_RECORDING", () => {
  it("getMediaStreamId をバックグラウンドから targetTabId 付きで呼ぶ", async () => {
    (chrome.tabCapture.getMediaStreamId as ReturnType<typeof vi.fn>).mockImplementation(
      (_opts: unknown, cb: (id: string) => void) => cb("stream-abc"),
    );

    const sendResponse = vi.fn();
    bgHandler(
      { type: "START_RECORDING", target: "background", payload: BASE_PAYLOAD },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));

    expect(chrome.tabCapture.getMediaStreamId).toHaveBeenCalledWith(
      { targetTabId: 42 },
      expect.any(Function),
    );
  });

  it("取得した streamId を FORWARD_TO_OFFSCREEN ペイロードに含めて送信する", async () => {
    (chrome.tabCapture.getMediaStreamId as ReturnType<typeof vi.fn>).mockImplementation(
      (_opts: unknown, cb: (id: string) => void) => cb("stream-xyz"),
    );

    const sendResponse = vi.fn();
    bgHandler(
      { type: "START_RECORDING", target: "background", payload: BASE_PAYLOAD },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FORWARD_TO_OFFSCREEN",
        target: "offscreen",
        payload: expect.objectContaining({
          streamId: "stream-xyz",
          meetingTitle: "テスト会議",
          tabId: 42,
        }),
      }),
      expect.any(Function),
    );
  });

  it("activeTab 未付与や Chrome 内部ページでキャプチャできないとき案内付きエラーを返す", async () => {
    (chrome.tabCapture.getMediaStreamId as ReturnType<typeof vi.fn>).mockImplementation(
      (_opts: unknown, cb: (id: string | undefined) => void) => {
        (chrome.runtime as unknown as Record<string, unknown>).lastError = {
          message:
            "Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured.",
        };
        cb(undefined);
        (chrome.runtime as unknown as Record<string, unknown>).lastError = undefined;
      },
    );

    const sendResponse = vi.fn();
    bgHandler(
      { type: "START_RECORDING", target: "background", payload: BASE_PAYLOAD },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: TAB_CAPTURE_PERMISSION_ERROR,
      }),
    );

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "STATE_CHANGED",
        payload: expect.objectContaining({
          state: "error",
          message: TAB_CAPTURE_PERMISSION_ERROR,
        }),
      }),
      expect.any(Function),
    );
  });
});

describe("STOP_RECORDING", () => {
  it("OFFSCREEN_STOP を送信して sendResponse に ok:true を返す", async () => {
    const sendResponse = vi.fn();
    bgHandler(
      { type: "STOP_RECORDING", target: "background" } as ExtensionMessage,
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
    await vi.waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "OFFSCREEN_STOP",
          target: "offscreen",
          payload: expect.objectContaining({ speakerEvents: [] }),
        }),
        expect.any(Function),
      ),
    );
  });

  it("meetTabId がある場合は話者イベントを収集して OFFSCREEN_STOP に含める", async () => {
    // meetTabId を設定するために先に録音開始する
    (chrome.tabCapture.getMediaStreamId as ReturnType<typeof vi.fn>).mockImplementation(
      (_opts: unknown, cb: (id: string) => void) => cb("stream-tmp"),
    );
    const startRes = vi.fn();
    bgHandler(
      { type: "START_RECORDING", target: "background", payload: BASE_PAYLOAD },
      {} as chrome.runtime.MessageSender,
      startRes,
    );
    await vi.waitFor(() => expect(startRes).toHaveBeenCalledWith({ ok: true }));

    // 呼び出し履歴をリセットし、話者イベントを返すよう再設定
    vi.clearAllMocks();
    const speakerEvents = [{ name: "田中", absoluteTime: Date.now() }];
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_tabId: unknown, msg: unknown, cb?: (res: unknown) => void) => {
        if ((msg as { type: string }).type === "GET_SPEAKER_EVENTS") {
          cb?.({ speakerEvents });
        }
      },
    );
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, cb?: () => void) => {
        cb?.();
      },
    );

    bgHandler(
      { type: "STOP_RECORDING", target: "background" } as ExtensionMessage,
      {} as chrome.runtime.MessageSender,
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "OFFSCREEN_STOP",
          payload: expect.objectContaining({
            speakerEvents: expect.arrayContaining([expect.objectContaining({ name: "田中" })]),
          }),
        }),
        expect.any(Function),
      ),
    );
  });
});

describe("GET_STATE", () => {
  it("現在の状態を同期で返す", () => {
    const sendResponse = vi.fn();
    bgHandler(
      { type: "GET_STATE" } as ExtensionMessage,
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ state: expect.any(String) }),
    );
  });
});

describe("OLLAMA_TEST", () => {
  it("Ollama のモデル一覧 API に接続して ok:true を返す", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(JSON.stringify({ models: [{ name: "llama3.2:latest" }] })),
    });

    const sendResponse = vi.fn();
    bgHandler(
      {
        type: "OLLAMA_TEST",
        target: "background",
        payload: { ollamaUrl: "http://localhost:11434", ollamaModel: "llama3.2" },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("Ollama がエラーを返したとき ok:false を返す", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: vi.fn().mockResolvedValue(""),
    });

    const sendResponse = vi.fn();
    bgHandler(
      {
        type: "OLLAMA_TEST",
        target: "background",
        payload: { ollamaUrl: "http://localhost:11434", ollamaModel: "missing-model" },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: "Ollama API: 404 Not Found",
      }),
    );
  });

  it("接続できてもモデルがないとき ok:false を返す", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(JSON.stringify({ models: [{ name: "llama3.2:latest" }] })),
    });

    const sendResponse = vi.fn();
    bgHandler(
      {
        type: "OLLAMA_TEST",
        target: "background",
        payload: { ollamaUrl: "http://localhost:11434", ollamaModel: "missing-model" },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining('モデル "missing-model" が見つかりません'),
        }),
      ),
    );
  });
});
