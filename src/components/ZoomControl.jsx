// 表示の大きさ（2026-11-18 Naoki「配信計画やカレンダーの表示倍率変えられると助かる」）
// 画面ごとにブラウザに覚える。中身に CSS の zoom をかける（Chrome・Safari・Firefox 126 以降）
import React, { useState } from "react";

const STEPS = [70, 80, 90, 100, 110, 125];
const KEY = k => `ck.zoom.${k}`;

export function useZoom(name) {
  const [z, setZ] = useState(() => { try { const v = Number(localStorage.getItem(KEY(name))); return STEPS.includes(v) ? v : 100; } catch { return 100; } });
  const set = v => { setZ(v); try { localStorage.setItem(KEY(name), String(v)); } catch {} };
  return [z, set];
}

export function ZoomControl({ value, onChange }) {
  const i = STEPS.indexOf(value);
  const b = { width: 26, height: 26, border: "1px solid #e6dfd6", background: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#555", display: "grid", placeItems: "center", fontFamily: "inherit", padding: 0 };
  return <span role="group" aria-label="表示の大きさ" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
    <button type="button" style={b} onClick={() => i > 0 && onChange(STEPS[i - 1])} aria-label="小さく表示" title="小さく表示" disabled={i <= 0}>−</button>
    <button type="button" onClick={() => onChange(100)} title="100% に戻す" aria-label={`いまの大きさ ${value}%（押すと 100% に戻す）`}
      style={{ ...b, width: 46, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{value}%</button>
    <button type="button" style={b} onClick={() => i < STEPS.length - 1 && onChange(STEPS[i + 1])} aria-label="大きく表示" title="大きく表示" disabled={i >= STEPS.length - 1}>＋</button>
  </span>;
}
