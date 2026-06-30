import { describe, it, expect, beforeEach } from "vite-plus/test";
import { updateBadge } from "./badge";

describe("updateBadge", () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement("span");
  });

  it.each([
    ["idle", "待機中"],
    ["recording", "録音中"],
    ["transcribing", "文字起こし中"],
    ["summarizing", "議事録作成中"],
    ["done", "完了"],
    ["error", "エラー"],
  ])("state=%s のとき textContent が %s になる", (state, label) => {
    updateBadge(el, state);
    expect(el.textContent).toBe(label);
  });

  it("className が badge-{state} になる", () => {
    updateBadge(el, "recording");
    expect(el.className).toBe("badge badge-recording");
  });

  it("未知の state はそのまま表示される", () => {
    updateBadge(el, "unknown");
    expect(el.textContent).toBe("unknown");
  });
});
