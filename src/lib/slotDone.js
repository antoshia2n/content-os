// 2026-11-20 Naoki「引用の公開済みみたいなアクションができない」「日々のそういうのが終わってないのを可視化して管理しやすく」→ 作る前の 1 枚に OK
// 引用・告知などは X で直接書くので、コンテンツくんに投稿ができず、枠が「空き」のまま時刻を過ぎて消えていた。
// カレンダーの枠に「済」を付け、押すと公開済みの記録を 1 件作る。済みにしていない過ぎた枠は、直近 7 日ぶん赤い「未」で残す。
import { fmtDate, slotTime } from "../constants.js";
import { relOf } from "./slotRel.js";

export const MISS_DAYS = 7;

// その枠の時刻をもう過ぎたか
export const slotPast = (dateStr, s, today, nowHM) => dateStr < today || (dateStr === today && slotTime(s) <= nowHM);
// 「未」で残すか（直近 7 日・今日の過ぎた枠を含む）
export function missWindowStart(today) {
  const d = new Date(today + "T00:00"); d.setDate(d.getDate() - (MISS_DAYS - 1)); return fmtDate(d);
}
// 枠が埋まっているか（App.jsx の takenSlot と同じ見方：日付・時・種類）
export const slotKey = (dateStr, s) => `${dateStr}_${slotTime(s).slice(0, 2)}_${s.postType || "x_post"}`;

// 引用・告知の枠から、相手の投稿を探す（相手の枠の日時にある、相手の種類の投稿）
export function sourcePostFor(s, dateStr, slots, posts) {
  if (!s || !s.quote_of) return null;
  const src = (slots || []).find(x => String(x.id) === String(s.quote_of));
  if (!src) return null;
  const r = relOf(src, s);
  const d = new Date(dateStr + "T00:00"); d.setDate(d.getDate() + (r.after ? r.n : -r.n));
  const head = `${fmtDate(d)}T${slotTime(src).slice(0, 2)}`, pt = src.postType || "x_post";
  return (posts || []).find(p => p.status !== "idea" && (p.datetime || "").startsWith(head) && (p.postType || "x_post") === pt) || null;
}
