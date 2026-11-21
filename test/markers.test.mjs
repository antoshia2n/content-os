import test from "node:test";
import assert from "node:assert/strict";
import { checkMarkers, dropMarkers, findMarker, insertAtMarker, normText } from "../functions/api/internal/_markers.js";

// 募集記事（投稿 1794977325331496）の印の形をそのまま写した抜き出し
const BASE = "https://x.supabase.co/storage/v1/object/public/contentos/posts/1794977325331496/";
const BODY =
  "<p>実績者も多くて、</p>" +
  "<ul><li>うし部長さん「第一印象で損する人の5つの特徴」881万インプ</li></ul>" +
  "<p>※画像（ドライブ「実績ライブラリ／00_ここに放り込む」）：うし部長881万＝スクリーンショット 2026-11-20 21.27.41／エド201万＝21.26.21</p>" +
  "<p>などなど、バズアカウントになって</p>" +
  "<p>※画像：うし部長さんの記事の引用＝スクリーンショット 2026-11-20 21.27.34</p>" +
  "<p>ただし、引用してもらえるのは</p>" +
  "<p>※画像：508万インプの記事＝スクリーンショット 2026-11-20 21.28.18</p>";
const img = (n) => `<p><img src="${BASE}${n}.png" alt="" style=""/></p>`;

test("印の文字は全角半角・空白のちがいを気にせず当たる", () => {
  assert.equal(normText("<p>実績ライブラリ／00_ここに放り込む</p>"), "実績ライブラリ/00_ここに放り込む");
  assert.equal(findMarker(BODY, "21.27.41").count, 1);
  assert.equal(findMarker(BODY, "実績ライブラリ/00_ここに放り込む").count, 1);
  assert.equal(findMarker(BODY, "うし部長さんの記事の引用").count, 1);
});

test("0 件・2 件以上の印は使わない（数を返す）", () => {
  assert.equal(findMarker(BODY, "21.99.99").count, 0);
  assert.equal(findMarker(BODY, "※画像").count, 3);
  assert.deepEqual(checkMarkers(BODY, ["21.27.41", "※画像", "21.27.41", ""]), [
    { at: "21.27.41", count: 1 },
    { at: "※画像", count: 3 },
  ]);
});

test("画像は印のすぐ後ろへ入り、同じ印へ続けて入れると順番どおりに並ぶ", () => {
  let h = insertAtMarker(BODY, "21.27.41", img("a"), BASE);
  h = insertAtMarker(h, "21.27.41", img("b"), BASE);
  h = insertAtMarker(h, "21.28.18", img("c"), BASE);
  const iMark = h.indexOf("21.27.41");
  const iA = h.indexOf(`${BASE}a.png`);
  const iB = h.indexOf(`${BASE}b.png`);
  const iNext = h.indexOf("などなど");
  assert.ok(iMark < iA && iA < iB && iB < iNext);
  assert.ok(h.endsWith(img("c")));
  // 画像の段落は印にならない（alt に同じ文字があっても当たらない）
  assert.equal(findMarker(h, "21.27.41").count, 1);
});

test("見つからない印は null（呼ぶ側が止める）", () => {
  assert.equal(insertAtMarker(BODY, "21.99.99", img("x"), BASE), null);
});

test("drop_markers は印の段落だけを外し、入れた画像は残す", () => {
  const h = insertAtMarker(BODY, "21.27.34", img("q"), BASE);
  const { html, dropped } = dropMarkers(h, ["21.27.34", "21.99.99"]);
  assert.equal(dropped, 1);
  assert.ok(!html.includes("21.27.34"));
  assert.ok(html.includes(`${BASE}q.png`));
  assert.ok(html.includes("21.27.41"));
});
