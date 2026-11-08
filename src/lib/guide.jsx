// 2026-11-08 ガイドあり・なし（デモ v2 に Naoki OK 15:00。v1 の帯と番号の丸は「主張が強い」）
// 右上の「ガイド」（共通の外枠・shia2n-core 1.17.0）を「あり」にすると、押す場所の横に小さな「？」が出る。
// 押すと（マウスなら乗せると）題と 1 行の説明の小窓が出る。小窓の動きと見た目は shia2n-core/shell/guide.js。
// 文の正本は manual.js の GUIDES（screens の n 番目＝その画面の n 番目の「？」、nav＝左の一覧の見出し）。
import React, { useSyncExternalStore } from "react";
import { guideOn, onGuide, ensureGuideCss } from "shia2n-core/shell/guide.js";
import { GUIDES } from "../manual.js";

ensureGuideCss();
export const useGuide = () => useSyncExternalStore(onGuide, guideOn, () => false);

export function GHelp({ t, d, style }) {
  const on = useGuide();
  if (!on || !t) return null;
  return <button type="button" className="s2-qh" data-t={t} data-d={d || ""} aria-label={`${t}とは`} aria-expanded="false" style={style}>?</button>;
}

// 画面 id の n 番目の説明の「？」
export function GQ({ id, n, style }) {
  const it = GUIDES.screens?.[id]?.[n - 1];
  return it ? <GHelp t={it[0]} d={it[1]} style={style} /> : null;
}

// 左の一覧の見出しの「？」
export function GNav({ id, label }) {
  const d = GUIDES.nav?.[id];
  return d ? <GHelp t={label} d={d} style={{ width: 16, height: 16, margin: "0 auto 0 6px" }} /> : null;
}
