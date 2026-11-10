// 参考を探して付ける（2026-11-10）。スワイプくんは読み込んだ一覧から、思考整理くんは思考整理くんの口で探す
import React, { useEffect, useState } from "react";
import { loadOthers } from "../screens/FindView.jsx";
import { searchMaps } from "../lib/mindmapLink.js";
import { REF_MAX, REF_LABEL, refKey } from "../lib/refs.js";

const chip = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, borderRadius: 99, padding: "3px 4px 3px 9px", border: "1px solid #c4b5fd", background: "#f5f3ff", color: "#4c1d95", maxWidth: "100%" };
const xbtn = { border: "none", background: "none", cursor: "pointer", color: "#4c1d95", fontSize: 14, lineHeight: 1, padding: "0 4px", minWidth: 24, minHeight: 24 };

export function RefChips({ refs, onRemove, locked = [] }) {
  if (!refs.length && !locked.length) return null;
  return <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {locked.map(r => <span key={"l" + refKey(r)} style={{ ...chip, paddingRight: 9, background: "#f3f0ec", borderColor: "#d4cbbf", color: "#4b4038" }} title="依頼の型でいつも付く参考">{REF_LABEL[r.k]}：<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{r.title}</span>（型）</span>)}
    {refs.map(r => <span key={refKey(r)} style={chip}>{REF_LABEL[r.k]}：<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{r.title}</span>
      {onRemove && <button onClick={() => onRemove(r)} aria-label={`参考「${r.title}」を外す`} style={xbtn}>×</button>}</span>)}
  </div>;
}

export function RefPicker({ value, onChange, max = REF_MAX }) {
  const [q, setQ] = useState("");
  const [sw, setSw] = useState(null);
  const [maps, setMaps] = useState([]);
  const [mapState, setMapState] = useState("idle");
  useEffect(() => { let live = true; loadOthers().then(d => { if (live) setSw(d?.swipes || []); }); return () => { live = false; }; }, []);
  useEffect(() => {
    const t = q.trim();
    if (!t) { setMaps([]); setMapState("idle"); return; }
    const ac = new AbortController();
    const h = setTimeout(async () => {
      setMapState("busy");
      try { const r = await searchMaps(t, fetch, ac.signal); setMaps(r || []); setMapState(r === null ? "off" : "idle"); }
      catch (e) { if (e?.name !== "AbortError") { setMaps([]); setMapState("err"); } }
    }, 350);
    return () => { clearTimeout(h); ac.abort(); };
  }, [q]);
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const swHits = !terms.length ? (sw || []).slice(0, 6) : (sw || []).filter(s => { const t = [s.title, s.excerpt, s.body, s.author, s.reason, s.an_hypo, s.an_idea].join(" ").toLowerCase(); return terms.every(x => t.includes(x)); }).slice(0, 8);
  const has = r => value.some(v => refKey(v) === refKey(r));
  const full = value.length >= max;
  const toggle = r => onChange(has(r) ? value.filter(v => refKey(v) !== refKey(r)) : full ? value : [...value, r]);
  const Row = ({ r, sub }) => {
    const on = has(r);
    return <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", borderBottom: "1px solid #f0ebe5" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
        {sub && <div style={{ fontSize: 12, color: "#6b6259", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
      </div>
      <button onClick={() => toggle(r)} disabled={!on && full} aria-pressed={on} style={{ border: `1px solid ${on ? "#7c3aed" : "#a39a90"}`, background: on ? "#7c3aed" : "#fff", color: on ? "#fff" : "#1a1a1a", borderRadius: 7, padding: "5px 10px", minHeight: 32, fontSize: 12, fontWeight: 700, cursor: !on && full ? "default" : "pointer", opacity: !on && full ? .5 : 1, fontFamily: "inherit", whiteSpace: "nowrap" }}>{on ? "付けた ✓" : "付ける"}</button>
    </div>;
  };
  return <div style={{ border: "1px solid #e7e0d8", borderRadius: 10, padding: "8px 10px", background: "#fff" }}>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder="スワイプくん・思考整理くんを探す" aria-label="参考を探す" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #a39a90", borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit" }} />
    <div style={{ fontSize: 12, color: "#6b6259", margin: "6px 0 2px" }}>{value.length}/{max} 件付いています{full ? "（上限）" : ""}</div>
    <div style={{ maxHeight: 260, overflowY: "auto" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#9a3412", marginTop: 6 }}>スワイプくん{!terms.length ? "（新しい順）" : ""}</div>
      {sw === null ? <div style={{ fontSize: 12, color: "#6b6259" }}>読み込み中…</div> : !swHits.length ? <div style={{ fontSize: 12, color: "#6b6259" }}>当たるスワイプはありません</div>
        : swHits.map(s => <Row key={s.id} r={{ k: "swipe", id: String(s.id), title: (s.title || s.excerpt || s.body || "（見出しなし）").trim().split("\n")[0].slice(0, 80) }} sub={[s.shu, s.author, s.reason].filter(Boolean).join("・")} />)}
      {mapState !== "off" && terms.length > 0 && <>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#5b21b6", marginTop: 8 }}>思考整理くん</div>
        {mapState === "busy" ? <div style={{ fontSize: 12, color: "#6b6259" }}>探しています…</div> : mapState === "err" ? <div style={{ fontSize: 12, color: "#b91c1c" }}>思考整理くんを探せませんでした</div>
          : !maps.length ? <div style={{ fontSize: 12, color: "#6b6259" }}>当たるマップはありません</div>
          : maps.slice(0, 8).map(m => <Row key={m.id} r={{ k: "map", id: String(m.id), title: m.title || "無題のマップ" }} sub={(m.hits || [])[0] || m.folder || ""} />)}
      </>}
    </div>
  </div>;
}
