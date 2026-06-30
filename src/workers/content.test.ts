import { describe, it, expect, beforeEach } from "vite-plus/test";
import { getMeetingTitle, getActiveSpeaker } from "./content";

beforeEach(() => {
  document.body.innerHTML = "";
  document.title = "テスト会議 - Google Meet";
});

describe("getMeetingTitle", () => {
  it("[data-meeting-title] 属性の要素からタイトルを取得する", () => {
    document.body.innerHTML = '<div data-meeting-title="">デザインレビュー</div>';
    expect(getMeetingTitle()).toBe("デザインレビュー");
  });

  it("該当要素がなければ document.title から取得する", () => {
    expect(getMeetingTitle()).toBe("テスト会議");
  });

  it("document.title も空なら 'Google Meet' を返す", () => {
    document.title = "";
    expect(getMeetingTitle()).toBe("Google Meet");
  });
});

describe("getActiveSpeaker", () => {
  it("data-is-speaking='true' の要素から話者名を取得する", () => {
    document.body.innerHTML = `
      <div data-participant-id="1" data-is-speaking="true">
        <span data-self-name="">田中 太郎</span>
      </div>
    `;
    expect(getActiveSpeaker()).toBe("田中 太郎");
  });

  it("aria-label から '田中 太郎 が話しています' → '田中 太郎' を抽出する", () => {
    document.body.innerHTML = `
      <div jsname="EydYod" aria-label="田中 太郎 が話しています"></div>
    `;
    expect(getActiveSpeaker()).toBe("田中 太郎");
  });

  it("is speaking の英語表記にも対応する", () => {
    document.body.innerHTML = `
      <div jsname="EydYod" aria-label="John Doe is speaking"></div>
    `;
    expect(getActiveSpeaker()).toBe("John Doe");
  });

  it("話者がいない場合は null を返す", () => {
    expect(getActiveSpeaker()).toBeNull();
  });
});
