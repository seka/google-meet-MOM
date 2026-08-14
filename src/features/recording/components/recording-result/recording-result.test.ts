import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createRecordingResult } from "./recording-result";

beforeEach(() => {
  document.body.innerHTML = `
    <section id="result-section" hidden>
      <button class="tab active" data-tab="transcript"></button>
      <button class="tab" data-tab="minutes"></button>
      <div id="transcript-tab"><pre id="transcript-text"></pre></div>
      <div id="minutes-tab" hidden><pre id="minutes-text"></pre></div>
      <button id="copy-btn"></button>
      <button id="download-btn"></button>
    </section>
  `;
});

describe("createRecordingResult", () => {
  it("文字起こしを表示する", () => {
    const result = createRecordingResult(vi.fn());

    result.showTranscript("transcript");

    expect(document.getElementById("transcript-text")?.textContent).toBe("transcript");
    expect((document.getElementById("result-section") as HTMLElement).hidden).toBe(false);
  });

  it("文字起こしがない場合は議事録タブを表示する", () => {
    const result = createRecordingResult(vi.fn());

    result.showMinutes("minutes");

    expect((document.getElementById("minutes-tab") as HTMLElement).hidden).toBe(false);
  });

  it("リセットで結果をクリアする", () => {
    const result = createRecordingResult(vi.fn());
    result.showTranscript("transcript");

    result.reset();

    expect(document.getElementById("transcript-text")?.textContent).toBe("");
    expect((document.getElementById("result-section") as HTMLElement).hidden).toBe(true);
  });
});
