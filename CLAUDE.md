# Google Meet MOM — Claude 向け指示書

Google Meet の音声をローカルで録音・文字起こし・議事録化する Chrome Extension（MV3）。
外部サービスへの音声送信は行わず、Whisper WASM（文字起こし）と Ollama（議事録生成）をすべてローカルで完結させる。

## 技術スタック

| 役割           | 技術                                                       |
| -------------- | ---------------------------------------------------------- |
| 言語           | TypeScript                                                 |
| ビルド         | Vite+（`vp` コマンド）                                     |
| 文字起こし     | `@huggingface/transformers` v3（Whisper WASM）             |
| 議事録生成     | Ollama REST API（`localhost:11434`）                       |
| 音声キャプチャ | `chrome.tabCapture` + `getUserMedia` + Web Audio API       |
| ストレージ     | IndexedDB（録音・テキスト）+ `chrome.storage.sync`（設定） |

## 主要コマンド

```bash
npm run dev      # ファイル監視 + 自動ビルド（開発時）
npm run build    # プロダクションビルド → dist/
npx vp check     # フォーマット・Lint・型チェック
npx vp check --fix  # 自動修正
```

## エントリーポイント

| ファイル            | 役割                                                           |
| ------------------- | -------------------------------------------------------------- |
| `src/background.ts` | Service Worker。録音制御・状態管理・Ollama 呼び出し            |
| `src/content.ts`    | Google Meet に注入。ミーティングタイトル取得・話者検出         |
| `src/offscreen.ts`  | 音声録音・Whisper WASM 実行（Offscreen Document）              |
| `src/sidepanel.ts`  | サイドパネル UI。録音制御・発言ログ・議事録表示                |
| `src/options.ts`    | 設定ページ（Ollama URL・モデル・Whisper モデル・チャンク間隔） |

## 開発上の注意

- `vp check` は型チェックを含む。コード変更後は必ず通すこと
- `minify: false` は Chrome Web Store ポリシー対応のため変更しない
- Whisper WASM は SharedArrayBuffer 無効環境向けに `numThreads = 1` で固定している
- 話者分離は Google Meet DOM の MutationObserver に依存（DOM 変更で動作しなくなる可能性あり）
- 制約の詳細は `docs/CONSTRAINTS.md` を参照
