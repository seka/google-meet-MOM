# Google Meet MOM - Implementation Plan

**Project**: Google Meet Minutes of Meeting (MOM) Chrome Extension  
**Status**: Planning Phase  
**Last Updated**: 2026-07-08

---

## 1. Project Vision

Google Meet で、ユーザーがメモを取る手間から解放される Chrome 拡張機能。
発言者、発言内容、タイムスタンプを自動的に記録し、ローカル Whisper とローカル LLM を使って文字起こし・議事録・アクションアイテムを生成する OSS の議事録システム。

Tactiq のような商用 AI 会議メモツールの UI/UX とワークフローは参考にしつつ、Google Meet MOM は次の差別化を重視する。

- 会議音声・文字起こし・議事録を外部 SaaS に送らない
- Ollama などのローカル LLM を利用できる
- OSS として処理内容を監査できる
- Markdown / JSON など、ユーザーが再利用しやすい形式で保存できる
- Google Meet に絞って軽量でわかりやすい体験を作る

---

## 2. Target Users & Use Cases

**対象ユーザー**: 個人ユーザー

**主なユースケース**:

- カジュアル面談の記録
- 採用面接の議事録作成
- プロジェクトミーティングの要点記録
- 学習用のオンライン講座記録

**ユーザーメリット**:

- メモ取りの手間を削減
- リアルタイムで発言内容を確認できる
- 聞き逃し防止
- ローカル環境で安心して議事録・アクションアイテムを生成できる
- 後から議事録、アクションアイテム、フォローアップ文面として参照・再利用可能

---

## 3. Core Features

### 3.1 Primary Features (MVP)

#### Feature 1: リアルタイム文字起こしと発言記録

- **説明**: Google Meet のビデオ会話中に、各参加者の発言をリアルタイムで文字起こし・記録
- **詳細**:
  - 発言者の名前
  - 発言内容（テキスト）
  - タイムスタンプ（HH:MM:SS 形式）
  - 発言順序
  - 録音中の逐次プレビュー
  - 話者ごとの表示分離

#### Feature 2: Side Panel でのリアルタイム表示

- **説明**: Chrome のSide Panelに議事録リストを表示
- **詳細**:
  - スクロール可能なリスト
  - 各発言の詳細情報を表示
  - ミーティング中に継続的に更新
  - 録音・文字起こし・要約・完了・エラーの状態表示
  - エラーや警告を UI に表示し、必要に応じて console にも記録

#### Feature 3: 議事録の要約作成

- **説明**: 文字起こし完了後、ローカル LLM で議事録 Markdown を生成
- **詳細**:
  - 会議概要
  - 決定事項
  - 論点・背景
  - 未決事項
  - 次に確認すること
  - テンプレート切り替え（通常議事録、1on1、意思決定ログ、商談、振り返り）

#### Feature 4: アクションアイテムの抽出

- **説明**: 会議内容から担当者・期限・内容を構造化して抽出
- **詳細**:
  - タスク内容
  - 担当者
  - 期限
  - ステータス
  - 根拠となる発言または要約箇所
  - Markdown セクションと内部 JSON の両方で保持

#### Feature 5: ローカルストレージへの保存

- **説明**: ミーティング終了後、録音・文字起こし・議事録・アクションアイテムをローカルに保存
- **詳細**:
  - IndexedDB を使用
  - ミーティングタイトル、日時、参加者リストも保存
  - 文字起こし、議事録、アクションアイテムを同じ recording に紐付け

#### Feature 6: ダウンロード機能

- **説明**: 保存した議事録をダウンロード可能
- **詳細**:
  - Obsidian 互換フォーマット（Markdown + YAML フロントマター）
  - Markdown 形式の議事録自動保存
  - JSON 形式の内部データエクスポート
  - プレーンテキスト形式

### 3.2 Future Features (Post-MVP)

- [ ] フォローアップ文面生成（参加者向け共有文、Slack 投稿文、次回までのタスク一覧）
- [ ] 複数ミーティングの管理・全文検索
- [ ] タグ・カテゴリ分け
- [ ] 会議中の重要発言ハイライト
- [ ] カスタムプロンプト / AI テンプレート保存
- [ ] Google Docs / Notion / Slack / GitHub Issue などへの任意連携
- [ ] 発言時間の統計分析
- [ ] 複数ツール対応（Zoom, Teams, Webex など）

### 3.3 Product Benchmark: Tactiq から参考にすること

Tactiq はリアルタイム文字起こし、AI 要約、アクションアイテム抽出、フォローアップメール作成、外部サービス連携を一連の体験としてまとめている。Google Meet MOM では、同じワークフローをローカル・OSS 前提で再解釈する。

| Benchmark area         | 参考にする体験               | Google Meet MOM での実装方針                          |
| ---------------------- | ---------------------------- | ----------------------------------------------------- |
| リアルタイム文字起こし | 会議中に発言を逐次確認できる | Side Panel で話者・時刻・本文を読みやすく表示         |
| AI 要約                | 会議終了後に要約を即時生成   | ローカル LLM で Markdown 議事録を生成                 |
| アクションアイテム     | タスクを自動抽出する         | 担当者・期限・根拠を構造化して保存                    |
| フォローアップ         | メールや共有文を生成する     | まずは Markdown / クリップボード、後で Slack 等に拡張 |
| 検索・整理             | 過去会議を探せる             | IndexedDB 上の録音履歴を全文検索                      |
| 連携                   | Docs / Notion / CRM 等に送る | デフォルトはローカル保存、外部連携は明示的な opt-in   |

### 3.4 UI/UX Improvement Ideas

#### Meeting-time UX

- 録音ボタンは常に右下に固定し、録音中は停止操作を明確にする
- 状態バッジで `待機中 / 録音中 / 文字起こし中 / 議事録作成中 / 完了 / エラー` を表示
- エラーは握り潰さず、ユーザーが次に何をすればよいか分かる文面で表示
- 文字起こしログは自動スクロールしつつ、ユーザーが過去ログを読んでいる場合は勝手に追従しない
- 話者名、時刻、本文の視覚的な階層を明確にする
- 会議中に重要発言へスターやハイライトを付けられるようにする

#### Post-meeting UX

- 会議終了後は `文字起こし / 議事録 / アクションアイテム / フォローアップ` のタブ構成にする
- 議事録生成中は進行中であることを明示し、完了後に自動で議事録タブへ誘導する
- アクションアイテムはチェックリストとして表示し、担当者・期限を編集できるようにする
- フォローアップ文面は `参加者向け共有文`、`Slack 投稿文`、`次回までのタスク一覧` を切り替えられるようにする
- コピー、Markdown ダウンロード、JSON エクスポートを明確なアイコンボタンで提供する

#### Settings UX

- 設定画面は `モデル / 保存 / 表示 / テンプレート` のグルーピングにする
- Whisper モデルと Ollama モデルはテストボタンで疎通確認できるようにする
- 出力先は `ブラウザ内保存` と `Markdown ファイル保存` を明確に分ける
- 外部連携を追加する場合は、デフォルト off かつ送信先を明示する
- プライバシー方針として「デフォルトでは外部送信しない」を設定画面と README に表示する

---

## 4. Technical Architecture

### 4.1 Technology Stack

```
Frontend:
- TypeScript
- Chrome Manifest V3
- Side Panel API
- Vite+

Storage:
- IndexedDB
- chrome.storage.sync (設定)

AI / Audio:
- Whisper (ローカル文字起こし)
- Ollama (ローカル LLM)

Format:
- Markdown (Obsidian互換)
- JSON (内部フォーマット)
```

### 4.2 Project Structure

```
google-meet-mom/
├── src/
│   ├── content-script.ts         # Google Meetページ内で実行
│   ├── side-panel.ts             # Side Panel UI
│   ├── background.ts             # バックグラウンドスクリプト
│   ├── storage.ts                # ローカルストレージ管理
│   ├── formatter.ts              # ダウンロード形式変換
│   └── features/                 # 機能別の型定義・一部の UI 部品
├── public/
│   ├── manifest.json             # Extension設定
│   ├── side-panel.html           # Side Panel HTML
│   ├── icons/                    # 拡張機能アイコン
│   └── styles/                   # CSS
├── dist/                         # ビルド出力
├── tests/                        # テストファイル
├── package.json
├── tsconfig.json
├── webpack.config.js             # (またはVite等)
└── README.md
```

### 4.3 Data Model

```typescript
interface Recording {
  id: string; // ユニークID
  meetingTitle: string; // ミーティングタイトル
  startTime: Date; // 開始時刻
  endTime?: Date; // 終了時刻
  platform: "google-meet" | "zoom" | "teams"; // ツール
  participants: Participant[]; // 参加者リスト
  statements: Statement[]; // 発言リスト
  transcript?: string; // 最終文字起こし
  minutes?: string; // 生成済み議事録
  actionItems?: ActionItem[]; // 抽出されたアクションアイテム
}

interface Participant {
  id: string;
  name: string;
  avatar?: string; // プロフィール画像URL (オプション)
}

interface Statement {
  id: string;
  speakerId: string; // 発言者ID
  content: string; // 発言内容
  timestamp: number; // 開始時刻 (秒)
  duration?: number; // 発言時間 (秒)
}

interface ActionItem {
  id: string;
  title: string;
  assignee?: string;
  dueDate?: string;
  status: "open" | "done";
  sourceText?: string;
}
```

### 4.4 Key APIs & Technologies

**Chrome APIs**:

- `chrome.sidePanel` - Side Panel表示
- `chrome.storage` - ローカルストレージ
- `chrome.tabs` - タブ情報取得
- `chrome.tabCapture` - Google Meet タブ音声の取得
- `chrome.offscreen` - バックグラウンドでの録音・文字起こし処理
- `chrome.downloads` - Markdown などのファイル保存
- Content Scripts API - ページ内容の取得

**Google Meet 連携**:

- DOM インスペクション（参加者名、チャット等）
- タブ音声キャプチャ
- Content Script による会議タイトル・話者情報取得
- またはGoogle Meet API（将来オプション）

---

## 5. Implementation Phases

### Phase 1: MVP (Essential)

**Goal**: Google Meetの基本的な議事録記録機能

- [ ] Chrome Extension プロジェクトのセットアップ
- [ ] Manifest V3 設定
- [ ] Content Script で発言とタイムスタンプ検出
- [ ] Side Panel UI 実装
- [ ] IndexedDB/LocalStorage へのデータ保存
- [ ] Markdown ダウンロード機能
- [ ] Google Meet ページでの基本動作確認

**期間**: 1-2週間（推定）

### Phase 2: Polish & Testing

**Goal**: ユーザー体験の向上とテスト

- [ ] UIの改善
- [ ] エラーハンドリング強化
- [ ] 動作テスト（複数ブラウザ、複数ミーティング形態）
- [ ] パフォーマンス最適化
- [ ] ドキュメント整備

**期間**: 1週間（推定）

### Phase 3: ローカル AI 議事録 (Current Focus)

**Goal**: ローカル Whisper / ローカル LLM による文字起こし・議事録生成

- [ ] Whisper による録音後の文字起こし
- [ ] Ollama による議事録生成
- [ ] Markdown 議事録のブラウザ内保存
- [ ] Markdown ファイルへの自動保存
- [ ] モデル疎通テストとエラー表示
- [ ] プロンプト設計
- [ ] 議事録テンプレート選択

**期間**: 1週間（推定）

### Phase 4: Action Items & Follow-up

**Goal**: 会議後に必要な行動までつながる議事録体験

- [ ] アクションアイテム抽出プロンプト
- [ ] `担当者 / 期限 / 内容 / 根拠` の構造化保存
- [ ] アクションアイテム表示タブ
- [ ] チェック状態・編集機能
- [ ] フォローアップ文面生成
- [ ] クリップボードコピー
- [ ] Markdown へのアクションアイテム・フォローアップ出力

**期間**: 1週間（推定）

### Phase 5: Meeting History & Search

**Goal**: 過去会議を再利用できる状態にする

- [ ] 会議履歴一覧
- [ ] 文字起こし・議事録の全文検索
- [ ] タグ・カテゴリ
- [ ] 会議詳細画面
- [ ] JSON エクスポート / インポート

**期間**: 1-2週間（推定）

### Phase 6: 複数ツール対応 (Future)

**Goal**: Zoom, Teams等への拡張

- [ ] 各ツールの DOM/API 調査
- [ ] 共通インターフェース設計
- [ ] 個別実装

**期間**: 2-3週間（推定）

---

## 6. Success Criteria

### MVP完了時の判定基準

- [x] Google Meetで参加者名・発言・タイムスタンプが記録される
- [x] Side Panel でリアルタイム表示される
- [x] 議事録がローカルに保存される
- [x] Markdown 形式でダウンロード可能
- [x] Chrome Web Store へ公開可能な状態

### Product Differentiation

- [ ] デフォルトで会議データを外部 SaaS に送信しない
- [ ] ローカル Whisper / ローカル LLM を利用できる
- [ ] 文字起こし、議事録、アクションアイテムがローカルに保存される
- [ ] 保存・エクスポート形式がユーザーにとって再利用しやすい
- [ ] エラーや制約が UI 上で理解できる

---

## 7. Risks & Mitigation

| Risk                             | Impact | Mitigation                                   |
| -------------------------------- | ------ | -------------------------------------------- |
| Google Meet の UI/API 変更に対応 | High   | DOM インスペクション + 定期テスト            |
| ローカルストレージの容量限制     | Medium | IndexedDB使用、古いレコード削除              |
| プライバシー懸念                 | High   | ローカルストレージのみ、クラウド不使用を明記 |
| 複数言語対応の後付けコスト       | Medium | 最初から i18n 対応を検討                     |
| ローカルモデルのセットアップ難度 | High   | 設定画面の疎通テスト、README の手順強化      |
| 文字起こし・要約の処理時間       | Medium | 進行状態表示、軽量モデル選択、再試行導線     |
| アクションアイテムの誤抽出       | Medium | 根拠発言の表示、編集可能な UI、信頼度表示    |
| UI が会議中の邪魔になる          | Medium | Side Panel 中心、固定操作は最小限            |

---

## 8. Development Workflow

1. **環境構築**: TypeScript + Vite+ + Chrome Extension 開発環境
2. **バージョン管理**: Git + GitHub
3. **テスト**: Manual Testing + 自動テスト（予定）
4. **リリース**: Chrome Web Store への公開準備

---

## 9. Notes & Open Questions

- [ ] Google Meet API vs DOM Inspection vs tabCapture の詳細調査が必要
- [ ] Obsidian との正確な互換フォーマットを確認
- [ ] ローカル LLM による要約の精度・処理時間検討
- [ ] アクションアイテムの出力スキーマを確定
- [ ] フォローアップ文面のテンプレートを定義
- [ ] 会議履歴検索の UI 仕様を決める
- [ ] 複数ツール対応時の優先度順（Zoom → Teams → Webex？）
