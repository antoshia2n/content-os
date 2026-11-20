// 配信計画（2026-11-10 Naoki「予約枠を『配信計画』と同一にして、週と時間で枠を配置、そこにネタとかアウトプットの表をリンク」
//   「マスにリンクは狙いも書けるように」「引用とかも対象にして。何日前のこのポストを引用とかを関係性わかるように」→ デモに OK 11:36）
// 予約枠の設定の窓をこの 1 画面に置き換えた。曜日 × 時刻のマスに枠を置き、枠ごとに 出す種類・ネタの表（ジャンル）・狙い・引用元 を持つ。
// 枠を押すと右に、結んだネタの表のネタが出て、押すと次の回のその枠に仮置き（下書き）になる（App.jsx の placeAt と同じ処理）。
// カレンダーの週の表に空いた枠が薄く出るのは今のまま。毎月（第N曜日）の枠は表の下に並べる。
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getPostTypeStyle, SLOT_DOWS, fmtDate, slotTime, genId, stripHtml, REL_TYPES, isRelType } from "../constants.js";
import { dbFetchSheetGenres } from "../lib/supabase.js";
import { slotLabel } from "./CalendarView.jsx";
import { openCtx } from "../components/CtxMenu.jsx";
import { useDialogFocus } from "../lib/useDialogFocus.js";
import { MaterialsEditor } from "../components/SlotMaterials.jsx";
import { effSlot, hasDayRule, slotStats } from "../lib/materials.js";
import { useZoom, ZoomControl } from "../components/ZoomControl.jsx";

const DOW = ["", "月", "火", "水", "木", "金", "土", "日"];
const SLEEP = "寝かせ";
const headOf = p => (p.title || "").trim() || (p.memo || "").trim().split("\n")[0] || stripHtml(p.body || "").trim().slice(0, 60) || "（タイトルなし）";
const dowOf = d => (d.getDay() === 0 ? 7 : d.getDay());

// 何日前の枠か・引用／告知の相手との関係は lib/slotRel.js へ移した（2026-11-20 カレンダーの「済」でも使うため）
export { gapDays, relOf } from "../lib/slotRel.js";
import { relOf } from "../lib/slotRel.js";
// 2026-11-18 何日前（後は負）の日にある枠。毎週の枠はその曜日、毎日の枠は毎日。同じ日の引用は時刻が前（同じも可）のものだけ
const MAX_GAP = 31;
export function slotsOnGap(all, cur, g) {
  const tDow = cur.type === "daily" ? null : ((((cur.dow || 1) - 1 - g) % 7) + 7) % 7 + 1;
  return all.filter(x => x.id !== cur.id && !isRelType(x.postType) && x.type !== "nth_weekday"
    && (x.type === "daily" || tDow == null || x.dow === tDow)
    && !(g === 0 && cur.postType !== "x_promo" && slotTime(x) > slotTime(cur)));
}
const gapLabel = (g, promo) => (g === 0 ? "同じ日" : g > 0 ? `${g}日前${promo ? "（告知）" : ""}` : `${-g}日後（予告）`);
const relVerb = (s, r) => (s.postType === "x_promo" ? (r.after ? "予告" : "告知") : "引用");
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

// 2026-11-18 Naoki「設定の配信計画とかは外に出す」→ 上の帯のタブ「配信計画」の画面として出す（asScreen）。窓の形も残す
export function DeliveryPlan(props) {
  return props.asScreen ? <PlanBody {...props} /> : <PlanDialog {...props} />;
}
function PlanDialog(props) {
  const box = useRef(null);
  useDialogFocus(box, { onClose: props.onClose });
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }} onMouseDown={e => { if (e.target === e.currentTarget) props.onClose(); }}>
    <div ref={box} role="dialog" aria-modal="true" aria-labelledby="plan-title" style={{ background: "#f5f0eb", borderRadius: 16, width: "100%", maxWidth: 1240, height: "min(860px, calc(100vh - 28px))", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px #00000030" }}>
      <PlanBody {...props} />
    </div>
  </div>;
}
function PlanBody({ uid, slots, saveSlots, posts, postTypes, placeAt, onOpen, onClose, showToast, setUndo, asScreen, templates = [] }) {
  const [sel, setSel] = useState(null);
  // 2026-11-18 毎日の枠の曜日（0＝すべての曜日）と、右の欄のタブ（決めごと／評価）
  const [dayTab, setDayTab] = useState(0);
  const [ptab, setPtab] = useState("rule");
  const [evN, setEvN] = useState(12);
  const tplName = id => templates.find(t => String(t.id) === String(id))?.name || "";
  const pickSlot = (s, d) => { setSel(s.id); setDayTab(s.type === "daily" && d ? d : 0); };
  const [genres, setGenres] = useState([]);
  const [newTime, setNewTime] = useState("");
  const aimRef = useRef(null);
  const [zoom, setZoom] = useZoom("plan");
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
    { label: "この枠を告知する枠を追加", run: () => { const d = s.type === "daily" ? 1 : ((s.dow || 1) + 5) % 7 + 1; add(d, "12:00", { postType: "x_promo", quote_of: String(s.id) }); showToast(`${DOW[d]} 12:00 に告知の枠を追加しました`); } },
    { label: "複製して次の日へ", run: () => { const d = ((s.dow || 1) % 7) + 1; add(d, slotTime(s), { postType: s.postType, genre: s.genre || null, aim: s.aim || "" }); showToast(`${DOW[d]} に複製しました`); } },
    { label: "この枠を削除", danger: true, run: () => remove(s) },
  ];

  // 2026-11-18 Naoki「引用の方が下に来て、ちょっとサイズが小さいイメージで。サブタスク的な見え方」→ 確定案に OK 13:06
  // 引用・告知は 1 行の小さな行。同じマスに相手がいれば相手のすぐ下に字下げで、いなければマスの一番下に並べる
  const subPill = (s, nested) => {
    const rt = REL_TYPES[s.postType]; const q = s.quote_of ? slots.find(x => String(x.id) === String(s.quote_of)) : null;
    const r = q ? relOf(q, s) : null; const f = filled(s); const nm = (s.materials || []).length;
    const isSrc = cur && src && src.id === s.id, isUse = cur && String(s.quote_of) === String(cur.id);
    const what = q ? `${r.text}${getPostTypeStyle(q.postType, postTypes).label}` : "相手を選ぶ";
    const tip = `${getPostTypeStyle(s.postType, postTypes).label}：${q ? `${what}を${relVerb(s, r)}` : "相手がまだ無い"}\n次の回：${f ? headOf(f) : "空き"}${s.aim ? `\n狙い：${s.aim}` : ""}${nm ? `\n資料：${(s.materials || []).map(m => m.label).join("・")}` : ""}`;
    return <button key={s.id} type="button" onClick={() => setSel(s.id)} onContextMenu={e => openCtx(e, menuFor(s))} aria-pressed={sel === s.id} title={tip}
      aria-label={`${getPostTypeStyle(s.postType, postTypes).label}・${q ? `${what}を${relVerb(s, r)}` : "相手がまだ無い"}・次の回 ${f ? headOf(f) : "空き"}`}
      style={{ display: "flex", alignItems: "flex-start", gap: 4, width: nested ? "calc(100% - 10px)" : "100%", marginLeft: nested ? 10 : 0, marginBottom: 4, padding: "3px 6px", borderRadius: 6, border: "none",
        background: rt.soft, boxShadow: `inset 3px 0 0 ${rt.bar}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", fontSize: 12, lineHeight: 1.35, color: rt.ink, fontWeight: 700,
        outline: sel === s.id ? "2px solid #f59e0b" : isSrc ? `2px dashed ${REL_TYPES[cur.postType]?.bar || rt.bar}` : isUse ? `2px dashed ${rt.bar}` : "none", outlineOffset: -1 }}>
      <span aria-hidden style={{ color: "#a39a90", fontWeight: 800 }}>└</span>
      <span style={{ minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-all" }}>{rt.word}・{what}</span>
    </button>;
  };
  const cellItems = (here, d) => {
    const main = here.filter(s => !isRelType(s.postType)), subs = here.filter(s => isRelType(s.postType)), used = new Set();
    const out = [];
    main.forEach(m => { out.push(pill(m, false, d)); subs.filter(x => String(x.quote_of) === String(m.id)).forEach(x => { used.add(x.id); out.push(subPill(x, true)); }); });
    subs.filter(x => !used.has(x.id)).forEach(x => out.push(subPill(x, false)));
    return out;
  };
  const pill = (s0, small, d) => {
    const s = effSlot(s0, d); const ov = d && hasDayRule(s0, d);
    const st = slotStats(s0, posts, slots, s0.type === "daily" ? d || 0 : 0, 12);
    const gc = { S: ["#ede9fe", "#5b21b6"], A: ["#dcfce7", "#166534"], B: ["#fef3c7", "#92400e"], C: ["#fee2e2", "#991b1b"], D: ["#f3f4f6", "#4b5563"] }[st.grade];
    const pt = getPostTypeStyle(s.postType, postTypes); const q = s.quote_of ? slots.find(x => String(x.id) === String(s.quote_of)) : null;
    const byQ = quotedBy(s.id).filter(x => x.postType === "x_quote").length, byP = quotedBy(s.id).filter(x => x.postType === "x_promo").length; const f = filled(s);
    const rt = isRelType(s.postType) ? REL_TYPES[s.postType] : null; const r = q ? relOf(q, s) : null;
    const isSrc = cur && src && src.id === s.id, isUse = cur && String(s.quote_of) === String(cur.id);
    // 2026-11-18 Naoki「『空き』とかでるのはマウスオーバーポップアップにして、代わりに資料 4 とかの表示で OK」
    const nm = (s.materials || []).length;
    const tip = `次の回：${f ? headOf(f) : "空き"}${s.aim ? `\n狙い：${s.aim}` : ""}${nm ? `\n資料：${(s.materials || []).map(m => m.label).join("・")}` : ""}`;
    return <button key={s.id} type="button" onClick={() => pickSlot(s0, d)} onContextMenu={e => openCtx(e, menuFor(s0))} aria-pressed={sel === s.id && (s0.type !== "daily" || dayTab === d)} title={`${tip}${st.rated ? `\n評価：${st.grade}（平均 ${st.avg.toFixed(1)}・${st.rated} 件）` : ""}`}
      aria-label={`${nameOf(s, postTypes)}${st.rated >= 3 ? `・評価 ${st.grade}` : ""}${ov ? "・この曜日だけ調整あり" : ""}${s.genre ? `・ネタの表 ${s.genre}` : ""}${q ? `・${r.text}枠を${relVerb(s, r)}` : ""}・次の回 ${f ? headOf(f) : "空き"}${nm ? `・資料 ${nm}` : ""}`}
      style={{ position: "relative", width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 3, padding: "6px 7px", borderRadius: 9, background: rt ? rt.soft : "#fff", boxShadow: rt ? `inset 3px 0 0 ${rt.bar}` : "none", cursor: "pointer", fontFamily: "inherit", minHeight: small ? 0 : 66, marginBottom: 4,
        border: `1px solid ${sel === s.id && (s0.type !== "daily" || !dayTab || dayTab === d) ? "#f59e0b" : "#e6dfd6"}`, outline: sel === s.id && (s0.type !== "daily" || !dayTab || dayTab === d) ? "2px solid #f59e0b" : isSrc ? `2px dashed ${REL_TYPES[cur.postType]?.bar || "#0ea5e9"}` : isUse ? `2px dashed ${REL_TYPES[s.postType]?.bar || "#7dd3fc"}` : "none", outlineOffset: -1 }}>
      {isSrc && <span style={{ position: "absolute", top: -9, right: 6, fontSize: 12, fontWeight: 800, background: REL_TYPES[cur.postType]?.ink || "#0369a1", color: "#fff", borderRadius: 5, padding: "0 5px" }}>{cur.postType === "x_promo" ? "告知先" : "引用元"}</span>}
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: "#1a1a1a" }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: pt.dot, flexShrink: 0 }} />{pt.label}{s.type === "daily" && <span style={{ fontWeight: 600, color: "#736a62" }}>毎日</span>}</span>
      {s.genre && <span style={{ fontSize: 12, color: "#6b6259", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>▤ {s.genre}</span>}
      {q && <span style={{ fontSize: 12, fontWeight: 700, color: rt.ink, lineHeight: 1.4, wordBreak: "break-all" }}>{r.after ? "→" : "↩"} {r.text}{getPostTypeStyle(q.postType, postTypes).label}を{relVerb(s, r)}</span>}
      {s.aim && <span title={"狙い：" + s.aim} style={{ fontSize: 12, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>◎ {s.aim}</span>}
      {(byQ > 0 || byP > 0) && <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6259" }}>{[byQ ? `引用される ${byQ}` : "", byP ? `告知される ${byP}` : ""].filter(Boolean).join("・")}</span>}
      {ov && <span style={{ fontSize: 12, fontWeight: 700, color: "#9a3412", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{SLOT_DOWS.find(([x]) => x === d)?.[1]}：{tplName(s.tpl_id) || s.genre || "調整あり"}</span>}
      {(nm > 0 || gc) && <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {nm > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#047857", background: "#ecfdf5", borderRadius: 5, padding: "1px 5px" }}>資料 {nm}</span>}
        {gc && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, background: gc[0], color: gc[1], borderRadius: 5, padding: "0 6px" }}>{st.grade}</span>}
      </span>}
    </button>;
  };

  // 2026-11-18 毎日の枠の曜日ごとの上書き。dayOn のあいだ、柱・型・狙い・参考はその曜日の day_rules に書く
  const dayOn = !!(cur && cur.type === "daily" && dayTab > 0 && !isRelType(cur.postType));
  const rule = dayOn ? (cur.day_rules || {})[String(dayTab)] || {} : {};
  const getV = k => (dayOn ? rule[k] ?? cur[k] : cur?.[k]);
  const setV = (k, v) => {
    if (!dayOn) { patch(cur.id, { [k]: k === "materials" ? v || [] : v }); return; }
    const dr = { ...(cur.day_rules || {}) }; const r = { ...(dr[String(dayTab)] || {}) };
    if (v === undefined || v === null || (k !== "materials" && v === "")) delete r[k]; else r[k] = v;
    if (Object.keys(r).length) dr[String(dayTab)] = r; else delete dr[String(dayTab)];
    patch(cur.id, { day_rules: dr });
  };
  const lab = { fontSize: 12, fontWeight: 700, color: "#6b6259", display: "block", marginBottom: 4 };
  const fld = { width: "100%", border: "1px solid #a39a90", borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" };
  const nextDt = cur ? nextOccurrence(cur) : null;
  const curFill = cur ? filled(cur) : null;
  const srcFill = cur && src && nextDt ? (() => { const d = new Date(nextDt.slice(0, 10) + "T00:00"); { const rr = relOf(src, cur); d.setDate(d.getDate() + (rr.after ? rr.n : -rr.n)); } return fillAt(src, `${fmtDate(d)}T${slotTime(src)}`); })() : null;
  const ideas = cur ? ideasOf(cur) : [];

  return <div style={asScreen ? { display: "flex", flexDirection: "column", height: "calc(100vh - 55px)", background: "#f5f0eb" } : { display: "contents" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: asScreen ? "8px 16px" : "12px 16px", background: "#fff", borderBottom: "1px solid #e6dfd6", flexWrap: "wrap", rowGap: 6 }}>
        {!asScreen && <span id="plan-title" style={{ fontWeight: 800, fontSize: 16 }}>配信計画</span>}
        <span style={{ fontSize: 12, color: "#736a62" }}>マスの空いた所を押すと枠を追加・枠を右クリックでメニュー</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <ZoomControl value={zoom} onChange={setZoom} />
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} aria-label="追加する時刻" style={{ border: "1px solid #a39a90", borderRadius: 8, padding: "4px 6px", fontSize: 13, fontFamily: "inherit" }} />
          <button type="button" onClick={() => { if (!newTime) { showToast("時刻を入れてください"); return; } setExtraTimes(t => [...new Set([...t, newTime])]); setNewTime(""); }} style={{ border: "1px solid #e6dfd6", background: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>＋ 時刻の行を追加</button>
          {!asScreen && <button type="button" onClick={onClose} style={{ border: "1px solid #e6dfd6", background: "#fff", borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#6b6259", cursor: "pointer", fontFamily: "inherit" }}>閉じる</button>}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14, padding: 14 }}>
        <div style={{ flex: 1, minWidth: 0, background: "#fff", border: "1px solid #e6dfd6", borderRadius: 12, overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, tableLayout: "fixed", zoom: zoom / 100 }}>
            <thead><tr><th style={{ width: 62, background: "#f7f3ee", borderBottom: "1px solid #e6dfd6" }} />{SLOT_DOWS.map(([d, l]) => <th key={d} style={{ fontSize: 12, fontWeight: 800, color: "#736a62", padding: 8, textAlign: "left", background: "#f7f3ee", borderBottom: "1px solid #e6dfd6" }}>{l}</th>)}</tr></thead>
            <tbody>
              {times.map(t => <tr key={t}>
                <td style={{ fontSize: 12, fontWeight: 700, color: "#736a62", padding: 8, verticalAlign: "top", borderTop: "1px solid #f1ebe4" }}>{t}</td>
                {SLOT_DOWS.map(([d, l]) => {
                  const here = grid.filter(s => slotTime(s) === t && (s.type === "daily" || s.dow === d));
                  return <td key={d} style={{ verticalAlign: "top", padding: 4, borderTop: "1px solid #f1ebe4", borderLeft: "1px solid #f1ebe4", height: 80 }}>
                    {cellItems(here, d)}
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 6 }}>{monthly.map(s => <div key={s.id}><div style={{ fontSize: 12, color: "#736a62", marginBottom: 2 }}>{slotLabel(s)}</div>{isRelType(s.postType) ? subPill(s, false) : pill(s, true)}</div>)}</div>
          </div>}
        </div>
        <div style={{ width: 340, flexShrink: 0, background: "#fff", border: "1px solid #e6dfd6", borderRadius: 12, padding: 14, overflowY: "auto" }}>
          {!cur ? <div style={{ fontSize: 13, color: "#736a62", lineHeight: 1.7 }}>枠を押すと、ここで 出す種類・ネタの表・狙い・引用元 を決められます。次の回の枠にネタを入れるのもここから。</div> : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{slotLabel(cur)} の枠</div>
            {cur.type === "daily" && !isRelType(cur.postType) && <div role="group" aria-label="曜日ごとの決めごと" style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {[[0, "すべて"], ...SLOT_DOWS].map(([d, l]) => { const on = dayTab === d, mk = d && hasDayRule(cur, d);
                return <button key={d} type="button" onClick={() => setDayTab(d)} aria-pressed={on} aria-label={`${d ? l + "曜" : "すべての曜日"}${mk ? "（調整あり）" : ""}`}
                  style={{ border: `1px solid ${on ? "#1a1a1a" : mk ? "#fb923c" : "#e6dfd6"}`, background: on ? "#1a1a1a" : "#fff", color: on ? "#fff" : mk ? "#9a3412" : "#3d3530", borderRadius: 7, padding: "3px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>; })}
            </div>}
            <div role="tablist" style={{ display: "flex", gap: 2, borderBottom: "1px solid #e6dfd6" }}>
              {[["rule", "決めごと"], ["eval", "評価"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={ptab === k} onClick={() => setPtab(k)}
                style={{ border: "none", background: "none", padding: "6px 10px", fontSize: 13, fontWeight: 700, color: ptab === k ? "#1a1a1a" : "#6b6259", borderBottom: `2px solid ${ptab === k ? "#f59e0b" : "transparent"}`, marginBottom: -1, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>)}
            </div>
            {ptab === "eval" ? <SlotEval s={cur} posts={posts} slots={slots} dow={cur.type === "daily" ? dayTab : 0} n={evN} setN={setEvN} onOpen={onOpen} /> : <>
            {dayOn && <div style={{ fontSize: 12, background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, padding: "6px 8px", color: "#9a3412" }}>{SLOT_DOWS.find(([x]) => x === dayTab)?.[1]}曜だけの決めごと。「すべての曜日と同じ」の欄は、すべての曜日の値を使う</div>}
            {!dayOn && <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><label style={lab} htmlFor="dp-dow">曜日</label>
                <select id="dp-dow" value={cur.type === "daily" ? "daily" : cur.dow} onChange={e => patch(cur.id, e.target.value === "daily" ? { type: "daily" } : { type: "weekly", dow: +e.target.value })} style={fld} disabled={cur.type === "nth_weekday"}>
                  {SLOT_DOWS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}<option value="daily">毎日</option>
                </select></div>
              <div style={{ flex: 1 }}><label style={lab} htmlFor="dp-time">時刻</label>
                <input id="dp-time" type="time" value={slotTime(cur)} onChange={e => e.target.value && patch(cur.id, { time: e.target.value })} style={fld} /></div>
            </div>}
            {!dayOn && <div><label style={lab} htmlFor="dp-pt">出すもの（アウトプットの種類）</label>
              <select id="dp-pt" value={cur.postType || "x_post"} onChange={e => patch(cur.id, { postType: e.target.value, quote_of: isRelType(e.target.value) ? cur.quote_of : null, quote_gap: isRelType(e.target.value) ? cur.quote_gap ?? null : null })} style={fld}>
                {Object.entries(postTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>}
            <div><label style={lab} htmlFor="dp-genre">柱（ネタの表・何について書くか）</label>
              <select id="dp-genre" value={dayOn ? (rule.genre ?? "__inherit") : cur.genre || ""} onChange={e => setV("genre", e.target.value === "__inherit" ? null : e.target.value || null)} style={fld}>
                {dayOn && <option value="__inherit">すべての曜日と同じ（{cur.genre || "決めない"}）</option>}
                <option value="">決めない（この種類のネタ全部）</option>
                {getV("genre") && !genres.some(g => g.name === getV("genre")) && <option value={getV("genre")}>{getV("genre")}</option>}
                {genres.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select></div>
            {!isRelType(cur.postType) && <div><label style={lab} htmlFor="dp-tpl">型（どの形で書くか・構成とプロンプトは「型」にある）</label>
              <select id="dp-tpl" value={dayOn ? (rule.tpl_id ?? "__inherit") : cur.tpl_id || ""} onChange={e => setV("tpl_id", e.target.value === "__inherit" ? null : e.target.value || null)} style={fld}>
                {dayOn && <option value="__inherit">すべての曜日と同じ（{tplName(cur.tpl_id) || "決めない"}）</option>}
                <option value="">決めない</option>
                {getV("tpl_id") && !templates.some(t => String(t.id) === String(getV("tpl_id"))) && <option value={getV("tpl_id")}>（消えた型）</option>}
                {[...templates].sort((a, b) => ((a.post_type === cur.postType ? 0 : 1) - (b.post_type === cur.postType ? 0 : 1))).map(t => <option key={t.id} value={String(t.id)}>{t.name}{t.post_type && t.post_type !== cur.postType ? `（${getPostTypeStyle(t.post_type, postTypes).label}）` : ""}</option>)}
              </select></div>}
            {isRelType(cur.postType) && !dayOn && <div><label style={lab} htmlFor="dp-q">{cur.postType === "x_promo" ? "告知するもの（どの枠の投稿を告知するか）" : "引用元（どの枠の投稿を引用するか）"}</label>
              {(() => {
                // まず「何日前か」→ その日にある枠。前に選んだ相手は、その日数のまま出す
                const promo = cur.postType === "x_promo";
                const g = Number.isInteger(cur.quote_gap) ? cur.quote_gap : src ? (r => (r.after ? -r.n : r.n))(relOf(src, cur)) : null;
                const gaps = [0, ...Array.from({ length: MAX_GAP }, (_, i) => i + 1), ...(promo ? Array.from({ length: MAX_GAP }, (_, i) => -(i + 1)) : [])];
                const cand = g == null ? [] : slotsOnGap(slots, cur, g);
                const pickGap = v => {
                  if (v === "") { patch(cur.id, { quote_of: null, quote_gap: null }); return; }
                  const ng = Number(v), c = slotsOnGap(slots, cur, ng);
                  const keep = cur.quote_of && c.some(x => String(x.id) === String(cur.quote_of)) ? String(cur.quote_of) : c.length === 1 ? String(c[0].id) : null;
                  patch(cur.id, { quote_gap: ng, quote_of: keep });
                };
                return <div style={{ display: "flex", gap: 6 }}>
                  <select id="dp-q" aria-label="何日前か" value={g == null ? "" : String(g)} onChange={e => pickGap(e.target.value)} style={{ ...fld, flex: "0 0 128px" }}>
                    <option value="">日を選ぶ</option>
                    {gaps.map(x => <option key={x} value={String(x)}>{gapLabel(x, promo)}</option>)}
                  </select>
                  <select aria-label={promo ? "告知する枠" : "引用元の枠"} value={cur.quote_of ? String(cur.quote_of) : ""} disabled={g == null}
                    onChange={e => patch(cur.id, { quote_of: e.target.value || null, quote_gap: e.target.value ? g : null })} style={{ ...fld, flex: 1, minWidth: 0 }}>
                    <option value="">{g == null ? "先に日を選ぶ" : cand.length ? "枠を選ぶ" : "その日に枠がありません"}</option>
                    {cand.map(x => <option key={x.id} value={String(x.id)}>{slotTime(x)} {getPostTypeStyle(x.postType, postTypes).label}{x.type === "daily" ? "（毎日）" : ""}{x.genre ? `・${x.genre}` : ""}</option>)}
                  </select>
                </div>;
              })()}
              {src && <div style={{ fontSize: 12, color: REL_TYPES[cur.postType].ink, marginTop: 4 }}>{relOf(src, cur).text}投稿を{relVerb(cur, relOf(src, cur))}する。表で点線の枠が相手</div>}
            </div>}
            <div><label style={lab} htmlFor="dp-aim">狙い（この枠で何を起こしたいか）</label>
              <AimField key={`${cur.id}-${dayOn ? dayTab : 0}`} id="dp-aim" inputRef={aimRef} value={(dayOn ? rule.aim : cur.aim) || ""} onSave={v => setV("aim", v || null)}
                placeholder={dayOn ? `すべての曜日と同じ：${cur.aim || "（なし）"}` : undefined} /></div>
            <div><span style={lab}>参考と資料（スワイプくん・思考整理くん・リンク・チェックリスト・PDF・MD。書くときに右の「手順」タブに出る）</span>
              {dayOn && rule.materials === undefined
                ? <div style={{ fontSize: 12.5, color: "#6b6259" }}>すべての曜日と同じ（{(cur.materials || []).length} 件）
                    <button type="button" onClick={() => setV("materials", [...(cur.materials || [])])} style={{ marginLeft: 6, border: "1px solid #e6dfd6", background: "#fff", borderRadius: 7, padding: "3px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>この曜日だけの参考にする</button></div>
                : <>
                  <MaterialsEditor key={`${cur.id}-${dayOn ? dayTab : 0}`} materials={(dayOn ? rule.materials : cur.materials) || []} onChange={list => setV("materials", list)} showToast={showToast}
                    onRemoved={(m, before) => { const id = cur.id, d = dayOn ? dayTab : 0; if (setUndo) setUndo({ msg: `「${m.label}」を削除しました`, run: () => saveSlots(prev => prev.map(x => x.id !== id ? x : d ? { ...x, day_rules: { ...(x.day_rules || {}), [String(d)]: { ...((x.day_rules || {})[String(d)] || {}), materials: before } } } : { ...x, materials: before })) }); }} />
                  {dayOn && <button type="button" onClick={() => setV("materials", undefined)} style={{ marginTop: 6, border: "none", background: "none", padding: 0, fontSize: 12, color: "#b45309", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>すべての曜日と同じに戻す</button>}
                </>}</div>
            {!dayOn && <>
            <div style={{ height: 1, background: "#e6dfd6" }} />
            <div style={{ fontSize: 12, fontWeight: 800, color: "#736a62" }}>次の回（{shortDt(nextDt)}）</div>
            {src && <div style={{ border: "1px solid #e6dfd6", boxShadow: `inset 3px 0 0 ${REL_TYPES[cur.postType]?.bar || "#0ea5e9"}`, background: REL_TYPES[cur.postType]?.soft || "#f0f9ff", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: REL_TYPES[cur.postType]?.ink || "#075985" }}>{cur.postType === "x_promo" ? "告知する投稿" : "引用する投稿"}（{relOf(src, cur).text.replace(/の$/, "")}・{nameOf(src, postTypes)}）</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{srcFill ? headOf(srcFill) : "（その枠はまだ空き）"}</div>
              {srcFill && <button type="button" onClick={() => onOpen(srcFill)} style={{ marginTop: 6, border: "1px solid #e6dfd6", background: "#fff", borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{cur.postType === "x_promo" ? "告知するものを開く →" : "引用元を開く →"}</button>}
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
            </>}
            </>}
          </div>}
        </div>
      </div>
      <style>{`.dp-add:hover,.dp-add:focus-visible{background:#f7f3ee!important;color:#a39a90!important}`}</style>
  </div>;
}

// 狙いの欄：打つ手を止めて 1 秒、または外へ出たときに保存（1 字ごとに表へ書かない）
// 2026-11-18 枠の評価（S〜D の平均・分布・履歴）。毎日の枠は曜日で絞る
function SlotEval({ s, posts, slots, dow, n, setN, onOpen }) {
  const st = slotStats(s, posts, slots, dow, n || 0);
  const col = { S: "#7c3aed", A: "#15803d", B: "#b45309", C: "#b91c1c", D: "#6b7280" };
  const day = dow ? `${SLOT_DOWS.find(([x]) => x === dow)?.[1]}曜の` : s.type === "daily" ? "すべての曜日の" : "";
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ fontSize: 12, color: "#6b6259", display: "flex", alignItems: "center", gap: 6 }}>{day}{slotTime(s)}・公開済み
      <select aria-label="数える回数" value={n} onChange={e => setN(+e.target.value)} style={{ border: "1px solid #a39a90", borderRadius: 6, padding: "1px 4px", fontSize: 12, fontFamily: "inherit" }}>
        <option value={4}>直近 4 回</option><option value={12}>直近 12 回</option><option value={0}>すべて</option></select></div>
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1, background: "#fff", border: "1px solid #e6dfd6", borderRadius: 10, padding: "8px 10px" }}><b style={{ fontSize: 22 }}>{st.grade}</b>
        <div style={{ fontSize: 12, color: "#736a62" }}>{st.avg != null ? `平均 ${st.avg.toFixed(1)}（S=5〜D=1）` : "評価がまだありません"}{st.rated && st.rated < 3 ? "・3 件から出す" : ""}</div></div>
      <div style={{ flex: 1, background: "#fff", border: "1px solid #e6dfd6", borderRadius: 10, padding: "8px 10px" }}><b style={{ fontSize: 22 }}>{st.rated} / {st.recent.length}</b>
        <div style={{ fontSize: 12, color: "#736a62" }}>評価済み／出した数{st.all > st.recent.length ? `（全 ${st.all}）` : ""}</div></div>
    </div>
    {st.rated > 0 && <div>
      <div aria-hidden style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden" }}>{Object.entries(st.dist).filter(([, v]) => v).map(([k, v]) => <i key={k} style={{ width: `${(v / st.rated) * 100}%`, background: col[k] }} />)}</div>
      <div style={{ fontSize: 12, color: "#736a62", marginTop: 3 }}>{Object.entries(st.dist).map(([k, v]) => `${k} ${v}`).join("・")}</div></div>}
    <div style={{ fontSize: 12, fontWeight: 700, color: "#6b6259" }}>履歴（押すと投稿が開く）</div>
    {!st.recent.length && <div style={{ fontSize: 12.5, color: "#736a62" }}>この枠に入った公開済みの投稿はまだありません</div>}
    {st.recent.map(p => { const g = String(p.score || "").trim().toUpperCase(); return <button key={p.id} type="button" onClick={() => onOpen(p)}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid #f1ebe4", background: "none", padding: "6px 2px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
      <span style={{ color: "#736a62", flex: "none", fontVariantNumeric: "tabular-nums" }}>{p.datetime.slice(5, 10).replace("-", "/")}</span>
      <span style={{ flex: "none", minWidth: 22, textAlign: "center", borderRadius: 5, fontWeight: 800, fontSize: 12, color: col[g] ? "#fff" : "#736a62", background: col[g] || "#f3f4f6" }}>{col[g] ? g : "－"}</span>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headOf(p)}</span></button>; })}
    <div style={{ fontSize: 12, color: "#736a62" }}>評価は書く画面の「詳細」で付ける S〜D。投稿は、同じ種類でその曜日の時刻がいちばん近い枠（3 時間以内）に数える</div>
  </div>;
}

function AimField({ id, value, onSave, inputRef, placeholder }) {
  const [v, setV] = useState(value);
  const t = useRef(null);
  const commit = x => { clearTimeout(t.current); t.current = null; if (x !== value) onSave(x); };
  // 2026-11-18 見直し：打って 1 秒たつ前に別の枠・曜日へ移ると、打ちかけの字が消えていた。閉じるときに残りを保存する
  const last = useRef({ v, value, onSave }); last.current = { v, value, onSave };
  useEffect(() => () => { if (t.current) { clearTimeout(t.current); const l = last.current; if (l.v !== l.value) l.onSave(l.v); } }, []);
  return <textarea id={id} ref={inputRef} rows={3} value={v} placeholder={placeholder || "例：週の頭に保存されるノウハウで、プロフへの流入を作る"}
    onChange={e => { const x = e.target.value; setV(x); clearTimeout(t.current); t.current = setTimeout(() => commit(x), 1000); }} onBlur={() => commit(v)}
    style={{ width: "100%", border: "1px solid #a39a90", borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />;
}
