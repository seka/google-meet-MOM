import { describe, expect, it } from "vite-plus/test";
import { renderRecordingControls } from "./recording-controls";

function createElements() {
  return {
    recordButton: document.createElement("button"),
    microphoneIcon: document.createElement("span"),
    stopIcon: document.createElement("span"),
    statusBadge: document.createElement("span"),
    statusLabel: document.createElement("span"),
    statusSpinner: document.createElement("span"),
    statusBar: document.createElement("div"),
    statusMessage: document.createElement("p"),
  };
}

describe("renderRecordingControls", () => {
  it("録音中は停止アイコンを表示する", () => {
    const elements = createElements();

    renderRecordingControls(elements, "recording");

    expect(elements.microphoneIcon.classList.contains("hidden")).toBe(true);
    expect(elements.stopIcon.classList.contains("hidden")).toBe(false);
    expect(elements.recordButton.classList.contains("recording")).toBe(true);
  });

  it("処理中は録音ボタンを無効化する", () => {
    const elements = createElements();

    renderRecordingControls(elements, "transcribing");

    expect(elements.recordButton.disabled).toBe(true);
    expect(elements.statusSpinner.classList.contains("hidden")).toBe(false);
  });

  it("エラーメッセージを表示する", () => {
    const elements = createElements();

    renderRecordingControls(elements, "error", "failed");

    expect(elements.statusBar.classList.contains("hidden")).toBe(false);
    expect(elements.statusMessage.textContent).toBe("failed");
  });
});
