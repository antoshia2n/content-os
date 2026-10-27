// はじめての人に入れる見本（src/lib/samples.js）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { samplePosts, SAMPLE_TEMPLATE, SAMPLE_LABEL, isSample, tomorrowAt7 } from "../src/lib/samples.js";

test("見本は 4 件（ネタ 2・書きかけ 1・予約済み 1）。全部に「例」の札・本人とアカウントの印が付く", () => {
  const rows = samplePosts({ accountId: "acc_x", uid: "u1", ids: [1, 2, 3, 4], now: new Date(2026, 9, 28, 8, 0) });
  assert.deepEqual(rows.map((r) => r.status), ["idea", "idea", "draft", "reserved"]);
  assert.ok(rows.every((r) => r.labels.includes(SAMPLE_LABEL) && r.user_id === "u1" && r.account_id === "acc_x" && r.post_type === "x_post"));
  assert.equal(rows[3].datetime, "2026-10-29T07:00");
  assert.equal(rows[0].datetime, null);
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3, 4]);
});

test("明日の朝 7 時は月末をまたいでも正しい・見本の見分け", () => {
  assert.equal(tomorrowAt7(new Date(2026, 9, 31, 23, 0)), "2026-11-01T07:00");
  assert.equal(isSample({ labels: ["例"] }), true);
  assert.equal(isSample({ labels: ["寝かせ"] }), false);
  assert.equal(isSample({}), false);
});

test("見本の型は本文の型で、差し込む位置の印が 1 つ", () => {
  assert.equal(SAMPLE_TEMPLATE.kind, "body");
  assert.equal(SAMPLE_TEMPLATE.content.split("{{cursor}}").length, 2);
});

test("見本はアカウントを自動で作ったときだけ入る・受け箱に「例をまとめて消す」", () => {
  const ua = readFileSync(new URL("../src/hooks/useAccounts.js", import.meta.url), "utf-8");
  const at = ua.indexOf("if (autoCreate && Array.isArray(accs) && accs.length === 0)");
  const sp = ua.indexOf("samplePosts(");
  assert.ok(at > 0 && sp > at && sp - at < 900);
  const sv = readFileSync(new URL("../src/screens/StockView.jsx", import.meta.url), "utf-8");
  assert.match(sv, /例をまとめて消す/);
});
