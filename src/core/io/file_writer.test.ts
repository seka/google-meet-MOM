import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { buildMinutesMarkdown, buildOutputFilename, downloadTextFile } from "./file_writer";

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime as unknown as Record<string, unknown>).lastError = undefined;
});

describe("buildMinutesMarkdown", () => {
  it("会議名・生成日時・議事録を Markdown に整形する", () => {
    expect(
      buildMinutesMarkdown({
        meetingTitle: "週次ミーティング",
        generatedAt: "2026-08-05T01:02:03.000Z",
        minutes: "## 決定事項\n\n- テストを追加する",
      }),
    ).toBe(
      "# 週次ミーティング\n\n生成日時: 2026-08-05T01:02:03.000Z\n\n## 決定事項\n\n- テストを追加する",
    );
  });
});

describe("buildOutputFilename", () => {
  it("ファイル名に使えない文字を置換して Markdown のファイル名を生成する", () => {
    expect(
      buildOutputFilename({
        meetingTitle: ' 開発 / 定例: "第1回" ',
        date: "invalid-date",
        kind: "minutes",
        extension: "md",
      }),
    ).toBe("google-meet-mom_invalid-date_開発_定例_第1回_minutes.md");
  });
});

describe("downloadTextFile", () => {
  it("UTF-8 の data URL と指定されたファイル名でダウンロードする", async () => {
    (chrome.downloads.download as ReturnType<typeof vi.fn>).mockImplementation(
      (_options: chrome.downloads.DownloadOptions, callback?: (downloadId?: number) => void) => {
        callback?.(123);
      },
    );

    await expect(
      downloadTextFile({
        text: "# 議事録\n\n完了",
        filename: "minutes.md",
        mimeType: "text/markdown",
      }),
    ).resolves.toBe(123);

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      {
        url: `data:text/markdown;charset=utf-8,${encodeURIComponent("# 議事録\n\n完了")}`,
        filename: "minutes.md",
        saveAs: true,
      },
      expect.any(Function),
    );
  });

  it("Chrome のダウンロードエラーを呼び出し元へ返す", async () => {
    (chrome.downloads.download as ReturnType<typeof vi.fn>).mockImplementation(
      (_options: chrome.downloads.DownloadOptions, callback?: (downloadId?: number) => void) => {
        (chrome.runtime as unknown as Record<string, unknown>).lastError = {
          message: "Download failed",
        };
        callback?.();
        (chrome.runtime as unknown as Record<string, unknown>).lastError = undefined;
      },
    );

    await expect(
      downloadTextFile({
        text: "議事録",
        filename: "minutes.md",
        mimeType: "text/markdown",
      }),
    ).rejects.toThrow("Download failed");
  });
});
