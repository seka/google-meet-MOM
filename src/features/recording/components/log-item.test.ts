import { describe, it, expect } from "vite-plus/test";
import { createLogChunk } from "./log-item";

describe("createLogChunk", () => {
  it("p 要素を返す", () => {
    const el = createLogChunk("hello");
    expect(el.tagName).toBe("P");
  });

  it("テキストが設定される", () => {
    const el = createLogChunk("hello world");
    expect(el.textContent).toBe("hello world");
  });

  it("log-chunk クラスが付く", () => {
    const el = createLogChunk("test");
    expect(el.className).toBe("log-chunk");
  });
});
