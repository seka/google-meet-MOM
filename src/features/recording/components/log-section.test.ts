import { describe, it, expect, beforeEach } from "vite-plus/test";
import { appendChunk, resetLog } from "./log-section";

describe("appendChunk", () => {
  let logContent: HTMLElement;
  let placeholder: HTMLElement;

  beforeEach(() => {
    logContent = document.createElement("div");
    placeholder = document.createElement("p");
    placeholder.hidden = false;
    logContent.appendChild(placeholder);
  });

  it("テキストを追加すると placeholder が非表示になる", () => {
    appendChunk(logContent, placeholder, "hello");
    expect(placeholder.hidden).toBe(true);
  });

  it("テキストが p 要素として追加される", () => {
    appendChunk(logContent, placeholder, "hello");
    const chunks = logContent.querySelectorAll("p.log-chunk");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].textContent).toBe("hello");
  });

  it("空白のみのテキストは追加しない", () => {
    appendChunk(logContent, placeholder, "   ");
    expect(placeholder.hidden).toBe(false);
    expect(logContent.querySelectorAll("p.log-chunk")).toHaveLength(0);
  });

  it("複数回追加できる", () => {
    appendChunk(logContent, placeholder, "first");
    appendChunk(logContent, placeholder, "second");
    expect(logContent.querySelectorAll("p.log-chunk")).toHaveLength(2);
  });
});

describe("resetLog", () => {
  let logContent: HTMLElement;
  let placeholder: HTMLElement;

  beforeEach(() => {
    logContent = document.createElement("div");
    placeholder = document.createElement("p");
    placeholder.hidden = true;
    logContent.innerHTML = "<p>existing</p>";
    logContent.appendChild(placeholder);
  });

  it("既存の要素がクリアされる", () => {
    resetLog(logContent, placeholder);
    expect(logContent.querySelectorAll("p.log-chunk")).toHaveLength(0);
  });

  it("placeholder が再表示される", () => {
    resetLog(logContent, placeholder);
    expect(placeholder.hidden).toBe(false);
  });

  it("placeholder が logContent に残る", () => {
    resetLog(logContent, placeholder);
    expect(logContent.contains(placeholder)).toBe(true);
  });
});
