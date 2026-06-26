# Google Meet MOM - Implementation Plan

**Project**: Google Meet Minutes of Meeting (MOM) Chrome Extension  
**Status**: Planning Phase  
**Last Updated**: 2026-06-25

---

## 1. Project Vision

Google MeetやZoom等のミーティングツールで、ユーザーがメモを取る手間から解放されるChrome拡張機能。
発言者、発言内容、タイムスタンプを自動的に記録し、リアルタイムで確認・共有できるプラットフォームニュートラルな議事録システム。

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
- 後から議事録として参照可能

---

## 3. Core Features

### 3.1 Primary Features (MVP)

#### Feature 1: 発言記録と表示

- **説明**: Google Meetのビデオ会話中に、各参加者の発言をリアルタイムで記録
- **詳細**:
  - 発言者の名前
  - 発言内容（テキスト）
  - タイムスタンプ（HH:MM:SS 形式）
  - 発言順序

#### Feature 2: Side Panel でのリアルタイム表示

- **説明**: Chrome のSide Panelに議事録リストを表示
- **詳細**:
  - スクロール可能なリスト
  - 各発言の詳細情報を表示
  - ミーティング中に継続的に更新

#### Feature 3: ローカルストレージへの保存

- **説明**: ミーティング終了後、議事録をローカルに保存
- **詳細**:
  - JSON または Markdown 形式で保存
  - IndexedDB またはローカルストレージを使用
  - ミーティングタイトル、日時、参加者リストも保存

#### Feature 4: ダウンロード機能

- **説明**: 保存した議事録をダウンロード可能
- **詳細**:
  - Obsidian 互換フォーマット（Markdown + YAML フロントマター）
  - CSV 形式のオプション
  - プレーンテキスト形式

### 3.2 Future Features (Post-MVP)

- [ ] 要約機能（LLM による自動要約）
- [ ] 複数ツール対応（Zoom, Teams, Webex など）
- [ ] クラウド同期
- [ ] 複数ミーティングの管理・検索
- [ ] タグ・カテゴリ分け
- [ ] AIによる重要ポイント抽出
- [ ] 発言時間の統計分析

---

## 4. Technical Architecture

### 4.1 Technology Stack

```
Frontend:
- TypeScript
- Chrome Manifest V3
- Side Panel API

Storage:
- IndexedDB (ローカルストレージ)
- または LocalStorage

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
│   └── types.ts                  # 型定義
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
```

### 4.4 Key APIs & Technologies

**Chrome APIs**:

- `chrome.sidePanel` - Side Panel表示
- `chrome.storage` - ローカルストレージ
- `chrome.tabs` - タブ情報取得
- Content Scripts API - ページ内容の取得

**Google Meet 連携**:

- DOM インスペクション（参加者名、チャット等）
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

### Phase 3: 要約機能 (Future)

**Goal**: LLM による自動要約

- [ ] LLM API 連携（OpenAI等）
- [ ] プロンプト設計
- [ ] 要約ダウンロード機能

**期間**: 1週間（推定）

### Phase 4: 複数ツール対応 (Future)

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

---

## 7. Risks & Mitigation

| Risk                             | Impact | Mitigation                                   |
| -------------------------------- | ------ | -------------------------------------------- |
| Google Meet の UI/API 変更に対応 | High   | DOM インスペクション + 定期テスト            |
| ローカルストレージの容量限制     | Medium | IndexedDB使用、古いレコード削除              |
| プライバシー懸念                 | High   | ローカルストレージのみ、クラウド不使用を明記 |
| 複数言語対応の後付けコスト       | Medium | 最初から i18n 対応を検討                     |

---

## 8. Development Workflow

1. **環境構築**: TypeScript + Webpack + Chrome Extension 開発環境
2. **バージョン管理**: Git + GitHub
3. **テスト**: Manual Testing + 自動テスト（予定）
4. **リリース**: Chrome Web Store への公開準備

---

## 9. Notes & Open Questions

- [ ] Google Meet API vs DOM Inspection の詳細調査が必要
- [ ] Obsidian との正確な互換フォーマットを確認
- [ ] LLM による要約の精度・コスト検討（Phase 3）
- [ ] 複数ツール対応時の優先度順（Zoom → Teams → Webex？）
