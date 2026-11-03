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
