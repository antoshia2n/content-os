// src/screens/MetricsView.jsx
// 「成績」ビュー：Buffer から戻ってきた反応の数字を一覧で見て、伸びた順に並べる。
// v1.0（2026-08-09・第3便）
//
// ・自動の成績（auto_score）は取り込みが毎日付け直す。人手の評価（score）とは別の欄。
// ・数字は毎日上書きされ、投稿から 21 日で確定する。
// ・数字が入っていない投稿（投稿当日・未配信・Buffer を通していないもの）は既定で隠す。

import React, { useState, useMemo } from "react";
import { POST_TYPE, getPostTypeStyle, SCORE, STATUS } from "../constants.js";

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

/** 数字を読みやすく。入っていなければ空のまま（記号は置かない） */
function num(v) {
  return (v === null || v === undefined) ? "" : Number(v).toLocaleString("ja-JP");
}

/** 「2026-08-09T01:52:30Z」→「8/9 10:52」（日本時間） */
function fmtStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
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

  // 2026-10-24 6便：上の「書く人の記録」と同じ枠・同じ幅にそろえた（表の決まりは CK_CSS の .ck-table）
  return (
    <div className="ck"><style>{MV_CSS}</style><div className="ck-mv">
      <div className="ck-card">
        <div className="ck-mvh">
          {activeAcc && <span className="dot" style={{ background: activeAcc.color }} />}
          <b>{activeAcc?.name} の成績</b>
          <span className="sub">数字あり {withNumbers} 件{lastFetched ? `・最後の取り込み ${fmtStamp(lastFetched)}` : ""}</span>
          <span className="ctl">
            <button className={`ck-chip-f ${onlyWithNumbers ? "on" : ""}`} onClick={() => setOnlyWithNumbers(v => !v)}>数字のあるものだけ</button>
            <select className="ck-sel" value={sortKey} onChange={e => setSortKey(e.target.value)}>
              {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="ck-empty" style={{ cursor: "default", lineHeight: 1.9 }}>
            数字の入った投稿がまだありません。取り込みは毎日 12 時に動きます。投稿した当日の分は入りません。
          </div>
        ) : (
          <div className="ck-tw"><table className="ck-table">
            <thead><tr>
              <th>タイトル</th><th>日時</th><th>種類</th>
              <th style={{ textAlign: "center" }}>自動</th><th style={{ textAlign: "center" }}>手の評価</th>
              <th className="r">表示</th><th className="r">いいね</th><th className="r">返信</th><th className="r">リポスト</th><th className="r">クリック</th><th className="r">数字の更新</th>
            </tr></thead>
            <tbody>
              {rows.map(p => {
                const pt = getPostTypeStyle(p.postType, postTypes);
                const st = STATUS[p.status];
                const auto = p.auto_score ? SCORE[p.auto_score] : null;
                const hand = p.score ? SCORE[p.score] : null;
                return (
                  <tr key={p.id} onClick={() => setPreview(p)}>
                    <td style={{ maxWidth: 300 }}><div className="ck-nm">{p.title || "（タイトルなし）"}</div>{st && <div className="ck-snip">{st.label}</div>}</td>
                    <td className="ck-num">{p.datetime ? p.datetime.slice(5, 16).replace("-", "/").replace("T", " ") : ""}</td>
                    <td><span className="ck-mvt" style={{ color: pt.color, background: pt.bg }}>{pt.label}</span></td>
                    <td style={{ textAlign: "center" }}>{auto && <span className="ck-mvs" style={{ color: auto.color, background: auto.bg }}>{p.auto_score}</span>}</td>
                    <td style={{ textAlign: "center" }}>{hand && <span className="ck-mvs" style={{ color: hand.color, background: hand.bg }}>{p.score}</span>}</td>
                    <td className="ck-num r strong">{num(p.impressions)}</td>
                    <td className="ck-num r">{num(p.reactions)}</td>
                    <td className="ck-num r">{num(p.replies)}</td>
                    <td className="ck-num r">{num(p.reposts)}</td>
                    <td className="ck-num r">{num(p.clicks)}</td>
                    <td className="ck-num r faint">{fmtStamp(p.metrics_updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
      <p className="ck-mvn">
        自動の成績は、直近 90 日の同じアカウントの投稿を表示回数の多い順に 5 等分して付けています。手の評価とは別の欄で、互いに影響しません。
        数字は Buffer から毎日 12 時に取り込んで上書きします。投稿から 21 日を過ぎたものは確定として、それ以上は変わりません。
      </p>
    </div></div>
  );
}

const MV_CSS = `
.ck-mv{max-width:1080px;margin:0 auto;padding:0 16px 28px}
.ck-mvh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--hair)}
.ck-mvh .dot{width:8px;height:8px;border-radius:50%}
.ck-mvh b{font-size:13.5px}
.ck-mvh .sub{font-size:11.5px;color:var(--faint)}
.ck-mvh .ctl{margin-left:auto;display:inline-flex;gap:6px;align-items:center}
.ck-mv .ck-table{min-width:860px}
.ck-mv .ck-table th,.ck-mv .ck-table td{padding:0 9px}
.ck-mv .ck-table .r{text-align:right}
.ck-mv .ck-table .strong{font-weight:700;color:var(--ink)}
.ck-mv .ck-table .faint{color:var(--faint);font-size:11.5px}
.ck-mvt{font-size:11px;font-weight:700;border-radius:6px;padding:2px 7px;white-space:nowrap}
.ck-mvs{font-size:11px;font-weight:800;border-radius:5px;padding:2px 8px}
.ck-mvn{font-size:11.5px;color:var(--faint);line-height:1.8;margin:10px 2px 0}
`;
