import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as listWs } from "../functions/api/workspaces.js";

test("場所の一覧：ログインの札が無ければ 401", async () => {
  const res = await listWs({ request: new Request("https://content-os.test/api/workspaces"), env: { FIREBASE_PROJECT_ID: "p" } });
  assert.equal(res.status, 401);
});
