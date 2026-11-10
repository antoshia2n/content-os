// 依頼の一覧（2026-11-10・設定の「依頼の一覧」）。確認待ちを上に、投稿をまたいで並べる。題を押すとその投稿を開く
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BD, BD2 } from "../constants.js";
import { dbFetchRequests } from "../lib/supabase.js";
import { REQUEST_STATUS } from "../lib/requests.js";
import { RequestCard } from "../components/RequestTab.jsx";
import { RequestFlow, flowCounts } from "../components/RequestFlow.jsx";
import { useDialogFocus } from "../lib/useDialogFocus.js";

const ORDER = ["review", "drafting", "waiting", "queued", "done", "cancelled"];

export function RequestsModal({ uid, posts = [], templates = [], onOpen, onClose, showToast }) {
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("open");
  const [err, setErr] = useState("");
  const [flowOpen, setFlowOpen] = useState(() => { try { return localStorage.getItem("ck-req-flow") !== "0"; } catch { return true; } });
  const toggleFlow = () => setFlowOpen(o => { try { localStorage.setItem("ck-req-flow", o ? "0" : "1"); } catch { /* 覚えられなくても動く */ } return !o; });
  const box = useRef(null);
  useDialogFocus(box, { onClose });
  const load = useCallback(async () => {
    try { setRows(await dbFetchRequests(uid, { limit: 300 })); setErr(""); }
    catch (e) { setRows([]); setErr(/content_requests|relation|schema/i.test(e.message || "") ? "依頼の置き場はまだ準備中です" : (e.message || "読めませんでした")); }
  }, [uid]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  const byId = Object.fromEntries(posts.map(p => [String(p.id), p]));
  const all = (rows || []).slice().sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.created_at < b.created_at ? 1 : -1));
  const shown = tab === "open" ? all.filter(r => ["review", "drafting", "waiting", "queued"].includes(r.status)) : all.filter(r => ["done", "cancelled"].includes(r.status));
  const count = s => all.filter(r => r.status === s).length;
  const put = row => setRows(rs => (rs || []).map(x => (x.id === row.id ? row : x)));
  const tb = on => ({ border: "none", background: "none", padding: "8px 10px", fontSize: 13, fontWeight: 700, color: on ? "#1a1a1a" : "#6b6259", borderBottom: `2px solid ${on ? "#f59e0b" : "transparent"}`, marginBottom: -1, cursor: "pointer", fontFamily: "inherit" });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="req-title" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, height: "min(760px, calc(100vh - 28px))", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px #00000030" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: BD2 }}>
          <span id="req-title" style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>依頼の一覧</span>
          <span style={{ fontSize: 12, color: "#736a62" }}>{["review", "drafting", "waiting", "queued"].map(s => `${REQUEST_STATUS[s].label} ${count(s)}`).join(" · ")}</span>
          <button onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 12, fontWeight: 600, color: "#736a62", cursor: "pointer", fontFamily: "inherit" }}>最新にする</button>
          <button onClick={onClose} style={{ background: "none", border: BD, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#6b6259", cursor: "pointer" }}>閉じる</button>
        </div>
        <div role="tablist" style={{ display: "flex", gap: 2, padding: "4px 12px 0", borderBottom: BD2 }}>
          <button role="tab" aria-selected={tab === "open"} onClick={() => setTab("open")} style={tb(tab === "open")}>進行中</button>
          <button role="tab" aria-selected={tab === "closed"} onClick={() => setTab("closed")} style={tb(tab === "closed")}>済み</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8, background: "#faf8f5" }}>
          <div style={{ background: "#fff", border: "1px solid #e7e0d8", borderRadius: 10, padding: flowOpen ? "8px 10px" : "6px 10px" }}>
            <button onClick={toggleFlow} aria-expanded={flowOpen} style={{ border: "none", background: "none", padding: 0, fontSize: 12.5, fontWeight: 800, color: "#6b6259", cursor: "pointer", fontFamily: "inherit" }}>{flowOpen ? "▾" : "▸"} 流れ（丸の数字＝今そこにある件数）</button>
            {flowOpen && <RequestFlow counts={flowCounts((rows || []).filter(r => r.status !== "cancelled"))} />}
          </div>
          {err && <div role="alert" style={{ fontSize: 12.5, color: "#b91c1c" }}>{err}</div>}
          {rows === null ? <div style={{ fontSize: 12.5, color: "#6b6259" }}>読み込み中…</div>
            : !shown.length ? <div style={{ fontSize: 13, color: "#6b6259", lineHeight: 1.7 }}>{tab === "open" ? "進行中の依頼はありません。書く画面の右の「依頼」から出せます。" : "済んだ依頼はまだありません。"}</div>
            : shown.map(r => {
              const p = byId[String(r.post_id)];
              return <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <button onClick={() => p && onOpen(p)} disabled={!p} style={{ alignSelf: "flex-start", border: "none", background: "none", padding: 0, fontSize: 12, fontWeight: 700, color: p ? "#1d4ed8" : "#a39a90", cursor: p ? "pointer" : "default", fontFamily: "inherit" }}>{p ? `${p.title || "（無題）"} を開く` : "（投稿が見つかりません）"}</button>
                <RequestCard r={r} uid={uid} post={p} posts={posts} templates={templates} onChange={put} toast={showToast} />
              </div>;
            })}
        </div>
      </div>
    </div>
  );
}
