import { afterEach, expect, it, vi } from "vite-plus/test";
import sidepanelHtml from "../../../../pages/sidepanel/sidepanel.html?raw";
import { createRecordingResult } from "./recording-result";

afterEach(() => {
  document.body.replaceChildren();
});

it("結果表示では保存せず、各タブのボタンから対応する内容をダウンロードする", () => {
  const panel = new DOMParser().parseFromString(sidepanelHtml, "text/html");
  document.body.innerHTML = panel.body.innerHTML;
  const downloads = {
    recording: vi.fn().mockResolvedValue(undefined),
    transcript: vi.fn().mockResolvedValue(undefined),
    minutes: vi.fn().mockResolvedValue(undefined),
  };
  const result = createRecordingResult(vi.fn(), downloads);
  result.showTranscript("会議の文字起こし");
  result.showMinutes("会議の議事録");

  expect(downloads.recording).not.toHaveBeenCalled();
  expect(downloads.transcript).not.toHaveBeenCalled();
  expect(downloads.minutes).not.toHaveBeenCalled();

  document.getElementById("download-transcript-btn")!.click();
  expect(downloads.transcript).toHaveBeenCalledExactlyOnceWith("会議の文字起こし");
  expect(downloads.minutes).not.toHaveBeenCalled();

  document.querySelector<HTMLButtonElement>('[data-tab="minutes"]')!.click();
  expect(document.getElementById("minutes-tab")!.hidden).toBe(false);
  document.getElementById("download-minutes-btn")!.click();
  expect(downloads.minutes).toHaveBeenCalledExactlyOnceWith("会議の議事録");

  document.getElementById("download-recording-btn")!.click();
  expect(downloads.recording).toHaveBeenCalledOnce();
});
