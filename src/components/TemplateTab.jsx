// 書く画面の右の「型」タブ（2026-11-10 Naoki「テンプレや型管理を効率的に→プロンプトも一緒に管理、編集右のタブに出す」→ デモに OK 11:36）
// この投稿の種類で使える 本文・締め・メモ・プロンプト を並べ、その場で差し込む／コピーする。増やす・直すは「型の管理」（TemplatesModal）
import React, { useEffect, useRef, useState } from "react";
import { TEMPLATE_KINDS, insertIntoText, insertIntoBody, fillPrompt } from "../lib/templates.js";
import { stripHtml } from "../constants.js";

const KL = Object.fromEntries(TEMPLATE_KINDS);
const ACT = { body: "カーソルに差し込む", closing: "末尾に足す", memo: "メモに差し込む", prompt: "中身を入れてコピー" };

export function TemplateTab({ templates, postType, postTypes, bodyRef, memoRef, draft, setDraft, onManage, onEdit, toast }) {
  const [kind, setKind] = useState("all");
  const [done, setDone] = useState(null);
  // 本文のカーソルの位置を覚えておく（右の欄を押すと本文から外れるため）
  const range = useRef(null);
  useEffect(() => {
    const h = () => { const s = window.getSelection(); if (s && s.rangeCount) { const r = s.getRangeAt(0); if (bodyRef.current && bodyRef.current.contains(r.commonAncestorContainer)) range.current = r.cloneRange(); } };
    document.addEventListener("selectionchange", h);
    return () => document.removeEventListener("selectionchange", h);
  }, [bodyRef]);
  const list = (templates || []).filter(t => t.kind !== "request" && (!t.post_type || t.post_type === postType)).sort((a, b) => (a.kind === b.kind ? a.sort_order - b.sort_order : TEMPLATE_KINDS.findIndex(k => k[0] === a.kind) - TEMPLATE_KINDS.findIndex(k => k[0] === b.kind)));
  const shown = kind === "all" ? list : list.filter(t => t.kind === kind);
  const flash = (id, msg) => { setDone(id); setTimeout(() => setDone(d => (d === id ? null : d)), 1500); toast && toast(msg); };
  const use = t => {
    if (t.kind === "prompt") {
      const text = fillPrompt(t.content, { title: draft.title || "", body: stripHtml(draft.body || "").trim(), memo: draft.memo || "", type: postTypes[postType]?.label || postType });
      navigator.clipboard?.writeText(text).then(() => flash(t.id, "プロンプトをコピーしました"), () => toast && toast("コピーできませんでした"));
      return;
    }
    if (t.kind === "memo") {
      const el = memoRef.current, text = draft.memo || "";
      const s = el ? el.selectionStart : text.length, e = el ? el.selectionEnd : text.length;
      const r = insertIntoText(text, s, e, t.content);
      setDraft(d => ({ ...d, memo: r.text }));
      setTimeout(() => { const x = memoRef.current; if (x) { x.focus(); x.setSelectionRange(r.pos, r.pos); } }, 0);
      flash(t.id, "メモに差し込みました");
      return;
    }
    const html = insertIntoBody(bodyRef.current, range.current, t.content, t.kind === "closing");
    if (html != null) { setDraft(d => ({ ...d, body: html })); flash(t.id, t.kind === "closing" ? "末尾に足しました" : "差し込みました"); }
  };
  const chip = on => ({ border: `1px solid ${on ? "#fcd34d" : "#e6dfd6"}`, background: on ? "#fef3c7" : "#fff", color: on ? "#b45309" : "#6b6259", borderRadius: 99, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div role="group" aria-label="型の種類" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {[["all", "すべて"], ...TEMPLATE_KINDS].map(([k, l]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} style={chip(kind === k)}>{l}{k !== "all" && <span style={{ fontWeight: 600, marginLeft: 3, color: "#736a62" }}>{list.filter(t => t.kind === k).length}</span>}</button>)}
    </div>
    {shown.map(t => <div key={t.id} style={{ background: "#fff", border: "1px solid #e6dfd6", borderRadius: 10, padding: "9px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name || "（名前なし）"}</span><span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#736a62", flexShrink: 0 }}>{KL[t.kind]}</span></div>
      <div style={{ fontSize: 12, color: "#6b6259", lineHeight: 1.6, maxHeight: 58, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{t.content}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => use(t)} style={{ border: `1px solid ${done === t.id ? "#047857" : "#b45309"}`, background: done === t.id ? "#ecfdf5" : "#b45309", color: done === t.id ? "#047857" : "#fff", borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{done === t.id ? "✓ できました" : ACT[t.kind]}</button>
        {onEdit && <button type="button" onClick={() => onEdit(t)} style={{ border: "1px solid #e6dfd6", background: "#fff", borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 700, color: "#1a1a1a", cursor: "pointer", fontFamily: "inherit" }}>編集</button>}
      </div>
    </div>)}
    {!shown.length && <div style={{ fontSize: 12, color: "#736a62", lineHeight: 1.7, padding: "8px 2px" }}>この種類（{postTypes[postType]?.label || postType}）で使える{kind === "all" ? "型" : KL[kind]}はまだありません。</div>}
    {onManage && <button type="button" onClick={() => onManage()} style={{ alignSelf: "flex-start", ...chip(false) }}>型の管理へ移動 →</button>}
    <div style={{ fontSize: 12, color: "#736a62", lineHeight: 1.7 }}>プロンプトの {"{タイトル}{本文}{メモ}{種類}"} は、いま書いている中身に置き換えてコピーします。</div>
  </div>;
}
