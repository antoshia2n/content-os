// src/screens/MetricsView.jsx
// 「成績」ビュー：Buffer から戻ってきた反応の数字を一覧で見て、伸びた順に並べる。
// v1.0（2026-08-09・第3便）
//
// ・自動の成績（auto_score）は取り込みが毎日付け直す。人手の評価（score）とは別の欄。
// ・数字は毎日上書きされ、投稿から 21 日で確定する。
// ・数字が入っていない投稿（投稿当日・未配信・Buffer を通していないもの）は既定で隠す。

import React, { useState, useMemo } from "react";
import { POST_TYPE, SCORE, STATUS, BD, BD2, S } from "../constants.js";

// 並び替えの選び方。既定は「自動の成績」。
const SORTS = [
  ["auto",        "成績順"],
  ["impressions", "表示回数"],
  ["reactions",   "いいね"],
  ["replies",     "返信"],
  ["reposts",     "リポスト"],
  ["clicks",      "クリック"],
  ["datetime",    "新しい順"],
];

const SCORE_RANK = { S: 0, A: 1, B: 2, C: 3, D: 4 };

/** 数字を読みやすく。入っていなければ横棒。 */
function num(v) {
  return (v === null || v === undefined) ? "—" : Number(v).toLocaleString("ja-JP");
}

/** 「2026-08-09T01:52:30Z」→「8/9 10:52」（日本時間） */
function fmtStamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const jst = new Date(d.getTime() + 9 * 3600000);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

function hasNumbers(p) {
  return p.impressions !== null && p.impressions !== undefined;
}

export function MetricsView({ posts, activeAcc, setPreview, postTypes = POST_TYPE }) {
  const [sortKey, setSortKey] = useState("auto");
  const [onlyWithNumbers, setOnlyWithNumbers] = useState(true);

  const rows = useMemo(() => {
    const list = (posts || []).filter(p => !onlyWithNumbers || hasNumbers(p));
    const byNum = key => (a, b) => {
      const av = a[key], bv = b[key];
      const an = (av === null || av === undefined) ? -1 : Number(av);
      const bn = (bv === null || bv === undefined) ? -1 : Number(bv);
      if (bn !== an) return bn - an;
      return (b.datetime || "").localeCompare(a.datetime || "");
    };
    if (sortKey === "datetime") {
      return [...list].sort((a, b) => (b.datetime || "").localeCompare(a.datetime || ""));
    }
    if (sortKey === "auto") {
      return [...list].sort((a, b) => {
        const ar = SCORE_RANK[a.auto_score] ?? 99;
        const br = SCORE_RANK[b.auto_score] ?? 99;
        if (ar !== br) return ar - br;
        return byNum("impressions")(a, b);
      });
    }
    return [...list].sort(byNum(sortKey));
  }, [posts, sortKey, onlyWithNumbers]);

  // 数字が最後に入った時刻（いちばん新しいもの）
  const lastFetched = useMemo(() => {
    let latest = null;
    for (const p of posts || []) {
      if (!p.metrics_fetched_at) continue;
      if (!latest || p.metrics_fetched_at > latest) latest = p.metrics_fetched_at;
    }
    return latest;
  }, [posts]);

  const withNumbers = useMemo(() => (posts || []).filter(hasNumbers).length, [posts]);

  const th = { fontSize: 10.5, fontWeight: 700, color: "#a8a09a", padding: "0 8px 7px", whiteSpace: "nowrap" };
  const td = { fontSize: 12, color: "#333", padding: "9px 8px", borderTop: BD2, whiteSpace: "nowrap" };

  return (
    <div style={{ ...S.col, height: "calc(100vh - 52px)", overflow: "hidden" }}>

      {/* ── 見出しと操作 ── */}
      <div style={{ ...S.row, gap: 8, padding: "10px 18px", borderBottom: BD2, background: "#fff", flexShrink: 0, flexWrap: "wrap" }}>
        {activeAcc && <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeAcc.color, display: "inline-block" }} />}
        <span style={{ fontWeight: 800, fontSize: 14 }}>{activeAcc?.name} の成績</span>
        <span style={{ fontSize: 12, color: "#aaa" }}>数字あり {withNumbers}件</span>
        <span style={{ fontSize: 11, color: "#c4bab0" }}>最後に取り込んだのは {fmtStamp(lastFetched)}</span>

        <div style={{ ...S.row, gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          <button onClick={() => setOnlyWithNumbers(v => !v)}
            style={{ ...S.row, gap: 5, border: `1.5px solid ${onlyWithNumbers ? "#7c3aed" : "#e0d8ce"}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", background: onlyWithNumbers ? "#ede9fe" : "#fff", color: onlyWithNumbers ? "#7c3aed" : "#aaa", fontFamily: "inherit", transition: "all .15s" }}>
            {onlyWithNumbers ? "数字のあるものだけ" : "すべての投稿"}
          </button>
          <select value={sortKey} onChange={e => setSortKey(e.target.value)}
            style={{ background: "#f8f4ef", border: BD, borderRadius: 7, padding: "5px 9px", fontSize: 12, color: "#666", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* ── 一覧 ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>
        {rows.length === 0 ? (
          <div style={{ color: "#bbb", fontSize: 13, textAlign: "center", marginTop: 60, lineHeight: 1.9 }}>
            数字の入った投稿がまだありません。<br />
            取り込みは毎日 12 時に動きます。投稿した当日の分は入りません。
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", border: BD, borderRadius: 10 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", paddingLeft: 12 }}>日時</th>
                <th style={{ ...th, textAlign: "left" }}>種別</th>
                <th style={{ ...th, textAlign: "left", width: "38%" }}>タイトル</th>
                <th style={{ ...th, textAlign: "center" }}>自動の成績</th>
                <th style={{ ...th, textAlign: "center" }}>手の評価</th>
                <th style={{ ...th, textAlign: "right" }}>表示回数</th>
                <th style={{ ...th, textAlign: "right" }}>いいね</th>
                <th style={{ ...th, textAlign: "right" }}>返信</th>
                <th style={{ ...th, textAlign: "right" }}>リポスト</th>
                <th style={{ ...th, textAlign: "right" }}>クリック</th>
                <th style={{ ...th, textAlign: "right", paddingRight: 12 }}>数字の更新</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const pt = postTypes[p.postType || "x_post"] || POST_TYPE.x_post;
                const st = STATUS[p.status];
                const auto = p.auto_score ? SCORE[p.auto_score] : null;
                const hand = p.score ? SCORE[p.score] : null;
                return (
                  <tr key={p.id} onClick={() => setPreview(p)} style={{ cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#faf7f3"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...td, paddingLeft: 12, color: "#888" }}>
                      {p.datetime ? p.datetime.slice(0, 16).replace("T", " ") : "日時未定"}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 10, color: pt.color, fontWeight: 700, background: pt.bg, border: `1px solid ${pt.border}`, padding: "1px 6px", borderRadius: 6 }}>{pt.label}</span>
                    </td>
                    <td style={{ ...td, whiteSpace: "normal", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.5 }}>
                      {p.title || "(無題)"}
                      {st && <span style={{ fontSize: 10, fontWeight: 700, color: st.text, background: st.chip, border: `1px solid ${st.border}`, borderRadius: 5, padding: "1px 6px", marginLeft: 6, whiteSpace: "nowrap" }}>{st.label}</span>}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {auto
                        ? <span style={{ fontSize: 11, fontWeight: 800, color: auto.color, background: auto.bg, borderRadius: 5, padding: "2px 8px" }}>{p.auto_score}</span>
                        : <span style={{ color: "#ddd" }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {hand
                        ? <span style={{ fontSize: 11, fontWeight: 800, color: hand.color, background: hand.bg, borderRadius: 5, padding: "2px 8px" }}>{p.score}</span>
                        : <span style={{ color: "#ddd" }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{num(p.impressions)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{num(p.reactions)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{num(p.replies)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{num(p.reposts)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{num(p.clicks)}</td>
                    <td style={{ ...td, textAlign: "right", paddingRight: 12, color: "#aaa", fontSize: 11 }}>{fmtStamp(p.metrics_updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ fontSize: 11, color: "#c4bab0", marginTop: 12, lineHeight: 1.8 }}>
          自動の成績は、直近 90 日の同じアカウントの投稿を表示回数の多い順に 5 等分して付けています。手の評価とは別の欄で、互いに影響しません。<br />
          数字は Buffer から毎日 12 時に取り込んで上書きします。投稿から 21 日を過ぎたものは確定として、それ以上は変わりません。
        </div>
      </div>
    </div>
  );
}
