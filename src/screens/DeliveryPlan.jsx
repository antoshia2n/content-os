// 配信計画（2026-11-10 Naoki「予約枠を『配信計画』と同一にして、週と時間で枠を配置、そこにネタとかアウトプットの表をリンク」
//   「マスにリンクは狙いも書けるように」「引用とかも対象にして。何日前のこのポストを引用とかを関係性わかるように」→ デモに OK 11:36）
// 予約枠の設定の窓をこの 1 画面に置き換えた。曜日 × 時刻のマスに枠を置き、枠ごとに 出す種類・ネタの表（ジャンル）・狙い・引用元 を持つ。
// 枠を押すと右に、結んだネタの表のネタが出て、押すと次の回のその枠に仮置き（下書き）になる（App.jsx の placeAt と同じ処理）。
// カレンダーの週の表に空いた枠が薄く出るのは今のまま。毎月（第N曜日）の枠は表の下に並べる。
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getPostTypeStyle, SLOT_DOWS, fmtDate, slotTime, genId, stripHtml } from "../constants.js";
import { dbFetchSheetGenres } from "../lib/supabase.js";
import { slotLabel } from "./CalendarView.jsx";
import { openCtx } from "../components/CtxMenu.jsx";
import { useDialogFocus } from "../lib/useDialogFocus.js";

const DOW = ["", "月", "火", "水", "木", "金", "土", "日"];
const SLEEP = "寝かせ";
const headOf = p => (p.title || "").trim() || (p.memo || "").trim().split("\n")[0] || stripHtml(p.body || "").trim().slice(0, 60) || "（タイトルなし）";
const dowOf = d => (d.getDay() === 0 ? 7 : d.getDay());

// 何日前の枠か（同じ曜日なら、時刻が後ろの枠は同じ日・前なら 7 日前）
export function gapDays(src, dst) {
  if (src.type === "daily") return slotTime(src) < slotTime(dst) ? 0 : 1;
  let d = ((dst.dow || 1) - (src.dow || 1) + 7) % 7;
  if (d === 0 && slotTime(src) >= slotTime(dst)) d = 7;
  return d;
}
// その枠の次の回（今日の、まだ過ぎていない時刻を含む）
export function nextOccurrence(s, now = new Date()) {
  const t = slotTime(s);
  for (let i = 0; i < 70; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const hit = s.type === "daily" ? true : s.type === "nth_weekday" ? (s.dow === dowOf(d) && Math.ceil(d.getDate() / 7) === s.nth) : s.dow === dowOf(d);
    if (!hit) continue;
    const dt = `${fmtDate(d)}T${t}`;
    const z = x => String(x).padStart(2, "0");
    if (i === 0 && dt <= `${fmtDate(now)}T${z(now.getHours())}:${z(now.getMinutes())}`) continue;
    return dt;
  }
  return null;
}
const shortDt = dt => { if (!dt) return ""; const d = new Date(dt.slice(0, 10) + "T00:00"); return `${d.getMonth() + 1}/${d.getDate()}（${DOW[dowOf(d)]}）${dt.slice(11, 16)}`; };
const nameOf = (s, postTypes) => `${s.type === "daily" ? "毎日" : DOW[s.dow] || ""} ${slotTime(s)} ${getPostTypeStyle(s.postType, postTypes).label}`;

export function DeliveryPlan({ uid, slots, saveSlots, posts, postTypes, placeAt, onOpen, onClose, showToast, setUndo }) {
  const box = useRef(null);
  useDialogFocus(box, { onClose });
  const [sel, setSel] = useState(null);
  const [genres, setGenres] = useState([]);
  const [newTime, setNewTime] = useState("");
  const aimRef = useRef(null);
  useEffect(() => { if (uid) dbFetchSheetGenres(uid).then(setGenres).catch(() => {}); }, [uid]);

  const grid = slots.filter(s => s.type !== "nth_weekday");
  const monthly = slots.filter(s => s.type === "nth_weekday");
  const [extraTimes, setExtraTimes] = useState([]);
  const times = useMemo(() => [...new Set([...grid.map(slotTime), ...extraTimes])].sort(), [grid, extraTimes]);
  const cur = slots.find(s => s.id === sel) || null;
  const src = cur && cur.quote_of ? slots.find(s => String(s.id) === String(cur.quote_of)) : null;
  const quotedBy = id => slots.filter(s => String(s.quote_of) === String(id));
  const patch = (id, f) => saveSlots(prev => prev.map(x => (x.id === id ? { ...x, ...f } : x)));
  const add = (dow, time, extra = {}) => { const id = genId(); saveSlots(prev => [...prev, { id, type: "weekly", dow, time, postType: "x_post", title: "", ...extra }]); setSel(id); return id; };
  const remove = s => {
    const before = slots;
    saveSlots(prev => prev.filter(x => x.id !== s.id).map(x => (String(x.quote_of) === String(s.id) ? { ...x, quote_of: null } : x)));
    setSel(null);
    if (setUndo) setUndo({ msg: "枠を 1 つ削除しました", run: () => saveSlots(before) }); else showToast("枠を削除しました");
  };
  // 次の回にこの枠に入っている投稿
  const filled = s => { const dt = s && nextOccurrence(s); return dt ? posts.find(p => p.datetime === dt && (p.postType || "x_post") === (s.postType || "x_post")) || null : null; };
  const fillAt = (s, dt) => (dt ? posts.find(p => p.datetime === dt && (p.postType || "x_post") === (s.postType || "x_post")) || null : null);
  const ideasOf = s => posts.filter(p => p.status === "idea" && (p.postType || "x_post") === (s.postType || "x_post") && (s.genre ? p.genre === s.genre : true) && !(p.labels || []).includes(SLEEP));
  const menuFor = s => [
    { label: "この枠を開く", run: () => setSel(s.id) },
    { label: "狙いを編集", run: () => { setSel(s.id); setTimeout(() => aimRef.current && aimRef.current.focus(), 0); } },
    { label: "この枠を引用する枠を追加", run: () => { const d = s.type === "daily" ? 1 : ((s.dow || 1) + 1) % 7 || 7; add(d, "12:00", { postType: "x_quote", quote_of: String(s.id) }); showToast(`${DOW[d]} 12:00 に引用の枠を追加しました`); } },
    { label: "複製して次の日へ", run: () => { const d = ((s.dow || 1) % 7) + 1; add(d, slotTime(s), { postType: s.postType, genre: s.genre || null, aim: s.aim || "" }); showToast(`${DOW[d]} に複製しました`); } },
    { label: "この枠を削除", danger: true, run: () => remove(s) },
  ];

  const pill = (s, small) => {
    const pt = getPostTypeStyle(s.postType, postTypes); const q = s.quote_of ? slots.find(x => String(x.id) === String(s.quote_of)) : null;
    const by = quotedBy(s.id).length; const f = filled(s);
    const isSrc = cur && src && src.id === s.id, isUse = cur && String(s.quote_of) === String(cur.id);
    return <button key={s.id} type="button" onClick={() => setSel(s.id)} onContextMenu={e => openCtx(e, menuFor(s))} aria-pressed={sel === s.id}
      aria-label={`${nameOf(s, postTypes)}${s.genre ? `・ネタの表 ${s.genre}` : ""}${q ? `・${gapDays(q, s)}日前の枠を引用` : ""}`}
      style={{ position: "relative", width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 3, padding: "6px 7px", borderRadius: 9, background: "#fff", cursor: "pointer", fontFamily: "inherit", minHeight: small ? 0 : 66, marginBottom: 4,
        border: `1px solid ${sel === s.id ? "#f59e0b" : "#e6dfd6"}`, outline: sel === s.id ? "2px solid #f59e0b" : isSrc ? "2px dashed #0ea5e9" : isUse ? "2px dashed #7dd3fc" : "none", outlineOffset: -1 }}>
      {isSrc && <span style={{ position: "absolute", top: -9, right: 6, fontSize: 12, fontWeight: 800, background: "#0369a1", color: "#fff", borderRadius: 5, padding: "0 5px" }}>引用元</span>}
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: "#1a1a1a" }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: pt.dot, flexShrink: 0 }} />{pt.label}{s.type === "daily" && <span style={{ fontWeight: 600, color: "#736a62" }}>毎日</span>}</span>
      {s.genre && <span style={{ fontSize: 12, color: "#6b6259", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>▤ {s.genre}</span>}
      {q && <span style={{ fontSize: 12, fontWeight: 700, color: "#075985", background: "#e0f2fe", borderRadius: 5, padding: "1px 5px", alignSelf: "flex-start", lineHeight: 1.4, wordBreak: "break-all" }}>↩ {gapDays(q, s)}日前の{q.type === "daily" ? "毎日" : DOW[q.dow]}{slotTime(q)}を引用</span>}
      {s.aim && <span title={"狙い：" + s.aim} style={{ fontSize: 12, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>◎ {s.aim}</span>}
      {by > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#075985" }}>引用される {by}</span>}
      {f ? <span style={{ fontSize: 12, lineHeight: 1.4, color: "#1a1a1a", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{headOf(f)}</span> : <span style={{ fontSize: 12, fontWeight: 700, color: "#b45309" }}>空き</span>}
    </button>;
  };

  const lab = { fontSize: 12, fontWeight: 700, color: "#6b6259", display: "block", marginBottom: 4 };
  const fld = { width: "100%", border: "1px solid #a39a90", borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" };
  const nextDt = cur ? nextOccurrence(cur) : null;
  const curFill = cur ? filled(cur) : null;
  const srcFill = cur && src && nextDt ? (() => { const d = new Date(nextDt.slice(0, 10) + "T00:00"); d.setDate(d.getDate() - gapDays(src, cur)); return fillAt(src, `${fmtDate(d)}T${slotTime(src)}`); })() : null;
  const ideas = cur ? ideasOf(cur) : [];

  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={box} role="dialog" aria-modal="true" aria-labelledby="plan-title" style={{ background: "#f5f0eb", borderRadius: 16, width: "100%", maxWidth: 1240, height: "min(860px, calc(100vh - 28px))", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px #00000030" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e6dfd6" }}>
        <span id="plan-title" style={{ fontWeight: 800, fontSize: 16 }}>配信計画</span>
        <span style={{ fontSize: 12, color: "#736a62" }}>マスの空いた所を押すと枠を追加・枠を右クリックでメニュー</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} aria-label="追加する時刻" style={{ border: "1px solid #a39a90", borderRadius: 8, padding: "4px 6px", fontSize: 13, fontFamily: "inherit" }} />
          <button type="button" onClick={() => { if (!newTime) { showToast("時刻を入れてください"); return; } setExtraTimes(t => [...new Set([...t, newTime])]); setNewTime(""); }} style={{ border: "1px solid #e6dfd6", background: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>＋ 時刻の行を追加</button>
          <button type="button" onClick={onClose} style={{ border: "1px solid #e6dfd6", background: "#fff", borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#6b6259", cursor: "pointer", fontFamily: "inherit" }}>閉じる</button>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14, padding: 14 }}>
        <div style={{ flex: 1, minWidth: 0, background: "#fff", border: "1px solid #e6dfd6", borderRadius: 12, overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, tableLayout: "fixed" }}>
            <thead><tr><th style={{ width: 62, background: "#f7f3ee", borderBottom: "1px solid #e6dfd6" }} />{SLOT_DOWS.map(([d, l]) => <th key={d} style={{ fontSize: 12, fontWeight: 800, color: "#736a62", padding: 8, textAlign: "left", background: "#f7f3ee", borderBottom: "1px solid #e6dfd6" }}>{l}</th>)}</tr></thead>
            <tbody>
              {times.map(t => <tr key={t}>
                <td style={{ fontSize: 12, fontWeight: 700, color: "#736a62", padding: 8, verticalAlign: "top", borderTop: "1px solid #f1ebe4" }}>{t}</td>
                {SLOT_DOWS.map(([d, l]) => {
                  const here = grid.filter(s => slotTime(s) === t && (s.type === "daily" || s.dow === d));
                  return <td key={d} style={{ verticalAlign: "top", padding: 4, borderTop: "1px solid #f1ebe4", borderLeft: "1px solid #f1ebe4", height: 80 }}>
                    {here.map(s => pill(s))}
                    <button type="button" onClick={() => add(d, t)} aria-label={`${l} ${t} に枠を追加`} className="dp-add"
                      style={{ width: "100%", minHeight: here.length ? 22 : 66, border: "none", borderRadius: 8, background: "transparent", color: "transparent", fontSize: here.length ? 12 : 18, cursor: "pointer", fontFamily: "inherit" }}>＋</button>
                  </td>;
                })}
              </tr>)}
              {!times.length && <tr><td colSpan={8} style={{ padding: 24, fontSize: 13, color: "#736a62" }}>枠がまだありません。右上で時刻の行を追加して、マスを押すと枠ができます。</td></tr>}
            </tbody>
          </table>
          {monthly.length > 0 && <div style={{ padding: 12, borderTop: "1px solid #e6dfd6" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#736a62", marginBottom: 6 }}>毎月の枠</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 6 }}>{monthly.map(s => <div key={s.id}><div style={{ fontSize: 12, color: "#736a62", marginBottom: 2 }}>{slotLabel(s)}</div>{pill(s, true)}</div>)}</div>
          </div>}
        </div>
        <div style={{ width: 340, flexShrink: 0, background: "#fff", border: "1px solid #e6dfd6", borderRadius: 12, padding: 14, overflowY: "auto" }}>
          {!cur ? <div style={{ fontSize: 13, color: "#736a62", lineHeight: 1.7 }}>枠を押すと、ここで 出す種類・ネタの表・狙い・引用元 を決められます。次の回の枠にネタを入れるのもここから。</div> : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{slotLabel(cur)} の枠</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><label style={lab} htmlFor="dp-dow">曜日</label>
                <select id="dp-dow" value={cur.type === "daily" ? "daily" : cur.dow} onChange={e => patch(cur.id, e.target.value === "daily" ? { type: "daily" } : { type: "weekly", dow: +e.target.value })} style={fld} disabled={cur.type === "nth_weekday"}>
                  {SLOT_DOWS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}<option value="daily">毎日</option>
                </select></div>
              <div style={{ flex: 1 }}><label style={lab} htmlFor="dp-time">時刻</label>
                <input id="dp-time" type="time" value={slotTime(cur)} onChange={e => e.target.value && patch(cur.id, { time: e.target.value })} style={fld} /></div>
            </div>
            <div><label style={lab} htmlFor="dp-pt">出すもの（アウトプットの種類）</label>
              <select id="dp-pt" value={cur.postType || "x_post"} onChange={e => patch(cur.id, { postType: e.target.value, quote_of: e.target.value === "x_quote" ? cur.quote_of : null })} style={fld}>
                {Object.entries(postTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div><label style={lab} htmlFor="dp-genre">ネタの表（ここからネタを出す）</label>
              <select id="dp-genre" value={cur.genre || ""} onChange={e => patch(cur.id, { genre: e.target.value || null })} style={fld}>
                <option value="">決めない（この種類のネタ全部）</option>
                {cur.genre && !genres.some(g => g.name === cur.genre) && <option value={cur.genre}>{cur.genre}</option>}
                {genres.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select></div>
            {cur.postType === "x_quote" && <div><label style={lab} htmlFor="dp-q">引用元（どの枠の投稿を引用するか）</label>
              <select id="dp-q" value={cur.quote_of ? String(cur.quote_of) : ""} onChange={e => patch(cur.id, { quote_of: e.target.value || null })} style={fld}>
                <option value="">選ばない</option>
                {slots.filter(x => x.id !== cur.id && x.postType !== "x_quote").map(x => <option key={x.id} value={String(x.id)}>{gapDays(x, cur)}日前・{nameOf(x, postTypes)}{x.genre ? `（${x.genre}）` : ""}</option>)}
              </select>
              {src && <div style={{ fontSize: 12, color: "#075985", marginTop: 4 }}>{gapDays(src, cur)}日前の投稿を引用する。表で点線の枠が引用元</div>}
            </div>}
            <div><label style={lab} htmlFor="dp-aim">狙い（この枠で何を起こしたいか）</label>
              <AimField key={cur.id} id="dp-aim" inputRef={aimRef} value={cur.aim || ""} onSave={v => patch(cur.id, { aim: v })} /></div>
            <div style={{ height: 1, background: "#e6dfd6" }} />
            <div style={{ fontSize: 12, fontWeight: 800, color: "#736a62" }}>次の回（{shortDt(nextDt)}）</div>
            {src && <div style={{ border: "1px solid #7dd3fc", background: "#f0f9ff", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#075985" }}>引用する投稿（{gapDays(src, cur)}日前・{nameOf(src, postTypes)}）</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{srcFill ? headOf(srcFill) : "（その枠はまだ空き）"}</div>
              {srcFill && <button type="button" onClick={() => onOpen(srcFill)} style={{ marginTop: 6, border: "1px solid #e6dfd6", background: "#fff", borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>引用元を開く →</button>}
            </div>}
            {curFill ? <div style={{ border: "1px solid #e6dfd6", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{headOf(curFill)}</div>
              <button type="button" onClick={() => onOpen(curFill)} style={{ marginTop: 6, border: "1px solid #b45309", background: "#b45309", color: "#fff", borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>書く画面へ移動 →</button>
            </div> : <>
              <div style={{ fontSize: 12, color: "#736a62", lineHeight: 1.6 }}>{cur.genre ? `「${cur.genre}」` : "この種類"}のネタ {ideas.length} 件。押すと次の回のこの枠に入り、下書きになる</div>
              {ideas.slice(0, 30).map(p => <button key={p.id} type="button" onClick={() => nextDt && placeAt(p.id, nextDt, cur.postType || "x_post")}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", background: "none", borderRadius: 8, padding: "7px 8px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f7f3ee")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headOf(p)}</span><span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#b45309", whiteSpace: "nowrap" }}>この枠へ</span></button>)}
            </>}
            <div style={{ height: 1, background: "#e6dfd6" }} />
            <button type="button" onClick={() => remove(cur)} style={{ alignSelf: "flex-start", border: "none", background: "none", color: "#b91c1c", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>この枠を削除</button>
          </div>}
        </div>
      </div>
      <style>{`.dp-add:hover,.dp-add:focus-visible{background:#f7f3ee!important;color:#a39a90!important}`}</style>
    </div>
  </div>;
}

// 狙いの欄：打つ手を止めて 1 秒、または外へ出たときに保存（1 字ごとに表へ書かない）
function AimField({ id, value, onSave, inputRef }) {
  const [v, setV] = useState(value);
  const t = useRef(null);
  const commit = x => { clearTimeout(t.current); if (x !== value) onSave(x); };
  useEffect(() => () => clearTimeout(t.current), []);
  return <textarea id={id} ref={inputRef} rows={3} value={v} placeholder="例：週の頭に保存されるノウハウで、プロフへの流入を作る"
    onChange={e => { const x = e.target.value; setV(x); clearTimeout(t.current); t.current = setTimeout(() => commit(x), 1000); }} onBlur={() => commit(v)}
    style={{ width: "100%", border: "1px solid #a39a90", borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />;
}
