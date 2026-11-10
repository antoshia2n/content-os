import test from "node:test";
import assert from "node:assert/strict";
import { scheduleBlock, statusLabel } from "../src/lib/requests.js";
import { runScheduleRequest, tweetIdOf } from "../functions/api/internal/_buffer.js";
const fut = new Date(Date.now() + 3 * 864e5); const dt = new Date(fut.getTime() + 9 * 36e5).toISOString().slice(0, 16);
test("予約できない理由", () => {
  const p = { account_id: "acc_1", postType: "x_post", datetime: dt, body: "<p>a</p>" };
  assert.equal(scheduleBlock(p, ["a"]), "");
  assert.match(scheduleBlock({ ...p, postType: "note" }, ["a"]), /Xポスト/);
  assert.match(scheduleBlock({ ...p, datetime: null }, ["a"]), /日時/);
  assert.match(scheduleBlock({ ...p, postType: "x_quote" }, ["a", "b"]), /スレッド/);
  assert.equal(statusLabel({ kind: "schedule", status: "done" }), "予約済み");
});
test("X の住所から番号", () => {
  assert.equal(tweetIdOf("https://x.com/1175930118264389633/status/2113912801865703837"), "2113912801865703837");
  assert.equal(tweetIdOf(null), null);
});
function mock(state) {
  const calls = [];
  globalThis.fetch = async (u, o = {}) => {
    u = String(u); calls.push([o.method || "GET", u, o.body]);
    if (u.includes("api.buffer.com")) return new Response(JSON.stringify({ data: { createPost: { __typename: "PostActionSuccess", post: { id: "b1", dueAt: "x" } } } }));
    if (u.includes("/posts?id=eq.9")) return new Response(JSON.stringify([{ id: 9, x_url: state.src }]));
    if (u.includes("/posts?") && (o.method || "GET") === "GET") return new Response(JSON.stringify([{ id: 5, account_id: "acc_1", post_type: "x_quote", status: "draft", datetime: dt, buffer_post_id: null, history: [] }]));
    if (o.method === "PATCH" && u.includes("buffer_post_id=is.null")) return new Response(JSON.stringify([{ id: 5 }]));
    return new Response("[]");
  };
  return calls;
}
const sb = { url: "https://x", headers: {} }, env = { BUFFER_API_KEY: "k" };
test("引用元が未公開なら引用元待ち", async () => {
  const calls = mock({ src: null });
  const r = await runScheduleRequest(env, sb, "u", { id: "r", post_id: 5, quote_post_id: 9, texts: ["ひとこと"], status: "queued" });
  assert.equal(r.state, "waiting");
  assert.ok(!calls.some(c => c[1].includes("buffer.com")));
  assert.ok(calls.some(c => c[0] === "PATCH" && c[1].includes("content_requests") && c[2].includes("waiting")));
});
test("引用元が出ていれば retweet つきで Buffer へ", async () => {
  const calls = mock({ src: "https://x.com/a/status/123456789" });
  const r = await runScheduleRequest(env, sb, "u", { id: "r", post_id: 5, quote_post_id: 9, texts: ["ひとこと"], status: "waiting" });
  assert.equal(r.state, "done");
  const b = JSON.parse(calls.find(c => c[1].includes("buffer.com"))[2]);
  assert.equal(b.variables.input.metadata.twitter.retweet.id, "123456789");
  assert.equal(b.variables.input.text, "ひとこと");
});
