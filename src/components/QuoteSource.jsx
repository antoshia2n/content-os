// 引用元（2026-11-18 Naoki「引用元で X記事が選べない」→ 予約は一時停止・引用元は「詳細」で選んで投稿に残す形に OK 10:30）
// X 引用の投稿に「どの投稿を引用するか」を残す（posts.quote_of）。X で手で予約するときに、ここを見て引用元を探す。
// 候補はこの投稿より前（予定が無ければすべて）の X記事・Xポスト・X引用。種類で絞り、題名で探す。
import React, { useMemo, useState } from "react";
import { stripHtml } from "../constants.js";

const TYPES = [["x_article", "X記事"], ["x_post", "Xポスト"], ["x_quote", "X引用"]];
const headOf = p => (p.title || "").trim() || stripHtml(p.body || "").trim().slice(0, 60) || "（無題）";
const when = dt => (dt ? dt.replace("T", " ").slice(5, 16) : "日時なし");

export function QuoteSource({ draft, setDraft, allPosts = [], toast }) {
  const [kind, setKind] = useState("x_article");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(!draft.quote_of);
  const cur = useMemo(() => allPosts.find(p => String(p.id) === String(draft.quote_of)) || null, [allPosts, draft.quote_of]);
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return allPosts
      .filter(p => p.id !== draft.id && TYPES.some(([k]) => k === p.postType))
      .filter(p => kind === "all" || p.postType === kind)
      .filter(p => !draft.datetime || !p.datetime || p.datetime < draft.datetime)
      .filter(p => !qq || headOf(p).toLowerCase().includes(qq))
      .sort((a, b) => ((b.datetime || "") > (a.datetime || "") ? 1 : -1))
      .slice(0, 40);
  }, [allPosts, draft.id, draft.datetime, kind, q]);

  const pick = p => { setDraft(d => ({ ...d, quote_of: p ? p.id : null })); setOpen(!p); };
  const copy = async () => { try { await navigator.clipboard.writeText(headOf(cur)); toast && toast("題名をコピーしました"); } catch { toast && toast("コピーできませんでした"); } };
  const chip = on => ({ border: `1px solid ${on ? "#1a1a1a" : "#e6dfd6"}`, background: on ? "#1a1a1a" : "#fff", color: on ? "#fff" : "#3d3530", borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const sb = { border: "1px solid #e6dfd6", background: "#fff", borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#3d3530", textDecoration: "none" };

  return <div>
    <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6259", display: "block", marginBottom: 5 }}>引用元</span>
    {cur && <div style={{ border: "1px solid #7dd3fc", background: "#f0f9ff", borderRadius: 10, padding: "8px 10px", marginBottom: open ? 8 : 0 }}>
      <div style={{ fontSize: 12, color: "#075985", fontWeight: 700 }}>{TYPES.find(([k]) => k === cur.postType)?.[1] || "投稿"} · {when(cur.datetime)}</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, wordBreak: "break-word" }}>{headOf(cur)}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={copy} style={sb}>題名をコピー</button>
        {cur.x_url && <a href={cur.x_url} target="_blank" rel="noreferrer" style={sb}>X で開く ↗</a>}
        <button type="button" onClick={() => setOpen(o => !o)} style={sb} aria-expanded={open}>{open ? "閉じる" : "編集"}</button>
        <button type="button" onClick={() => pick(null)} style={{ ...sb, color: "#b91c1c" }}>削除</button>
      </div>
    </div>}
    {open && <div style={{ border: "1px solid #a39a90", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", gap: 6, padding: 8, borderBottom: "1px solid #e6dfd6", flexWrap: "wrap" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="題名で探す" aria-label="引用元を題名で探す"
          style={{ flex: "1 1 120px", minWidth: 0, border: "1px solid #a39a90", borderRadius: 8, padding: "5px 8px", fontSize: 13, fontFamily: "inherit" }} />
        <div role="radiogroup" aria-label="種類で絞る" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[["all", "すべて"], ...TYPES].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} style={chip(kind === k)}>{l}</button>)}
        </div>
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {!list.length && <div style={{ padding: 10, fontSize: 12.5, color: "#6b6259" }}>{draft.datetime ? "この投稿より前の予定に、当てはまる投稿がありません" : "当てはまる投稿がありません"}</div>}
        {list.map(p => <button key={p.id} type="button" onClick={() => pick(p)} aria-pressed={String(p.id) === String(draft.quote_of)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid #f1ebe4", background: String(p.id) === String(draft.quote_of) ? "#e0f2fe" : "#fff", padding: "7px 10px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ fontSize: 12, fontWeight: 800, borderRadius: 5, padding: "0 6px", flex: "none", background: p.postType === "x_article" ? "#dbeafe" : "#fef3c7", color: p.postType === "x_article" ? "#1d4ed8" : "#92400e" }}>{TYPES.find(([k]) => k === p.postType)?.[1]}</span>
          <span style={{ fontSize: 12, color: "#736a62", flex: "none", fontVariantNumeric: "tabular-nums" }}>{when(p.datetime)}</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headOf(p)}</span>
        </button>)}
      </div>
    </div>}
    <div style={{ fontSize: 12, color: "#736a62", marginTop: 6 }}>予約は一時停止中（Buffer の更新待ち）。X で手で予約するときに、ここで引用元を確かめる</div>
  </div>;
}
