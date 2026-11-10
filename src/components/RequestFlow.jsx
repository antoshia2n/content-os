// 依頼と予約の流れの図（2026-11-10 Naoki「図解で流れを解説するものも欲しい」→ たたき台に OK 14:15）
// 依頼の一覧の上と、使い方の案内で使う。counts を渡すと、各段に今いる件数を出して光らせる
import React from "react";

const ROWS = [
  { title: "作る（ChatGPT）", fill: "#EEEDFE", stroke: "#534AB7", text: "#3C3489", sub: "#534AB7", boxes: [
    ["チェックで依頼", "依頼タブ", "make_queued"], ["GPT が初稿", "毎時0分・通知", "make_drafting"], ["チャットで仕上げ", "OK で格納", "make_review"], ["格納済み", "カードに残る", "make_done"]] },
  { title: "出す（Buffer）", fill: "#E1F5EE", stroke: "#0F6E56", text: "#085041", sub: "#0F6E56", boxes: [
    ["チェックで予約", "依頼タブ", "sch_queued"], ["引用元待ち", "引用のときだけ", "sch_waiting"], ["予約済み", "日時に自動で出る", "sch_done"], ["公開・住所を残す", "毎日の取り込み", "published"]] },
];

export function flowCounts(rows) {
  const c = {};
  for (const r of rows || []) {
    const sch = r.kind === "schedule";
    const k = sch ? `sch_${r.status}` : `make_${r.status === "queued" ? "queued" : r.status}`;
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

export function RequestFlow({ counts = {} }) {
  const X = [50, 200, 350, 500], W = 130, H = 56;
  const rowY = [50, 175];
  return (
    <svg viewBox="0 0 680 270" width="100%" role="img" aria-label="依頼と予約の流れ" style={{ display: "block", maxWidth: 680 }}>
      <defs><marker id="rf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#8a8076" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></marker></defs>
      <text x="50" y="34" fontSize="14" fontWeight="700" fill="#3d3530">{ROWS[0].title}</text>
      <text x="140" y="158" fontSize="14" fontWeight="700" fill="#3d3530">{ROWS[1].title}</text>
      <path d="M565 108 L565 128 L115 128 L115 173" fill="none" stroke="#8a8076" strokeWidth="1" markerEnd="url(#rf-arrow)" />
      {ROWS.map((row, ri) => row.boxes.map(([t, sub, key], i) => {
        const x = X[i], y = rowY[ri], n = counts[key] || 0;
        return <g key={key}>
          <rect x={x} y={y} width={W} height={H} rx="8" fill={row.fill} stroke={row.stroke} strokeWidth={n ? 2 : 0.5} />
          <text x={x + W / 2} y={y + 20} textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill={row.text}>{t}</text>
          <text x={x + W / 2} y={y + 40} textAnchor="middle" dominantBaseline="central" fontSize="12" fill={row.sub}>{sub}</text>
          {n > 0 && <g><circle cx={x + W - 6} cy={y + 4} r="11" fill={row.stroke} /><text x={x + W - 6} y={y + 4} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill="#fff">{n}</text></g>}
          {i < 3 && <line x1={x + W + 2} y1={y + H / 2} x2={x + W + 18} y2={y + H / 2} stroke="#8a8076" strokeWidth="1" markerEnd="url(#rf-arrow)" />}
        </g>;
      }))}
    </svg>
  );
}
