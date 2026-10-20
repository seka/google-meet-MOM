import { afterAll, beforeAll, expect, it, vi } from "vite-plus/test";
import sidepanelHtml from "../../pages/sidepanel/sidepanel.html?raw";
import { getRecording, saveRecording } from "../../db";
import { createExtensionHarness } from "./extension-harness";

const transcript = "田中: 来週までに資料を準備します。";
const minutes = "## 決定事項\n来週までに資料を準備する。";
const recordedAt = "2026-10-17T03:00:00.000Z";
const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
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

async function download(id: string, filename: RegExp): Promise<Response> {
  const calls = harness.chrome.downloads.download.mock.calls.length;
  button(id).click();
  await vi.waitFor(() =>
    expect(harness.chrome.downloads.download).toHaveBeenCalledTimes(calls + 1),
  );
  const options = harness.chrome.downloads.download.mock.calls[calls][0];
  expect(options.saveAs).toBe(true);
  expect(options.filename).toMatch(filename);
  return browserFetch(options.url);
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
    date: recordedAt,
    duration: 1,
    audioBlob: new Blob([audio], { type: "audio/webm;codecs=opus" }),
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

  expect(
    await (await download("download-transcript-btn", /_テスト会議_transcript\.txt$/)).text(),
  ).toBe(transcript);
  const firstAudio = await download("download-recording-btn", /_テスト会議_recording\.webm$/);
  expect(new Uint8Array(await firstAudio.arrayBuffer())).toEqual(audio);
  document.querySelector<HTMLButtonElement>('[data-tab="minutes"]')!.click();
  expect(document.getElementById("minutes-tab")!.hidden).toBe(false);
  expect(await (await download("download-minutes-btn", /_テスト会議_minutes\.md$/)).text()).toBe(
    `# テスト会議\n\n生成日時: ${recordedAt}\n\n${minutes}`,
  );

  const firstRecord = await getRecording(recordingId);
  const secondTranscript = "佐藤: 次回は金曜日に進捗を確認します。";
  const secondAudio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9, 8, 7]);
  fetchMock.mockResolvedValue(new Response("", { status: 403, statusText: "Forbidden" }));
  button("record-btn").click();
  await waitForState("録音中");
  expect(document.getElementById("transcript-text")?.textContent).toBe("");
  expect(document.getElementById("minutes-text")?.textContent).toBe("");
  button("record-btn").click();
  await waitForState("文字起こし中");
  const secondRecordingId = await saveRecording({
    meetingTitle: "次回会議",
    date: "2026-10-18T03:00:00.000Z",
    duration: 2,
    audioBlob: new Blob([secondAudio], { type: "audio/webm;codecs=opus" }),
    transcript: secondTranscript,
    minutes: "",
  });
  expect(secondRecordingId).not.toBe(recordingId);
  const downloadCount = harness.chrome.downloads.download.mock.calls.length;
  harness.dispatch({
    type: "TRANSCRIPTION_DONE",
    target: "background",
    payload: { transcript: secondTranscript, recordingId: secondRecordingId },
  });
  await waitForState("エラー");
  expect(document.getElementById("status-message")?.textContent).toContain(
    "Ollama API: 403 Forbidden",
  );
  expect(document.getElementById("transcript-text")?.textContent).toBe(secondTranscript);
  expect(harness.chrome.downloads.download).toHaveBeenCalledTimes(downloadCount);
  expect(
    await (await download("download-transcript-btn", /_次回会議_transcript\.txt$/)).text(),
  ).toBe(secondTranscript);
  expect(
    new Uint8Array(
      await (await download("download-recording-btn", /_次回会議_recording\.webm$/)).arrayBuffer(),
    ),
  ).toEqual(secondAudio);
  const secondRecord = await getRecording(secondRecordingId);
  expect(secondRecord?.transcript).toBe(secondTranscript);
  expect(secondRecord?.minutes).toBe("");
  expect(await getRecording(recordingId)).toEqual(firstRecord);
  expect(new Uint8Array(await (await getRecording(recordingId))!.audioBlob.arrayBuffer())).toEqual(
    audio,
  );
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
