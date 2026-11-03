# テスト環境

## 実行

```bash
vp install
vp exec playwright install chromium
npm run test:browser
npm run test:extension
```

Playwright管理下のheadless Chromiumを自動起動するため、普段使っているChromeへの拡張の読み込みやMeetへのログインは不要です。マイク、Whisperモデル、Ollamaも不要です。

```bash
npx vp test run --project=unit
npx vp check
npm run build
```

## 自動検証する範囲

| テスト     | 実際に動かすもの                                                                                                  | 置き換えるもの                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 操作フロー | サイドパネルHTML・起動処理、background、メッセージハンドラ、IndexedDB、Ollamaクライアント、ダウンロード用Blob生成 | Chrome API、offscreenからの録音・文字起こし応答、OllamaのHTTP応答               |
| 音声録音   | Web Audioの合成音声、RecordingSession、MediaRecorder、WebM復号                                                    | マイク・Meetの音声入力を合成音声に置換                                          |
| 音声混合   | 本番offscreen録音処理、Web Audioの混合、MediaRecorder、IndexedDB、音声復号・リサンプリング                        | タブとマイクの入力を別々の合成音声に置換。Whisperクライアントの推論のみ固定応答 |
| 拡張間通信 | ビルド済み拡張、実際のService Worker・offscreen document・ChromeのメッセージAPI、拡張ページの開き直し             | 外部サービスなし。録音失敗には無効なstream IDを使用                             |
| 結果表示   | サイドパネルHTMLと結果表示コンポーネント                                                                          | ダウンロードコールバック                                                        |

操作フローでは、アイコン操作だけでは録音が始まらないこと、録音開始・停止の通知、停止時にダウンロードされないこと、文字起こしから議事録生成・IndexedDB保存までの連携、ボタン操作での保存内容を確認します。続けてOllamaの403とキャプチャ権限拒否を発生させ、エラー表示と文字起こしの維持を確認します。

`extension-harness.ts` はChromeのメッセージAPIの限定的な代替です。通知に応答がないときも常に成功を返すのではなく、応答ポートのエラーを発生させ、通知失敗で録音が中断しないことを検証します。ただし全コンテキストは同じテストページ内で動き、Chromeのプロセス分離やService Workerの寿命は再現しません。

音声テストのため、テスト用Chromiumには `--autoplay-policy=no-user-gesture-required` を指定します。アプリのビルドや普段のChromeの設定には影響しません。

音声混合テストでは、タブ音声に440Hz、マイク音声に880Hzを入力します。本番のoffscreen処理が保存した音声を復号し、両方の周波数成分が十分な振幅で残ることと、入力していない1760Hzの成分が弱いことを確認します。片方だけ録音される退行を検出できます。

単体テストではoffscreen作成失敗後の再試行と、ready応答がない場合に20回で打ち切ってstream IDを転送しないことを確認します。

`npm run test:extension` はビルド後、Playwrightの通常版Chromiumを `channel: "chromium"` と専用の一時プロファイルで起動して拡張を読み込みます。APIのモックは使いません。待機状態の取得、offscreenとのready応答、拡張ページの再表示、offscreenの終了と再作成、無効なstream IDによる録音開始失敗とエラー状態の復元を確認します。サイドパネル用HTMLは通常の拡張ページとして開くため、Chromeのサイドパネル枠そのものは操作しません。個人のChromeプロファイルは使用しません。

## この環境だけでは保証しないこと

- 拡張アイコン操作によるactiveTab権限付与と実際のtabCapture
- 実際のSide Panel枠の開閉、録音中のページ再表示、Service Workerの強制終了・再起動と状態復元
- MeetのDOM変更、実際のマイクとMeetタブからの音声取得、実録音の長時間安定性
- Whisperの認識精度、実際のOllama接続・Origin許可・モデル品質
- Chromeが表示するファイル保存ダイアログ

これらを変更した場合には、現時点では拡張としての確認が必要です。通常の画面操作や処理連携の退行は、このテストで確認できます。

## CIと失敗時の調査

既存のCIはChromiumをインストールして `vp test` を実行するため、追加したブラウザテストも実行されます。失敗時の画像は `src/**/__screenshots__/`、添付情報は `src/.vitest-attachments/` に出力され、CIのartifactから取得できます。生成された画像・添付情報はコミットしません。

CIでは `npm run test:extension` も実行します。拡張間通信テスト失敗時には `test-results/extension/trace.zip` をartifactへ保存します。ローカルで `vp exec playwright show-trace test-results/extension/trace.zip` を実行すると、画面と操作の記録を確認できます。
