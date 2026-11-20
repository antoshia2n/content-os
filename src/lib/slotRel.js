// 配信計画の枠どうしの関係（引用・告知の相手が何日前／後か）。
// 2026-11-20 DeliveryPlan.jsx から移した。カレンダーの「済」で引用元の投稿を探すときにも使うため（配信計画の画面は後から読むので、そこから借りない）
import { slotTime } from "../constants.js";

// 何日前の枠か（同じ曜日なら、時刻が後ろの枠は同じ日・前なら 7 日前）
// 2026-11-18 Naoki「0日前の X記事引用が選べない（同じ時刻の枠）」→ 同じ時刻は同じ日（0日前）と数える
export function gapDays(src, dst) {
  if (src.type === "daily") return slotTime(src) <= slotTime(dst) ? 0 : 1;
  let d = ((dst.dow || 1) - (src.dow || 1) + 7) % 7;
  if (d === 0 && slotTime(src) > slotTime(dst)) d = 7;
  return d;
}
// 2026-11-18 引用・告知の相手との関係。引用は相手が前だけ。告知は前（＝告知）でも後（＝予告）でもよく、近いほう（同じなら前）
export function relOf(target, s) {
  // 2026-11-18 Naoki「まず日にちから選びたい。最大 31 日前とかまで」→ 選んだ日数（quote_gap・後は負）があればそれを使う
  if (Number.isInteger(s.quote_gap) && String(s.quote_of) === String(target.id)) {
    const g = s.quote_gap, n = Math.abs(g), after = g < 0;
    return { n, after, text: n === 0 ? "同じ日の" : after ? `${n}日後の` : `${n}日前の` };
  }
  const back = gapDays(target, s); // 相手が何日前か
  if (s.postType !== "x_promo") return { n: back, after: false, text: back === 0 ? "同じ日の" : `${back}日前の` };
  const fwd = gapDays(s, target); // 相手が何日後か
  if (fwd < back) return { n: fwd, after: true, text: fwd === 0 ? "同じ日の" : `${fwd}日後の` };
  return { n: back, after: false, text: back === 0 ? "同じ日の" : `${back}日前の` };
}
