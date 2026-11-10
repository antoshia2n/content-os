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
