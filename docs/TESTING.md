# テスト環境

## 実行

```bash
vp install
vp exec playwright install chromium
npm run test:browser
```

Playwright管理下のheadless Chromiumを自動起動するため、普段使っているChromeへの拡張の読み込みやMeetへのログインは不要です。マイク、Whisperモデル、Ollamaも不要です。

```bash
npx vp test run --project=unit
npx vp check
npm run build
```

## 自動検証する範囲

| テスト     | 実際に動かすもの                                                                                                  | 置き換えるもの                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 操作フロー | サイドパネルHTML・起動処理、background、メッセージハンドラ、IndexedDB、Ollamaクライアント、ダウンロード用Blob生成 | Chrome API、offscreenからの録音・文字起こし応答、OllamaのHTTP応答 |
| 音声録音   | Web Audioの合成音声、RecordingSession、MediaRecorder、WebM復号                                                    | マイク・Meetの音声入力を合成音声に置換                            |
| 結果表示   | サイドパネルHTMLと結果表示コンポーネント                                                                          | ダウンロードコールバック                                          |

操作フローでは、アイコン操作だけでは録音が始まらないこと、録音開始・停止の通知、停止時にダウンロードされないこと、文字起こしから議事録生成・IndexedDB保存までの連携、ボタン操作での保存内容を確認します。続けてOllamaの403とキャプチャ権限拒否を発生させ、エラー表示と文字起こしの維持を確認します。

`extension-harness.ts` はChromeのメッセージAPIの限定的な代替です。通知に応答がないときも常に成功を返すのではなく、応答ポートのエラーを発生させ、通知失敗で録音が中断しないことを検証します。ただし全コンテキストは同じテストページ内で動き、Chromeのプロセス分離やService Workerの寿命は再現しません。

音声テストのため、テスト用Chromiumには `--autoplay-policy=no-user-gesture-required` を指定します。アプリのビルドや普段のChromeの設定には影響しません。

## この環境だけでは保証しないこと

- 拡張アイコン操作によるactiveTab権限付与と実際のtabCapture
- 実際のSide Panel・offscreen document・Service Workerのライフサイクル
- MeetのDOM変更、マイクと相手音声の混合、実録音の長時間安定性
- Whisperの認識精度、実際のOllama接続・Origin許可・モデル品質
- Chromeが表示するファイル保存ダイアログ

これらを変更した場合には、現時点では拡張としての確認が必要です。通常の画面操作や処理連携の退行は、このテストで確認できます。

## CIと失敗時の調査

既存のCIはChromiumをインストールして `vp test` を実行するため、追加したブラウザテストも実行されます。失敗時の画像は `src/**/__screenshots__/`、添付情報は `src/.vitest-attachments/` に出力され、CIのartifactから取得できます。生成された画像・添付情報はコミットしません。
