import { describe, expect, it } from "vite-plus/test";
import { calculateCharacterErrorRate } from "./character-error-rate";

describe("calculateCharacterErrorRate", () => {
  // 前提: 日本語文字起こしの表記ゆれ（空白・句読点・全半角）だけが異なる。
  // チェック内容: 評価前に定義した正規化を適用する。
  // 期待値: 認識内容の差分はないため CER は 0。
  it("空白・句読点・全半角の違いを認識誤りに数えない", () => {
    expect(calculateCharacterErrorRate("ＡＢＣ、会議です。", "abc 会議です")).toEqual({
      referenceCharacters: 7,
      editDistance: 0,
      rate: 0,
    });
  });

  // 前提: 正解文と推定文に置換・削除・挿入が含まれる。
  // チェック内容: Unicodeコードポイント単位の Levenshtein 距離を使う。
  // 期待値: 3 文字の正解に対して 2 編集、CER は 2/3。
  it("置換・削除・挿入を文字編集距離として集計する", () => {
    expect(calculateCharacterErrorRate("あいう", "あえうお")).toEqual({
      referenceCharacters: 3,
      editDistance: 2,
      rate: 2 / 3,
    });
  });

  // 前提: 句読点・空白を除くと正解文が空になる（無音など）。
  // チェック内容: 0 除算をせず、編集数だけを返す。
  // 期待値: CER は未定義を示す null で、無音の誤認識判定は別に扱える。
  it("正解文字数が 0 のとき CER を未定義にする", () => {
    expect(calculateCharacterErrorRate("。 ", "こんにちは")).toEqual({
      referenceCharacters: 0,
      editDistance: 5,
      rate: null,
    });
  });
});
