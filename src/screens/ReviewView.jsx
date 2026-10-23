// src/screens/ReviewView.jsx
// 2026-10-23 作り直し 4便：振り返りの上に「書く人」の記録を置く。
//   今日（目安の字数・仕上げる投稿のチェック・ひとこと）／4 週間の字数／月はじめだけ「先月のあなた」
// 数字（インプなど）は今までの画面（MetricsView）をこの下にそのまま出す。
import React, { useState, useMemo, useEffect } from "react";
import { getPostTypeStyle, STATUS, stripHtml, fmtDate } from "../constants.js";
import { DEFAULT_GOAL } from "../hooks/useDays.js";

const W = ["日", "月", "火", "水", "木", "金", "土"];
const headOf = p => (p.title || "").trim() || (p.memo || "").trim().split("\n")[0] || stripHtml(p.body || "").trim().slice(0, 60);
const kNum = n => n == null ? "" : n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, "") + "万" : Number(n).toLocaleString();

// ── 今日の字数の輪（上の帯と、この画面の両方で使う） ──
export function TodayRing({ chars = 0, goal = DEFAULT_GOAL, size = 20, stroke = 3 }) {
  const r = (size - stroke) / 2 - 0.5, c = 2 * Math.PI * r, f = Math.min(1, chars / Math.max(1, goal));
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line,#e6dfd6)" strokeWidth={stroke} />
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent,#f59e0b)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    {f >= 1 && <circle cx={size / 2} cy={size / 2} r={size * 0.16} fill="var(--accent,#f59e0b)" />}
  </svg>;
}

export const REVIEW_CSS = `
.ck-rv{max-width:1080px;margin:0 auto;padding:20px 16px 8px;display:flex;flex-direction:column;gap:14px}
.ck-rv-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px}
@media (max-width:860px){.ck-rv-grid{grid-template-columns:1fr}}
.ck-box{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:12px;min-width:0}
.ck-box h2{font-size:13px;font-weight:800;margin:0;display:flex;align-items:center;gap:8px}
.ck-box h2 small{font-weight:600;color:var(--faint);font-size:11.5px}
.ck-today{display:flex;gap:18px;align-items:center}
.ck-today .big{font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1}
.ck-today .big small{font-size:13px;color:var(--faint);font-weight:600;margin-left:4px}
.ck-today .sub{font-size:12px;color:var(--muted);margin-top:4px;line-height:1.6}
.ck-goal{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.ck-goal input{width:76px;height:28px;border:1px solid var(--line);border-radius:7px;padding:0 8px;font:inherit;font-size:13px;font-weight:700;text-align:right;background:var(--panel)}
.ck-plan{display:flex;flex-direction:column;gap:2px}
.ck-pl{display:flex;align-items:center;gap:10px;padding:7px 4px;border-top:1px solid var(--hair);font-size:13.5px}
.ck-pl:first-child{border-top:0}
.ck-pl input{width:16px;height:16px;accent-color:#ea580c;flex:none}
.ck-pl .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.ck-pl.done .t{color:var(--faint);text-decoration:line-through}
.ck-pl .x{color:var(--faint);font-size:12px;padding:0 4px!important}
.ck-note-ta{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:14px;line-height:1.7;min-height:64px;resize:vertical;background:var(--panel);color:var(--fg)}
.ck-note-ta:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.ck-bars{display:grid;grid-template-columns:repeat(28,minmax(0,1fr));gap:3px;align-items:end;height:120px;padding-top:6px}
.ck-bar{background:var(--accent-line);border-radius:3px 3px 0 0;min-height:2px;position:relative}
.ck-bar.today{background:var(--accent)}
.ck-bar.zero{background:var(--hair)}
.ck-bars-x{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;font-size:11px;color:var(--faint)}
.ck-weeks{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.ck-wk{background:var(--soft);border-radius:10px;padding:8px 10px;font-size:11.5px;color:var(--muted)}
.ck-wk b{display:block;font-size:16px;color:var(--fg);font-variant-numeric:tabular-nums}
.ck-month{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
@media (max-width:860px){.ck-month{grid-template-columns:1fr 1fr}}
.ck-mc{background:var(--soft);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:6px;min-height:120px}
.ck-mc .k{font-size:11px;font-weight:700;color:var(--faint)}
.ck-mc .v{font-size:28px;font-weight:800;letter-spacing:-.02em}
.ck-mc .v small{font-size:13px;color:var(--faint);margin-left:3px}
.ck-mc .t{font-size:13.5px;font-weight:700;line-height:1.5}
.ck-mc .s{font-size:11.5px;color:var(--muted);line-height:1.6}
.ck-warn{font-size:12px;color:var(--accent-ink);background:var(--accent-bg);border:1px solid var(--accent-line);border-radius:10px;padding:8px 12px;line-height:1.6}
.ck-sep{font-size:12px;font-weight:700;color:var(--faint);letter-spacing:.04em;padding:10px 2px 0}
`;

export function ReviewView({ days, today, todayRow, ready, err, saveDay, posts, postTypes, onOpen }) {
  const goal = todayRow.goal || DEFAULT_GOAL;
  const [goalIn, setGoalIn] = useState(String(goal));
  const [note, setNote] = useState(todayRow.note || "");
  const [pick, setPick] = useState("");
  useEffect(() => { setGoalIn(String(todayRow.goal || DEFAULT_GOAL)); setNote(todayRow.note || ""); }, [todayRow.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = todayRow.plan || [];
  const drafts = useMemo(() => posts.filter(p => ["draft", "review"].includes(p.status) && !plan.some(x => x.id === p.id)), [posts, plan]);
  const byId = useMemo(() => { const m = {}; posts.forEach(p => { m[p.id] = p; }); return m; }, [posts]);
  const todayOut = useMemo(() => posts.filter(p => (p.datetime || "").startsWith(today) && ["reserved", "published"].includes(p.status)).length, [posts, today]);
  const setPlan = next => saveDay(today, { plan: next });

  // 4 週間（今日を右端に 28 日）
  const span = useMemo(() => Array.from({ length: 28 }, (_, i) => { const d = new Date(today + "T00:00"); d.setDate(d.getDate() - 27 + i); const k = fmtDate(d); return { k, d, n: days[k]?.chars || 0 }; }), [days, today]);
  const max = Math.max(goal, ...span.map(x => x.n));
  const weeks = [0, 1, 2, 3].map(w => { const part = span.slice(w * 7, w * 7 + 7); return { from: part[0].d, sum: part.reduce((a, b) => a + b.n, 0), on: part.filter(x => x.n > 0).length }; });

  // 先月のあなた（月のはじめの 7 日だけ）
  const now = new Date(today + "T00:00");
  const showMonth = now.getDate() <= 7;
  const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lmKey = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, "0")}`;
  const lmDays = Object.values(days).filter(r => r.day.startsWith(lmKey));
  const lmBest = posts.filter(p => p.status === "published" && (p.datetime || "").startsWith(lmKey) && p.impressions != null).sort((a, b) => b.impressions - a.impressions)[0];
  const firstKey = `${today.slice(0, 7)}-01`;
  const [mNote, setMNote] = useState(days[firstKey]?.extra?.month_note || "");
  useEffect(() => { setMNote(days[firstKey]?.extra?.month_note || ""); }, [firstKey, days[firstKey]?.extra?.month_note]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevNote = days[`${lmKey}-01`]?.extra?.month_note || "";

  return <div className="ck"><style>{REVIEW_CSS}</style><div className="ck-rv">
    <div><div className="ck-crumb">振り返り</div><h1 className="ck-title">書く人の記録</h1></div>
    {!ready && <div className="ck-warn">記録の表がまだ使えません{err ? `（${err}）` : ""}。字数はこの画面を開いている間だけ数え、残りません。表ができると、その日から残ります。</div>}
    {showMonth && <div className="ck-box"><h2>{lm.getMonth() + 1}月のあなた<small>月のはじめに 1 回だけ</small></h2>
      <div className="ck-month">
        <div className="ck-mc"><span className="k">書いた日</span><span className="v">{lmDays.filter(r => r.chars > 0).length}<small>日</small></span><span className="s">字数が 1 字でも増えた日</span></div>
        <div className="ck-mc"><span className="k">書いた字数</span><span className="v">{kNum(lmDays.reduce((a, r) => a + (r.chars || 0), 0))}<small>字</small></span><span className="s">保存で増えた分の合計</span></div>
        <div className="ck-mc"><span className="k">いちばん伸びた 1 本</span>{lmBest ? <><span className="t" style={{ cursor: "pointer" }} onClick={() => onOpen(lmBest)}>{headOf(lmBest)}</span><span className="s">{kNum(lmBest.impressions)} インプ</span></> : <span className="s">数字の入った公開済みが無い</span>}</div>
        <div className="ck-mc"><span className="k">{now.getMonth() + 1}月の自分へ</span>
          {prevNote && <span className="s">先月の自分から：{prevNote}</span>}
          <textarea className="ck-note-ta" style={{ minHeight: 56 }} value={mNote} onChange={e => setMNote(e.target.value)} onBlur={() => saveDay(firstKey, { extra: { ...(days[firstKey]?.extra || {}), month_note: mNote.trim() } })} placeholder="ひとことで、どう書く？" /></div>
      </div></div>}
    <div className="ck-rv-grid">
      <div className="ck-box"><h2>今日<small>{now.getMonth() + 1}/{now.getDate()}（{W[now.getDay()]}）</small></h2>
        <div className="ck-today"><TodayRing chars={todayRow.chars} goal={goal} size={72} stroke={8} />
          <div><div className="big">{(todayRow.chars || 0).toLocaleString()}<small>/ {goal.toLocaleString()} 字</small></div>
            <div className="sub">保存 {todayRow.saves || 0} 回・今日の予約と公開 {todayOut} 本</div>
            <label className="ck-goal" style={{ marginTop: 6 }}>今日の目安<input inputMode="numeric" value={goalIn} onChange={e => setGoalIn(e.target.value.replace(/[^\d]/g, ""))} onBlur={() => { const n = Math.max(100, Math.min(50000, Number(goalIn) || DEFAULT_GOAL)); setGoalIn(String(n)); if (n !== todayRow.goal) saveDay(today, { goal: n }); }} />字</label></div></div>
        <div className="ck-sep" style={{ padding: 0 }}>今日仕上げる投稿</div>
        <div className="ck-plan">{plan.map(x => { const p = byId[x.id]; return <div key={x.id} className={`ck-pl ${x.done ? "done" : ""}`}>
          <input type="checkbox" checked={!!x.done} onChange={() => setPlan(plan.map(y => y.id === x.id ? { ...y, done: !y.done } : y))} />
          <span className="t" onClick={() => p && onOpen(p)}>{p ? headOf(p) || "（タイトルなし）" : x.title}</span>
          {p && <span className="ck-type" style={{ color: getPostTypeStyle(p.postType, postTypes).color, background: getPostTypeStyle(p.postType, postTypes).bg }}>{STATUS[p.status]?.label}</span>}
          <button className="x" onClick={() => setPlan(plan.filter(y => y.id !== x.id))} aria-label="外す">×</button></div>; })}
          {!plan.length && <div className="ck-note" style={{ fontSize: 12.5 }}>書きかけから、今日仕上げるものを選ぶ</div>}</div>
        {drafts.length > 0 && plan.length < 6 && <div className="ck-vrow"><select className="ck-sel" style={{ maxWidth: 320 }} value={pick} onChange={e => setPick(e.target.value)}><option value="">書きかけから選ぶ</option>{drafts.map(p => <option key={p.id} value={p.id}>{(headOf(p) || "（タイトルなし）").slice(0, 36)}</option>)}</select>
          <button className="ck-ghost" disabled={!pick} onClick={() => { const p = byId[pick]; if (!p) return; setPlan([...plan, { id: p.id, title: headOf(p).slice(0, 80), done: false }]); setPick(""); }}>今日に足す</button></div>}
        <div className="ck-sep" style={{ padding: 0 }}>ひとこと（夜に）</div>
        <textarea className="ck-note-ta" value={note} onChange={e => setNote(e.target.value)} onBlur={() => { if (note !== (todayRow.note || "")) saveDay(today, { note }); }} placeholder="今日はどうだった？ 何が書きやすく、何が詰まった？" />
      </div>
      <div className="ck-box"><h2>この 4 週間<small>1 日の字数</small></h2>
        <div className="ck-bars">{span.map(x => <div key={x.k} className={`ck-bar ${x.k === today ? "today" : ""} ${x.n ? "" : "zero"}`} style={{ height: `${Math.max(2, Math.round(x.n / max * 100))}%` }} title={`${x.d.getMonth() + 1}/${x.d.getDate()}（${W[x.d.getDay()]}）${x.n.toLocaleString()} 字`} />)}</div>
        <div className="ck-weeks">{weeks.map((w, i) => <div key={i} className="ck-wk">{w.from.getMonth() + 1}/{w.from.getDate()}〜<b>{kNum(w.sum)} 字</b>書いた日 {w.on} 日</div>)}</div>
      </div>
    </div>
    <div className="ck-sep">今までの数字</div>
  </div></div>;
}
