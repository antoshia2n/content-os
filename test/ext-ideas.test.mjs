import test from "node:test";
import assert from "node:assert/strict";
import { ideaFields, parseIds, onRequest, ALLOW_ORIGINS } from "../functions/api/ext/ideas.js";

const MAP = "https://mindmap.shia2n.jp/m/11111111-2222-3333-4444-555555555555";

test("枝の字をネタの名前とメモにする・マップの住所だけ通す", () => {
  assert.deepEqual(ideaFields({ title: " 書けない人は\n材料が無い ", memo: "- a\n- b", mm_url: MAP + "?n=nabc123" }),
    { title: "書けない人は 材料が無い", memo: "- a\n- b", mm_url: MAP + "?n=nabc123" });
  assert.equal(ideaFields({ title: "x", mm_url: "https://evil.example/m/1" }).mm_url, null);
  assert.equal(ideaFields({ title: "x", mm_url: MAP + "?n=a&b=c" }).mm_url, null);
});

test("?ids= は数字だけ・重なりなし・100 件まで", () => {
  assert.deepEqual(parseIds("12, 34,abc,12,,9999999999999999999"), ["12", "34", "9999999999999999999"]);
  assert.equal(parseIds(Array.from({ length: 150 }, (_, i) => i + 1).join(",")).length, 100);
});

test("思考整理くん以外の画面からは呼べない・ログイン無しは断る", async () => {
  const call = (origin, method = "POST") => onRequest({ request: new Request("https://content-os.shia2n.jp/api/ext/ideas", { method, headers: { Origin: origin } }), env: {} });
  assert.equal((await (await call("https://evil.example")).json()).ok, false);
  const pre = await call(ALLOW_ORIGINS[0], "OPTIONS");
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("Access-Control-Allow-Origin"), ALLOW_ORIGINS[0]);
  const r = await (await call(ALLOW_ORIGINS[0])).json();
  assert.equal(r.ok, false);
  assert.match(r.error, /ログイン/);
});

// 2026-11-11 読書くん 便3
import { bookFields, BOOK_ORIGINS } from "../functions/api/ext/ideas.js";
test("読書くんのメモ：題は 1 行目・メモに出どころ・住所は決まった形だけ", () => {
  const b = "11111111-2222-3333-4444-555555555555", m = "66666666-7777-8888-9999-000000000000";
  const f = bookFields({ text: "問いを選ぶ量で差がつく\n二行目", book: "イシューからはじめよ", page: 44, src_url: `https://dokusho.shia2n.jp/?book=${b}&memo=${m}` });
  assert.equal(f.title, "問いを選ぶ量で差がつく");
  assert.equal(f.memo, "問いを選ぶ量で差がつく\n二行目\n\n— 『イシューからはじめよ』 p.44");
  assert.equal(f.label, "『イシューからはじめよ』 p.44");
  assert.equal(f.src_url, `https://dokusho.shia2n.jp/?book=${b}&memo=${m}`);
  assert.equal(bookFields({ text: "a", src_url: "https://evil.example/?book=x" }).src_url, null);
  assert.equal(bookFields({ text: "a", book: "本" }).label, "『本』");
  assert.ok(BOOK_ORIGINS.includes("https://dokusho.shia2n.jp"));
});

// 2026-11-13 セミナー管理の流れ 便1
import { seminarTypeOf } from "../functions/api/ext/ideas.js";
test("「セミナー」の種類の鍵を名前で探す・無ければ null", () => {
  assert.equal(seminarTypeOf([{ key: "custom_a", label: "動画" }, { key: "custom_セミナー_1", label: " セミナー " }]), "custom_セミナー_1");
  assert.equal(seminarTypeOf([{ key: "custom_a", label: "セミナー告知" }]), null);
  assert.equal(seminarTypeOf(null), null);
});
