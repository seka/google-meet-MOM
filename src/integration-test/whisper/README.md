# Whisper 認識精度の評価

FLEURS の日本語 test split を使い、アプリと同じ `WhisperClient`（q8）で実推論し、正解テキストに対する micro CER を集計します。音声はリポジトリに含めず、ローカルに保存してください。FLEURS は読み上げ音声なので、このスコアはモデルや設定の比較用であり、会議音声の精度を保証するものではありません。また、このランナーは Node.js 上で推論するため、Chrome の WebAssembly 実行速度やブラウザ権限は評価しません。

## データの準備

FLEURS の固定リビジョン `70bb2e84b976b7e960aa89f1c648e09c59f894dd` から `ja_jp/test.tsv` と `ja_jp/audio/test.tar.gz` を取得します。データセットのライセンスは CC BY 4.0 です。

```sh
mkdir -p /tmp/fleurs-ja-jp/audio
curl -L https://huggingface.co/datasets/google/fleurs/resolve/70bb2e84b976b7e960aa89f1c648e09c59f894dd/data/ja_jp/test.tsv -o /tmp/fleurs-ja-jp/test.tsv
curl -L https://huggingface.co/datasets/google/fleurs/resolve/70bb2e84b976b7e960aa89f1c648e09c59f894dd/data/ja_jp/audio/test.tar.gz -o /tmp/fleurs-ja-jp/test.tar.gz
tar -xzf /tmp/fleurs-ja-jp/test.tar.gz -C /tmp/fleurs-ja-jp/audio
```

## 実行

```sh
FLEURS_EVAL_DATA_DIR=/tmp/fleurs-ja-jp npm run test:integration:whisper-accuracy
```

既定では test split の先頭25件を評価します。モデルや評価件数を変える場合も、比較する実行間でデータ・件数・正規化条件を揃えてください。

```sh
FLEURS_EVAL_DATA_DIR=/tmp/fleurs-ja-jp \
FLEURS_EVAL_LIMIT=650 \
FLEURS_EVAL_MODEL=onnx-community/whisper-base \
npm run test:integration:whisper-accuracy
```

初回はモデルを Hugging Face から取得するため、ネットワーク接続とモデル保存容量が必要です。出力には評価リビジョン・CC BY 4.0 の出典表記・モデル名・各サンプルの正解/認識結果・CER が含まれます。

## 日本語のテスト会議を評価する

会議の録音と、発話順に書いた UTF-8 の正解文字起こしを用意します。正解文には話者名や時刻のラベルを入れず、話された内容を記載します。録音と正解文はローカルに置きます。

```sh
ffmpeg -i meeting.webm -vn -ac 1 -ar 16000 -f f32le /tmp/meeting.f32
node src/integration-test/whisper/meeting-accuracy.mjs /tmp/meeting.f32 meeting.txt
```

既定ではアプリのデフォルトモデルを使います。比較するモデル名は第3引数で指定できます。採点は Node.js 上で録音停止後と同じタイムスタンプ付き推論を使い、CER と 20% 以下かどうかを出力します。

公開音声で比較する場合は、たとえばイングクラウドの [Japanese Travel Agency Roleplay Dialogue Corpus](https://huggingface.co/datasets/IngCrowd/japanese-roleplay-travel-agency)（CC BY-NC 4.0）を使えます。Zoom で収録された2話者のミックス音声を使い、ELAN の人手転記を発話の開始時刻順に並べます。音声を切り出す場合は、発話が途切れない位置で区切り、正解文も同じ区間に揃えます。モデル間の比較では録音区間と正解文を揃えます。

## 出典

- Google FLEURS: <https://huggingface.co/datasets/google/fleurs/tree/70bb2e84b976b7e960aa89f1c648e09c59f894dd/data/ja_jp>
- ライセンス: CC BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>)
- Conneau et al., “FLEURS: Few-shot Learning Evaluation of Universal Representations of Speech”, 2022.
