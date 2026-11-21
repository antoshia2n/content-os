import test from "node:test";
import assert from "node:assert/strict";
import { dowOfDate, slotNote } from "../src/lib/slotNote.js";

const TPL = [{ id: "t1", name: "赤ペンメモ4枚図解" }];

test("メモがあればメモ、決め事は小窓にも並ぶ", () => {
  const r = slotNote({ aim: " 朝は体験談から\nフックは数字 ", genre: "習慣", tpl_id: "t1", materials: [{}, {}] }, TPL);
  assert.equal(r.memo, "朝は体験談から\nフックは数字");
  assert.equal(r.rules, "柱 習慣・型 赤ペンメモ4枚図解・資料 2");
  assert.equal(r.tip, "メモ：朝は体験談から\nフックは数字\n柱 習慣・型 赤ペンメモ4枚図解・資料 2");
});

test("メモが無い枠は決め事だけ。何も無い枠は空", () => {
  assert.deepEqual(slotNote({ genre: "習慣", materials: [] }, TPL), { memo: "", rules: "柱 習慣", tip: "柱 習慣" });
  assert.deepEqual(slotNote({ tpl_id: "消えた型" }, TPL), { memo: "", rules: "", tip: "" });
  assert.deepEqual(slotNote(null), { memo: "", rules: "", tip: "" });
});

test("曜日は 月=1〜日=7", () => {
  assert.equal(dowOfDate("2026-11-21"), 6);
  assert.equal(dowOfDate("2026-11-22"), 7);
  assert.equal(dowOfDate("2026-11-23T07:00"), 1);
});
