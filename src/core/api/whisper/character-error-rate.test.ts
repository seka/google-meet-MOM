import { describe, expect, it } from "vite-plus/test";
import { calculateCharacterErrorRate } from "./character-error-rate";

describe("calculateCharacterErrorRate", () => {
  // 目的: 書式の違いではなく、認識された文字内容の違いを測る。
  // 前提: 日本語文字起こしの空白・句読点・全半角だけが異なる。
  // チェック内容: NFKC・空白除去・句読点除去・小文字化を適用して比較する。
  // 期待値: 正規化後の認識内容が一致するため、編集距離と CER は 0。
  it("空白・句読点・全半角の違いを認識誤りに数えない", () => {
    expect(calculateCharacterErrorRate("ＡＢＣ、会議です。", "abc 会議です")).toEqual({
      referenceCharacters: 7,
      editDistance: 0,
      rate: 0,
    });
  });

  // 目的: CER の分子が置換・削除・挿入を正しく数えることを確認する。
  // 前提: 3 文字の正解「あいう」に対し、推定「あえうお」には置換と挿入がある。
  // チェック内容: Unicodeコードポイント単位の Levenshtein 距離を計算する。
  // 期待値: 編集距離は 2、正解文字数は 3、CER は 2/3。
  it("置換・削除・挿入を文字編集距離として集計する", () => {
    expect(calculateCharacterErrorRate("あいう", "あえうお")).toEqual({
      referenceCharacters: 3,
      editDistance: 2,
      rate: 2 / 3,
    });
  });

  // 目的: 正規化後に正解文字がない場合も、評価結果を壊さず返す。
  // 前提: 正解文が句読点と空白のみで、推定文には文字がある。
  // チェック内容: 編集距離は計算しつつ、正解文字数 0 での除算を避ける。
  // 期待値: 編集距離は推定文の文字数、CER は未定義を表す null。
  it("正解文字数が 0 のとき CER を未定義にする", () => {
    expect(calculateCharacterErrorRate("。 ", "こんにちは")).toEqual({
      referenceCharacters: 0,
      editDistance: 5,
      rate: null,
    });
  });
});
