import { afterAll, beforeAll, expect, it, vi } from "vite-plus/test";
import sidepanelHtml from "../../pages/sidepanel/sidepanel.html?raw";
import { getRecording, saveRecording } from "../../db";
import { createExtensionHarness } from "./extension-harness";

const transcript = "田中: 来週までに資料を準備します。";
const minutes = "## 決定事項\n来週までに資料を準備する。";
let harness: ReturnType<typeof createExtensionHarness>;
let recordingId: string;
const fetchMock = vi.fn<typeof fetch>();
const browserFetch = globalThis.fetch.bind(globalThis);
let warning: ReturnType<typeof vi.spyOn>;

function button(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

async function waitForState(label: string) {
  await vi.waitFor(() => expect(document.getElementById("status-label")?.textContent).toBe(label));
}

beforeAll(async () => {
  document.body.innerHTML = new DOMParser().parseFromString(
    sidepanelHtml,
    "text/html",
  ).body.innerHTML;
  harness = createExtensionHarness();
  warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", fetchMock);
  await import("../../workers/background");
  await import("../../pages/sidepanel/sidepanel");
  await waitForState("待機中");
  recordingId = await saveRecording({
    meetingTitle: "テスト会議",
    date: new Date().toISOString(),
    duration: 1,
    audioBlob: new Blob(["test audio"]),
    transcript,
    minutes: "",
  });
});

afterAll(() => {
  warning?.mockRestore();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("録音開始から明示保存まで進み、生成失敗と再録音時の権限拒否から復帰可能な状態を保つ", async () => {
  fetchMock.mockResolvedValue(Response.json({ message: { content: minutes } }));
  harness.clickAction();
  expect(harness.chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 });
  expect(harness.chrome.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
  expect(harness.offscreenMessages).toEqual([]);

  harness.rejectNextStateNotification();
  button("record-btn").click();
  await waitForState("録音中");
  await vi.waitFor(() =>
    expect(warning).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("The message port closed") }),
    ),
  );
  expect(harness.offscreenMessages).toEqual(["OFFSCREEN_RECORDING_READY", "FORWARD_TO_OFFSCREEN"]);
  button("record-btn").click();
  await waitForState("文字起こし中");
  expect(button("record-btn").disabled).toBe(true);
  await vi.waitFor(() => expect(harness.offscreenMessages).toContain("OFFSCREEN_STOP"));
  expect(harness.chrome.downloads.download).not.toHaveBeenCalled();

  harness.dispatch({
    type: "TRANSCRIPTION_DONE",
    target: "background",
    payload: { transcript, recordingId },
  });
  await waitForState("完了");
  expect((await getRecording(recordingId))?.minutes).toBe(minutes);
  expect(document.getElementById("transcript-text")?.textContent).toBe(transcript);
  expect(document.getElementById("minutes-text")?.textContent).toBe(minutes);
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:11434/api/chat",
    expect.objectContaining({ method: "POST", body: expect.stringContaining(transcript) }),
  );
  expect(harness.chrome.downloads.download).not.toHaveBeenCalled();

  button("download-transcript-btn").click();
  await vi.waitFor(() => expect(harness.chrome.downloads.download).toHaveBeenCalledOnce());
  const options = harness.chrome.downloads.download.mock.calls[0][0];
  expect(options.saveAs).toBe(true);
  expect(options.filename).toMatch(/_transcript\.txt$/);
  expect(await (await browserFetch(options.url)).text()).toBe(transcript);
  fetchMock.mockResolvedValue(new Response("", { status: 403, statusText: "Forbidden" }));
  button("record-btn").click();
  await waitForState("録音中");
  button("record-btn").click();
  await waitForState("文字起こし中");
  harness.dispatch({
    type: "TRANSCRIPTION_DONE",
    target: "background",
    payload: { transcript, recordingId },
  });
  await waitForState("エラー");
  expect(document.getElementById("status-message")?.textContent).toContain(
    "Ollama API: 403 Forbidden",
  );
  expect(document.getElementById("transcript-text")?.textContent).toBe(transcript);
  expect(button("record-btn").disabled).toBe(false);
  harness.setCaptureError("Extension has not been invoked for the current page");
  const count = harness.offscreenMessages.length;
  button("record-btn").click();
  await vi.waitFor(() =>
    expect(document.getElementById("status-message")?.textContent).toContain(
      "Extension has not been invoked",
    ),
  );
  expect(harness.offscreenMessages).toHaveLength(count);
});
