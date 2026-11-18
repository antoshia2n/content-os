// 枠の資料（2026-11-18・lib/materials.js）
// MaterialsEditor：配信計画の右で、枠に資料を置く・編集・削除・並べ替え
// MaterialsView  ：書く画面の右の「手順」タブで、資料を見てチェックを付ける
import React, { useEffect, useRef, useState } from "react";
import { itemsFromText, newId, uploadDoc } from "../lib/materials.js";
import { loadOthers, findAll } from "../screens/FindView.jsx";

const KIND = {
  link: { mark: "↗", bg: "#e0f2fe", fg: "#0369a1", name: "リンク" },
  check: { mark: "✓", bg: "#dcfce7", fg: "#047857", name: "チェックリスト" },
  pdf: { mark: "PDF", bg: "#fee2e2", fg: "#b91c1c", name: "PDF" },
  md: { mark: "MD", bg: "#ede9fe", fg: "#6d28d9", name: "MD" },
  swipe: { mark: "S", bg: "#fef3c7", fg: "#92400e", name: "スワイプくん" }, // 2026-11-18 参考の見本
  map: { mark: "M", bg: "#e0e7ff", fg: "#3730a3", name: "思考整理くん" }, // 2026-11-18 参考の下地
};
const Mark = ({ kind }) => { const k = KIND[kind] || KIND.link; return <span aria-hidden style={{ width: 24, height: 22, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, flex: "none", background: k.bg, color: k.fg }}>{k.mark}</span>; };
const fld = { width: "100%", border: "1px solid #a39a90", borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" };
const sb = { border: "1px solid #e6dfd6", background: "#fff", borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#3d3530" };
const safeUrl = u => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");

// ── 配信計画：資料を置く ─────────────────────────────
export function MaterialsEditor({ materials = [], onChange, showToast }) {
  const [form, setForm] = useState(null); // { id?, kind, label, url, text }
  const [find, setFind] = useState(null); // "swipe" | "map"
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const drag = useRef(null);
  const put = list => onChange(list);
  const open = (kind, m) => setForm(m ? { id: m.id, kind, label: m.label || "", url: m.url || "", text: (m.items || []).map(i => i.text).join("\n") } : { kind, label: "", url: "", text: "" });
  const save = () => {
    const f = form; if (!f) return;
    if (f.kind === "link" && !safeUrl(f.url)) { showToast?.("リンクは https:// から始まる住所を入れてください"); return; }
    const prev = materials.find(m => m.id === f.id);
    if (f.kind === "check" && !itemsFromText(f.text).length) { showToast?.("項目を 1 行に 1 つ書いてください"); return; }
    const m = f.kind === "check"
      ? { id: f.id || newId(), kind: "check", label: f.label.trim() || "チェックリスト", items: itemsFromText(f.text, prev?.items || []) }
      : { ...(prev || {}), id: f.id || newId(), kind: f.kind, label: f.label.trim() || (f.kind === "link" ? safeUrl(f.url) : "資料"), url: f.kind === "link" ? safeUrl(f.url) : prev?.url };
    put(prev ? materials.map(x => (x.id === m.id ? m : x)) : [...materials, m]);
    setForm(null);
  };
  const pick = async e => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setBusy(true);
    try { const r = await uploadDoc(file); put([...materials, { id: newId(), kind: r.kind, label: r.label, url: r.url }]); showToast?.(`「${r.label}」を置きました`); }
    catch (err) { showToast?.(err.message || "置けませんでした"); }
    finally { setBusy(false); }
  };
  const remove = m => put(materials.filter(x => x.id !== m.id));
  const move = (from, to) => { if (from === to || from == null) return; const l = [...materials]; const [x] = l.splice(from, 1); l.splice(to, 0, x); put(l); };

  return <div>
    {!materials.length && !form && <div style={{ fontSize: 12.5, color: "#736a62", marginBottom: 6 }}>まだ無い。置いた資料は、この枠の投稿を書くときに右の「手順」タブに出る</div>}
    {materials.map((m, i) => <div key={m.id} draggable={false}
      onDragOver={e => { if (drag.current != null) e.preventDefault(); }} onDrop={e => { e.preventDefault(); move(drag.current, i); drag.current = null; }}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", borderRadius: 8, background: "#fff", border: "1px solid #e6dfd6", marginBottom: 5, fontSize: 13 }}>
      <span draggable onDragStart={e => { drag.current = i; e.dataTransfer.effectAllowed = "move"; }} onKeyDown={e => { if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); move(i, Math.max(0, i - 1)); } if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); move(i, Math.min(materials.length - 1, i + 1)); } }}
        tabIndex={0} role="button" aria-label={`「${m.label}」を並べ替える（Alt＋↑↓）`} title="引っぱって並べ替え" style={{ cursor: "grab", color: "#a39a90", fontWeight: 800, letterSpacing: -2, userSelect: "none" }}>⋮⋮</span>
      <Mark kind={m.kind} />
      <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.label}>{m.label}</span>
      <span style={{ fontSize: 12, color: "#736a62", flex: "none" }}>{m.kind === "check" ? `${(m.items || []).length} 項目` : KIND[m.kind]?.name}</span>
      <button type="button" style={sb} onClick={() => open(m.kind, m)} aria-label={`「${m.label}」を編集`}>編集</button>
      <button type="button" style={{ ...sb, color: "#b91c1c" }} onClick={() => remove(m)} aria-label={`「${m.label}」を削除`}>削除</button>
    </div>)}
    {form && <div style={{ border: "1px solid #a39a90", borderRadius: 10, padding: 10, background: "#fff", display: "flex", flexDirection: "column", gap: 7, marginBottom: 6 }}
      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } if (e.key === "Escape") { e.stopPropagation(); setForm(null); } }}>
      <b style={{ fontSize: 13 }}>{form.id ? "編集" : "追加"}：{KIND[form.kind].name}</b>
      <input autoFocus value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder={form.kind === "check" ? "名前（例：X記事の仕上げチェック）" : "名前"} aria-label="名前" style={fld} />
      {form.kind === "link" && <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://" aria-label="住所" style={fld} />}
      {form.kind === "check" && <textarea rows={6} value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} placeholder={"1 行に 1 項目\n冒頭 3 行で読者の損を言い切った\n図解を 2 枚以上入れた"} aria-label="項目（1 行に 1 つ）" style={{ ...fld, resize: "vertical", lineHeight: 1.6 }} />}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#736a62" }}>⌘／Ctrl＋Enter で保存</span>
        <button type="button" style={{ ...sb, marginLeft: "auto" }} onClick={() => setForm(null)}>キャンセル</button>
        <button type="button" onClick={save} style={{ ...sb, background: "#b45309", color: "#fff", border: "none" }}>保存</button>
      </div>
    </div>}
    {find && <OtherPicker kind={find} onClose={() => setFind(null)} onPick={r => { put([...materials, { id: newId(), kind: find, label: r.title.slice(0, 80), url: r.url, ref: String(r.id) }]); setFind(null); }} />}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {[["swipe", "＋ スワイプくんから"], ["map", "＋ 思考整理くんから"]].map(([k, l]) => <button key={k} type="button" onClick={() => { setForm(null); setFind(f => (f === k ? null : k)); }} aria-expanded={find === k} style={{ ...sb, border: "1px dashed #a39a90", color: "#6b6259" }}>{l}</button>)}
      {[["link", "＋ リンク"], ["check", "＋ チェックリスト"]].map(([k, l]) => <button key={k} type="button" onClick={() => open(k)} style={{ ...sb, border: "1px dashed #a39a90", color: "#6b6259" }}>{l}</button>)}
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} style={{ ...sb, border: "1px dashed #a39a90", color: "#6b6259" }}>{busy ? "置いています…" : "＋ ファイル（PDF・MD）"}</button>
      <input ref={fileRef} type="file" accept=".pdf,.md,application/pdf,text/markdown" onChange={pick} style={{ display: "none" }} />
    </div>
  </div>;
}

// スワイプくん・思考整理くんを題名で探して 1 つ選ぶ（コンテンツくんの右の検索と同じ読み方）
function OtherPicker({ kind, onPick, onClose }) {
  const [q, setQ] = useState("");
  const [d, setD] = useState(null);
  useEffect(() => { let live = true; loadOthers().then(x => { if (live) setD(x); }); return () => { live = false; }; }, []);
  const res = d ? findAll(q, [], d, 20) : null;
  const rows = res ? (kind === "swipe" ? res.S : res.M) : [];
  const err = d && (kind === "swipe" ? d.swErr : d.mmErr);
  return <div style={{ border: "1px solid #a39a90", borderRadius: 10, background: "#fff", marginBottom: 6, overflow: "hidden" }} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
    <div style={{ display: "flex", gap: 6, padding: 8, borderBottom: "1px solid #e6dfd6" }}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={kind === "swipe" ? "スワイプくんを題名・言葉で探す" : "思考整理くんのマップを題名で探す"} aria-label="探す言葉" style={{ ...fld, flex: 1 }} />
      <button type="button" onClick={onClose} style={sb}>閉じる</button>
    </div>
    <div style={{ maxHeight: 240, overflowY: "auto" }}>
      {!d && <div style={{ padding: 10, fontSize: 12.5, color: "#736a62" }}>読み込んでいます…</div>}
      {err && <div style={{ padding: 10, fontSize: 12.5, color: "#b91c1c" }}>読めませんでした：{err}</div>}
      {d && !err && !rows.length && <div style={{ padding: 10, fontSize: 12.5, color: "#736a62" }}>当てはまるものがありません</div>}
      {rows.map(r => <button key={r.id} type="button" onClick={() => onPick(r)} style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid #f1ebe4", background: "#fff", padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
        {r.sub && <div style={{ fontSize: 12, color: "#736a62", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</div>}
      </button>)}
    </div>
  </div>;
}

// ── 書く画面：資料を見る・チェックを付ける ─────────────────────
export function MaterialsView({ slot, slotName, checks = {}, onToggle, tplName, onOpenTpl }) {
  const ms = slot?.materials || [];
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ fontSize: 12, color: "#6b6259" }}>枠：{slotName}（直すときは 上の帯の「配信計画」→ この枠）</div>
    {(slot?.genre || tplName || slot?.aim) && <div style={{ background: "#fff", border: "1px solid #e6dfd6", borderRadius: 10, padding: "8px 10px", fontSize: 13, display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px" }}>
      {slot?.genre && <><span style={{ color: "#736a62", fontSize: 12, fontWeight: 700 }}>柱</span><span>{slot.genre}</span></>}
      {tplName && <><span style={{ color: "#736a62", fontSize: 12, fontWeight: 700 }}>型</span><span>{tplName}{onOpenTpl && <button type="button" onClick={onOpenTpl} style={{ ...sb, marginLeft: 6, padding: "1px 7px" }}>型を開く →</button>}</span></>}
      {slot?.aim && <><span style={{ color: "#736a62", fontSize: 12, fontWeight: 700 }}>狙い</span><span>{slot.aim}</span></>}
    </div>}
    {ms.map(m => m.kind === "check" ? <CheckBlock key={m.id} m={m} checks={checks} onToggle={onToggle} />
      : m.kind === "md" ? <MdBlock key={m.id} m={m} />
      : <a key={m.id} href={safeUrl(m.url) || undefined} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 8, background: "#fff", border: "1px solid #e6dfd6", fontSize: 13, color: "#1a1a1a", textDecoration: "none" }}>
          <Mark kind={m.kind} /><span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span><span style={{ fontSize: 12, color: "#736a62", fontWeight: 700, flex: "none" }}>別タブで開く ↗</span></a>)}
  </div>;
}

function CheckBlock({ m, checks, onToggle }) {
  const items = m.items || [];
  const done = items.filter(i => checks[i.id]).length;
  const left = items.length - done;
  return <div>
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: "#3d3530" }}><Mark kind="check" />{m.label}<span style={{ marginLeft: "auto", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{done}/{items.length}</span></div>
    <div aria-hidden style={{ height: 6, borderRadius: 99, background: "#e6dfd6", overflow: "hidden", margin: "6px 0" }}><i style={{ display: "block", height: "100%", width: `${items.length ? (done / items.length) * 100 : 0}%`, background: "#047857" }} /></div>
    {left > 0 ? <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "5px 8px", marginBottom: 4 }}>まだ {left} つ残っています</div>
      : <div style={{ fontSize: 12, color: "#047857", fontWeight: 700, marginBottom: 4 }}>✓ ぜんぶ済み</div>}
    {items.map(it => { const on = !!checks[it.id]; return <label key={it.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "6px 4px", borderBottom: "1px solid #f1ebe4", cursor: "pointer", fontSize: 13 }}>
      <input type="checkbox" checked={on} onChange={() => onToggle(it.id)} style={{ width: 17, height: 17, marginTop: 2, accentColor: "#047857", flex: "none" }} />
      <span style={{ color: on ? "#736a62" : "#1a1a1a", textDecoration: on ? "line-through" : "none" }}>{it.text}</span></label>; })}
  </div>;
}

// MD は字として読み、見出し・箇条書き・番号・チェック・太字だけを形にする（HTML は通さない）
function MdBlock({ m }) {
  const [txt, setTxt] = useState(null);
  const [open, setOpen] = useState(true);
  useEffect(() => { let dead = false; const u = safeUrl(m.url); if (!u) { setTxt(""); return; } fetch(u).then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))).then(t => { if (!dead) setTxt(t); }).catch(() => { if (!dead) setTxt(false); }); return () => { dead = true; }; }, [m.url]);
  return <div>
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", border: "none", background: "none", padding: 0, fontSize: 12.5, fontWeight: 800, color: "#3d3530", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <Mark kind="md" /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span><span style={{ fontSize: 12, color: "#736a62" }}>{open ? "たたむ ▲" : "詳細 ▼"}</span></button>
    {open && <div style={{ background: "#fff", border: "1px solid #e6dfd6", borderRadius: 10, padding: "8px 12px", marginTop: 6, fontSize: 13, lineHeight: 1.7, maxHeight: 420, overflowY: "auto" }}>
      {txt === null ? <span style={{ color: "#736a62" }}>読み込んでいます…</span> : txt === false ? <span style={{ color: "#b91c1c" }}>読めませんでした。<a href={safeUrl(m.url)} target="_blank" rel="noreferrer">別タブで開く ↗</a></span> : <Md text={txt} />}
    </div>}
  </div>;
}

function inline(s) {
  const out = []; let rest = s, k = 0;
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;
  while (rest) {
    const mm = rest.match(re);
    if (!mm) { out.push(rest); break; }
    if (mm.index) out.push(rest.slice(0, mm.index));
    if (mm[1]) out.push(<b key={k++}>{mm[1]}</b>);
    else if (mm[2]) out.push(<code key={k++} style={{ background: "#f7f3ee", borderRadius: 4, padding: "0 4px" }}>{mm[2]}</code>);
    else out.push(<a key={k++} href={mm[4]} target="_blank" rel="noreferrer">{mm[3]}</a>);
    rest = rest.slice(mm.index + mm[0].length);
  }
  return out;
}
function Md({ text }) {
  return <>{String(text).replace(/\r/g, "").split("\n").map((l, i) => {
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) return <div key={i} style={{ fontWeight: 800, fontSize: h[1].length === 1 ? 15 : 14, margin: "8px 0 2px" }}>{inline(h[2])}</div>;
    const c = l.match(/^(\s*)[-*]\s+\[( |x)\]\s+(.*)$/i);
    if (c) return <div key={i} style={{ paddingLeft: c[1].length * 8 }}>{c[2].toLowerCase() === "x" ? "☑" : "☐"} {inline(c[3])}</div>;
    const b = l.match(/^(\s*)(?:[-*・]|(\d+)[.)])\s+(.*)$/);
    if (b) return <div key={i} style={{ paddingLeft: 6 + b[1].length * 8, display: "flex", gap: 6 }}><span style={{ color: "#736a62", flex: "none" }}>{b[2] ? `${b[2]}.` : "•"}</span><span>{inline(b[3])}</span></div>;
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) return <hr key={i} style={{ border: 0, borderTop: "1px solid #e6dfd6", margin: "6px 0" }} />;
    if (!l.trim()) return <div key={i} style={{ height: 6 }} />;
    return <div key={i}>{inline(l)}</div>;
  })}</>;
}
