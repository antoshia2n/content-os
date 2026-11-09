// 2026-11-10 軽量化 便3：上の帯の輪だけを、振り返りの画面（あとから読む）から分けた
import React from "react";
import { DEFAULT_GOAL } from "../hooks/useDays.js";

export function TodayRing({ chars = 0, goal = DEFAULT_GOAL, size = 20, stroke = 3 }) {
  const r = (size - stroke) / 2 - 0.5, c = 2 * Math.PI * r, f = Math.min(1, chars / Math.max(1, goal));
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line,#e6dfd6)" strokeWidth={stroke} />
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent,#f59e0b)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    {f >= 1 && <circle cx={size / 2} cy={size / 2} r={size * 0.16} fill="var(--accent,#f59e0b)" />}
  </svg>;
}
