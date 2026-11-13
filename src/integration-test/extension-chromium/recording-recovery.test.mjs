import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// 前提: distの実拡張を専用Chromiumへ読み込み、Chrome APIは置き換えない。
// チェック内容: 状態取得・offscreenのready・拡張ページ再表示・開始失敗後の終了と再作成を行う。
// 期待値: 待機/エラー状態が取得でき、offscreen再作成後もreadyが返る。
// 通常の拡張ページを使うためSide Panel枠やactiveTab付与、正常なタブ録音は対象外。
await test(
  "built extension communicates across panel, service worker and offscreen",
  { timeout: 45000 },
  async () => {
    const extension = resolve("dist");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      timeout: 15000,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    context.setDefaultTimeout(8000);
    context.setDefaultNavigationTimeout(10000);
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
      const id = new URL(worker.url()).hostname;
      const panelUrl = `chrome-extension://${id}/pages/sidepanel/sidepanel.html`;
      let panel = await context.newPage();
      await panel.goto(panelUrl);
      await panel.locator("#status-label").filter({ hasText: "待機中" }).waitFor();
      assert.deepEqual(
        await panel.evaluate(() => chrome.runtime.sendMessage({ type: "GET_STATE" })),
        { state: "idle", recordingId: null },
      );

      await worker.evaluate(async () => {
        await chrome.offscreen.createDocument({
          url: "workers/offscreen/offscreen.html",
          reasons: ["USER_MEDIA"],
          justification: "Automated extension messaging test",
        });
      });
      await assert.doesNotReject(async () => {
        await panel.waitForFunction(async () => {
          try {
            return (
              (
                await chrome.runtime.sendMessage({
                  type: "OFFSCREEN_RECORDING_READY",
                  target: "offscreen",
                })
              )?.ok === true
            );
          } catch {
            return false;
          }
        });
      });
      await panel.close();
      panel = await context.newPage();
      await panel.goto(panelUrl);
      await panel.locator("#status-label").filter({ hasText: "待機中" }).waitFor();
      assert.deepEqual(
        await panel.evaluate(() =>
          chrome.runtime.sendMessage({ type: "OFFSCREEN_RECORDING_READY", target: "offscreen" }),
        ),
        { ok: true },
      );
      await worker.evaluate(() => chrome.offscreen.closeDocument());
      assert.equal(
        await worker.evaluate(
          async () =>
            (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length,
        ),
        0,
      );
      const failedStart = await panel.evaluate(() =>
        chrome.runtime.sendMessage({
          type: "START_RECORDING",
          target: "background",
          payload: {
            streamId: "invalid-test-stream",
            tabId: 999999,
            meetingTitle: "Failure test",
            settings: {
              ollamaUrl: "http://localhost:11434",
              ollamaModel: "unused",
              whisperModel: "unused",
              language: "ja",
              chunkIntervalSec: 60,
              appearance: "system",
            },
          },
        }),
      );
      assert.equal(failedStart.ok, false);
      assert.equal(typeof failedStart.error, "string");
      assert.equal(
        await panel.evaluate(
          async () => (await chrome.runtime.sendMessage({ type: "GET_STATE" })).state,
        ),
        "error",
      );
      await panel.close();
      panel = await context.newPage();
      await panel.goto(panelUrl);
      await panel.locator("#status-label").filter({ hasText: "エラー" }).waitFor();
      await panel.waitForFunction(
        async () =>
          (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length === 0,
      );
      await worker.evaluate(() =>
        chrome.offscreen.createDocument({
          url: "workers/offscreen/offscreen.html",
          reasons: ["USER_MEDIA"],
          justification: "Verify offscreen recovery after recording failure",
        }),
      );
      await panel.waitForFunction(async () => {
        try {
          return (
            (
              await chrome.runtime.sendMessage({
                type: "OFFSCREEN_RECORDING_READY",
                target: "offscreen",
              })
            )?.ok === true
          );
        } catch {
          return false;
        }
      });
    } catch (error) {
      await mkdir("test-results/extension", { recursive: true });
      await context.tracing.stop({ path: "test-results/extension/trace.zip" });
      throw error;
    } finally {
      await context.close();
    }
  },
);
