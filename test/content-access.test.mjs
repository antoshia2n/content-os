import test from "node:test";
import assert from "node:assert/strict";
import { canUseContent } from "../functions/_lib/content-access.js";

const env = { FIREBASE_PROJECT_ID: "test-project" };
const request = () => new Request("https://x.test/api/db/xa_obs", {
  headers: { Authorization: "Bearer test-token" },
});
const options = uid => ({
  request: request(), env, allowUids: [],
  verify: async (token, projectId) => {
    assert.equal(token, "test-token");
    assert.equal(projectId, "test-project");
    return uid;
  },
  fetchFn: async () => { throw new Error("unexpected fetch"); },
});

test("札なし → no_token", async () => {
  let calls = 0;
  const result = await canUseContent({
    ...options("missing"),
    request: new Request("https://x.test/api/db/xa_obs"),
    verify: async () => { calls++; throw new Error("unexpected verify"); },
    fetchFn: async () => { calls++; throw new Error("unexpected fetch"); },
  });
  assert.equal(result, "no_token");
  assert.equal(calls, 0);
});

test("札が偽 → denied", async () => {
  let calls = 0;
  assert.equal(await canUseContent({
    ...options("invalid"),
    verify: async () => { throw new Error("bad token"); },
    fetchFn: async () => { calls++; return Response.json({ ok: true, apps: ["content-os"] }); },
  }), "denied");
  assert.equal(calls, 0);
});

test("一覧にある人 → allowed・窓口 0 回", async () => {
  let calls = 0;
  assert.equal(await canUseContent({
    ...options("listed"), allowUids: ["listed"],
    fetchFn: async () => { calls++; throw new Error("unexpected fetch"); },
  }), "allowed");
  assert.equal(calls, 0);
});

test("窓口が content-os を返す人 → allowed", async () => {
  let calls = 0;
  assert.equal(await canUseContent({
    ...options("granted"),
    fetchFn: async (url, init) => {
      calls++;
      assert.equal(url, "https://shia2n-mcp.gameister1.workers.dev/gate/resolve");
      assert.deepEqual(init, { method: "POST", headers: { Authorization: "Bearer test-token" } });
      return Response.json({ ok: true, apps: ["content-os"] });
    },
  }), "allowed");
  assert.equal(calls, 1);
});

test("窓口が別の名前だけ返す人 → denied", async () => {
  assert.equal(await canUseContent({
    ...options("other"), fetchFn: async () => Response.json({ ok: true, apps: ["swipe-file", "x-koryaku"] }),
  }), "denied");
});

test("窓口が失敗 → denied", async () => {
  for (const [uid, fetchFn] of [
    ["network", async () => { throw new Error("network"); }],
    ["http", async () => new Response("failure", { status: 500 })],
    ["json", async () => new Response("not JSON")],
  ]) assert.equal(await canUseContent({ ...options(uid), fetchFn }), "denied");
});

test("同じ人は 60 秒内なら窓口 1 回・60 秒後は取り直す", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 100000 });
  let calls = 0, verifies = 0;
  const opts = {
    ...options("cached"),
    verify: async () => { verifies++; return "cached"; },
    fetchFn: async () => {
      calls++;
      return Response.json({ ok: true, apps: calls === 1 ? ["content-os"] : [] });
    },
  };
  assert.equal(await canUseContent(opts), "allowed");
  t.mock.timers.tick(59999);
  assert.equal(await canUseContent(opts), "allowed");
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.equal(await canUseContent(opts), "denied");
  assert.equal(calls, 2);
  assert.equal(verifies, 3);
});

import { allowListOf, NAOKI_UID } from "../functions/_lib/content-access.js";
import { readFileSync } from "node:fs";

test("使える人の一覧：CONTENT_ALLOW_UID が空なら Naoki 1 人・入っていればその人たち", () => {
  assert.deepEqual(allowListOf({}), [NAOKI_UID]);
  assert.deepEqual(allowListOf({ CONTENT_ALLOW_UID: " " }), [NAOKI_UID]);
  assert.deepEqual(allowListOf({ CONTENT_ALLOW_UID: "a, b" }), ["a", "b"]);
});

test("表の口・画像の口は、どちらも canUseContent で決める", () => {
  for (const f of ["../functions/api/db/[[path]].js", "../functions/api/storage/upload.js"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf-8");
    assert.match(src, /canUseContent\(/, f);
  }
});

test("入場は門番の答え（apps に content-os）で決める。Firestore の paid では決めない", () => {
  const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf-8");
  assert.match(src, /b\.apps\.includes\("content-os"\)/);
  assert.doesNotMatch(src, /paymentStatus==="paid"/);
});


import { isOwnerOrInternal } from "../functions/api/internal/push-to-notion.js";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeToken = (email) => `${b64({ alg: "none" })}.${b64({ email, email_verified: true })}.sig`;
const req = (auth) => new Request("https://x.test/api/internal/push-to-notion", { method: "POST", headers: auth ? { Authorization: auth } : {} });

test("Notion へ送る口：合言葉か持ち主だけ。札なし・ほかの人・偽の札は断る", async () => {
  const env = { MCP_INTERNAL_SECRET: "s3cret", FIREBASE_PROJECT_ID: "p" };
  const ok = async () => {};
  const bad = async () => { throw new Error("bad"); };
  assert.equal(await isOwnerOrInternal(req("Bearer s3cret"), env, bad), true);
  assert.equal(await isOwnerOrInternal(req(null), env, ok), false);
  assert.equal(await isOwnerOrInternal(req("Bearer " + fakeToken("someone@example.com")), env, ok), false);
  assert.equal(await isOwnerOrInternal(req("Bearer " + fakeToken("someone@example.com")), env, bad), false);
});

test("会員の画面：Notion・通知設定・共有リンク・アカウントの追加は管理者だけ。はじめての人にアカウントを 1 つ作る", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf-8");
  assert.match(app, /onSentToNotion=\{panel&&owner\?sentToNotion:undefined\} owner=\{owner\}/);
  assert.match(app, /\.\.\.\(owner\?\[\["通知設定"/);
  assert.match(app, /\{owner&&<div style=\{\{borderTop:BD2,marginTop:2,paddingTop:6\}\}>/);
  assert.match(app, /onAdd=\{owner\?addAccount:undefined\}/);
  assert.match(app, /mountAppShell\(\{appId:"content-os"/);
  const ed = readFileSync(new URL("../src/screens/EditorModal.jsx", import.meta.url), "utf-8");
  assert.match(ed, /\.\.\.\(owner\?\[\{label:notionState/);
  const ua = readFileSync(new URL("../src/hooks/useAccounts.js", import.meta.url), "utf-8");
  assert.match(ua, /name: "自分のアカウント"/);
  assert.match(ua, /if \(autoCreate && Array\.isArray\(accs\) && accs\.length === 0\)/);
});
