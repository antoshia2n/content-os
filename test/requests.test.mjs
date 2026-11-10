import test from "node:test";
import assert from "node:assert/strict";
import { mediaOf, pickRequestTemplate, requestPromptText, chatgptUrl } from "../src/lib/requests.js";
test("媒体は投稿の種類から決まる", () => {
  assert.equal(mediaOf("x_article"), "x_article");
  assert.equal(mediaOf("membership"), "note");
  assert.equal(mediaOf("x_quote"), "x_post");
});
test("依頼の型は作るもの×種類が合うものを先に選ぶ", () => {
  const ts = [
    { id: "a", kind: "request", make: "thumbnail", post_type: null, sort_order: 0 },
    { id: "b", kind: "request", make: "thumbnail", post_type: "note", sort_order: 1 },
    { id: "c", kind: "request", make: "quote_figure", post_type: "x_article", sort_order: 0 },
    { id: "d", kind: "prompt", make: "thumbnail", post_type: null, sort_order: 0 },
  ];
  assert.equal(pickRequestTemplate(ts, "thumbnail", "note").id, "b");
  assert.equal(pickRequestTemplate(ts, "thumbnail", "x_post").id, "a");
  assert.equal(pickRequestTemplate(ts, "quote_figure", "note"), null);
  assert.equal(pickRequestTemplate(ts, "text", "x_post"), null);
});
test("GPT へ渡す文に題・指示・本文が入り、住所は ?q= になる", () => {
  const t = requestPromptText({ make: "thumbnail", media: "note", instruction: "青で", template: null, title: "題", bodyText: "本文" });
  assert.match(t, /noteのサムネ/); assert.match(t, /指示：青で/); assert.match(t, /題：題/);
  assert.ok(chatgptUrl(t).startsWith("https://chatgpt.com/?q="));
});
import { mergeRefs, resolveRefs, toggleIn, toggleExcl, whereAttached, normPending } from "../src/lib/refs.js";
test("参考は型と依頼を合わせ、重なりを除いて 5 件まで", () => {
  const a = [{ k: "swipe", id: "1", title: "a" }, { k: "map", id: "2", title: "b" }];
  const b = [{ k: "swipe", id: "1", title: "a" }, ...[3, 4, 5, 6, 7].map(i => ({ k: "swipe", id: String(i), title: "x" }))];
  const m = mergeRefs(a, b);
  assert.equal(m.length, 5); assert.equal(m[0].id, "1"); assert.equal(m.filter(r => r.id === "1").length, 1);
});

test("作るものごとの参考：型 − 外した分 ＋ 全部 ＋ その作るもの", () => {
  const T = [{ k: "swipe", id: "t1", title: "型1" }, { k: "swipe", id: "t2", title: "型2" }];
  let p = normPending(null);
  p = toggleIn(p, "all", { k: "map", id: "m", title: "地図" });
  p = toggleIn(p, "thumbnail", { k: "swipe", id: "s", title: "サムネ手本" });
  p = toggleExcl(p, "thumbnail", T[0]);
  assert.deepEqual(resolveRefs(p, "thumbnail", T).map(r => r.id), ["t2", "m", "s"]);
  assert.deepEqual(resolveRefs(p, "quote_figure", T).map(r => r.id), ["t1", "t2", "m"]);
  assert.deepEqual(whereAttached(p, { k: "map", id: "m" }), ["all"]);
  assert.deepEqual(normPending([{ k: "map", id: "x" }]).all.length, 1);
});
