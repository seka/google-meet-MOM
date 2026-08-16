# Google Meet MOM

Google Meet の音声をローカルで録音し、Whisper で文字起こし・Ollama で議事録を自動生成する Chrome Extension です。
音声データは外部サービスへ一切送信されません。

## Overview

- **録音**: タブ音声 + マイクをミックスして録音
- **文字起こし**: Whisper WASM（`@huggingface/transformers`）でローカル実行
- **話者分離**: Google Meet の DOM を監視し、発言者を自動タグ付け
- **議事録生成**: Ollama のローカル LLM で Markdown 形式の議事録を生成
- **サイドパネル**: 録音中に発言ログをリアルタイムで表示

## Getting Started

### Prerequisites

- Google Chrome 114 以上
- [Ollama](https://ollama.com/) インストール済み・起動中
- Ollama に任意のモデルが pull 済み（例: `ollama pull llama3.2`）

### Setup

```bash
# 依存関係のインストール
npm install

# ビルド
npm run build
```

Chrome で `chrome://extensions` を開き、「パッケージ化されていない拡張機能を読み込む」から `dist/` フォルダを選択してください。

## Usage

1. Google Meet のミーティングに参加する
2. Chrome ツールバーの拡張機能アイコンをクリックしてサイドパネルを開く
3. 「録音開始」ボタンをクリック
4. ミーティング終了後「録音停止」をクリック
5. 文字起こしと議事録がサイドパネルに表示されます

## Development

```bash
npm run dev          # ファイル変更を監視して自動ビルド
npx vp check         # Lint・型チェック
npx vp check --fix   # フォーマット自動修正
npm test             # ユニットテストとブラウザテスト
npm run test:browser # Chromiumでブラウザテストのみ実行
```

ブラウザテストを初めて実行する前に、Playwright 管理下の Chromium をインストールしてください。

```bash
vp exec playwright install chromium
```

ブラウザテストは headless Chromium で実行され、失敗時のブラウザ例外と `console` 出力は Vitest の結果に表示されます。

ビルド後、`chrome://extensions` で拡張機能の更新ボタン（🔄）をクリックして反映します。
設定画面の「この拡張機能について」では、バージョンとビルド元のGitコミットIDを確認できます。
作業ツリーに未コミットの変更がある状態でビルドした場合、コミットIDには `-dirty` が付きます。

### 設定

拡張機能の設定ページから以下を変更できます：

| 設定             | デフォルト               | 説明                                         |
| ---------------- | ------------------------ | -------------------------------------------- |
| Ollama URL       | `http://localhost:11434` | Ollama のエンドポイント                      |
| Ollama モデル    | `llama3.2`               | 議事録生成に使用するモデル                   |
| Whisper モデル   | `whisper-tiny`           | 文字起こしモデル（初回ダウンロード約 150MB） |
| 発言ログ更新間隔 | 15 秒                    | 録音中のプレビュー更新頻度                   |
| 議事録の出力先   | ブラウザ内に保存         | Markdown ファイルとして自動保存可能          |
| 録音の出力先     | ブラウザ内に保存         | WebM 音声ファイルとして自動保存可能          |
| テーマ           | システム設定に合わせる   | ライト / ダークを明示指定可能                |

### 技術的制約

詳細は [`docs/CONSTRAINTS.md`](docs/CONSTRAINTS.md) を参照してください。

## License

MIT
