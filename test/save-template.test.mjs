import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/internal/save-template.js";

const env = { MCP_INTERNAL_SECRET: "s", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" };
const SW = "11111111-1111-1111-1111-111111111111";
const TPL = "22222222-2222-2222-2222-222222222222";
function fakeDb(rows) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    const u = String(url);
    const ok = (v) => new Response(JSON.stringify(v), { status: 200 });
    if (u.includes("/posts?")) return ok(u.includes("id=eq.42") ? [{ id: 42, title: "伸びた投稿", post_type: "x_post" }] : []);
    if (u.includes("/sw_swipes?")) return ok([{ id: SW, title: "お手本" }]);
    if (u.includes("/content_templates?select=sort_order")) return ok([{ sort_order: 3 }]);
    if (u.includes("/content_templates?select=")) return ok(rows.filter((r) => u.includes(r.id)));
    if (init.method === "POST" || init.method === "PATCH") return ok([{ id: TPL, user_id: "u", ...JSON.parse(init.body) }]);
    return ok([]);
  };
  return calls;
}
const call = (body) => onRequestPost({ env, request: new Request("https://a/x", { method: "POST", headers: { Authorization: "Bearer s" }, body: JSON.stringify({ user_id: "u", ...body }) }) });

test("新しい型は必ず候補で入り、参考の題は元の表から付く", async () => {
  const calls = fakeDb([]);
  const r = await call({ kind: "request", make: "thumbnail", name: "伸びたサムネ", content: "大きな文字1行", why: "数字が1.5倍", source_post_id: 42, refs: [{ k: "swipe", id: SW }], status: "confirmed", made_by: "gpt" });
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.template.status, "candidate");
  assert.equal(j.template.sort_order, 4);
  assert.equal(j.template.refs[0].title, "お手本");
  assert.equal(j.template.made_by, "gpt");
  assert.equal(calls.find((c) => c.method === "POST").body.user_id, "u");
});

test("なぜ効いたかが無いと入らない", async () => {
  fakeDb([]);
  const j = await (await call({ kind: "body", name: "a", content: "b" })).json();
  assert.equal(j.error, "why required");
});

test("候補でない型は書き換えられない", async () => {
  fakeDb([{ id: TPL, kind: "body", name: "自分の", content: "x", status: null }]);
  const r = await call({ id: TPL, content: "上書き", why: "w" });
  assert.equal(r.status, 409);
});

test("元の投稿が無ければ止まる", async () => {
  fakeDb([]);
  const r = await call({ kind: "body", name: "a", content: "b", why: "w", source_post_id: 7 });
  assert.equal(r.status, 404);
});

test("今ある型の改訂案は候補で入り、種類と作るものは元の型のまま", async () => {
  const T0 = "33333333-3333-3333-3333-333333333333";
  const calls = fakeDb([{ id: T0, kind: "request", make: "quote_figure", name: "赤ペン", content: "旧", status: null, refs: [], replaces_id: null }]);
  const j = await (await call({ revise_id: T0, kind: "body", content: "新", why: "反応が良かった", made_in: "https://claude.ai/chat/x" })).json();
  assert.equal(j.ok, true);
  const sent = calls.find((c) => c.method === "POST").body;
  assert.equal(sent.status, "candidate"); assert.equal(sent.replaces_id, T0);
  assert.equal(sent.kind, "request"); assert.equal(sent.make, "quote_figure"); assert.equal(sent.name, "赤ペン");
  assert.equal(sent.made_in, "https://claude.ai/chat/x");
  assert.equal(calls.some((c) => c.method === "PATCH"), false);
});
