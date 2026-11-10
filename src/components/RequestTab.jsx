// 書く画面の右の「依頼」タブ（2026-11-10 Naoki「初稿はチェックで起動して欲しい」→ 作る前の 1 枚に OK 13:20）
// 作るものにチェックを入れて「依頼する」→ ChatGPT の予定タスクが 1 時間以内に初稿を作り、確認待ちにする。仕上げは GPT のチャットで
import React, { useCallback, useEffect, useRef, useState } from "react";
import { dbFetchRequests, dbAddRequest, dbUpdateRequest } from "../lib/supabase.js";
import { REQUEST_KINDS, REQUEST_KIND_LABEL, REQUEST_STATUS, MEDIA_LABEL, mediaOf, pickRequestTemplate, requestPromptText, chatgptUrl } from "../lib/requests.js";
import { stripHtml } from "../constants.js";

const ACTIVE = ["queued", "drafting", "review"];
const sb = { border: "1px solid #d4cbbf", background: "#fff", borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 700, color: "#3d3530", cursor: "pointer", fontFamily: "inherit" };
const hm = s => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function StatusChip({ status }) {
  const s = REQUEST_STATUS[status] || REQUEST_STATUS.queued;
  return <span style={{ fontSize: 11, fontWeight: 800, color: s.color, background: s.bg, borderRadius: 99, padding: "2px 8px", whiteSpace: "nowrap" }}>{s.label}</span>;
}

export function RequestCard({ r, uid, post, templates, onChange, onThumb, toast, showPost }) {
  const [open, setOpen] = useState(r.status === "review");
  const [armed, setArmed] = useState(false);
  const tpl = (templates || []).find(t => t.id === r.template_id);
  const urls = Array.isArray(r.result_urls) ? r.result_urls : [];
  const upd = async f => { try { onChange(await dbUpdateRequest(uid, r.id, f)); } catch (e) { toast && toast(e.message || "保存できませんでした"); } };
  const gpt = () => {
    const text = requestPromptText({ make: r.kind, media: r.media, instruction: r.instruction, template: tpl, title: post?.title, bodyText: stripHtml(post?.body || "") });
    window.open(chatgptUrl(text), "_blank", "noopener");
  };
  const copy = () => navigator.clipboard?.writeText(r.result_text || "").then(() => toast && toast("初稿をコピーしました"));
  return (
    <div style={{ border: `1px solid ${r.status === "review" ? "#fcd34d" : "#e7e0d8"}`, borderRadius: 10, padding: "9px 11px", background: r.status === "cancelled" ? "#faf8f5" : "#fff", opacity: r.status === "cancelled" ? .7 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ border: "none", background: "none", padding: 0, fontSize: 13, fontWeight: 800, color: "#1a1a1a", cursor: "pointer", fontFamily: "inherit", textAlign: "left", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {showPost && post ? `${post.title || "（無題）"} · ` : ""}{REQUEST_KIND_LABEL[r.kind] || r.kind}<span style={{ fontWeight: 600, color: "#8a8076", fontSize: 11.5 }}> · {MEDIA_LABEL[r.media] || ""}</span>
        </button>
        <StatusChip status={r.status} />
      </div>
      <div style={{ fontSize: 11.5, color: "#8a8076", marginTop: 2 }}>{hm(r.created_at)} 依頼 · 型：{tpl ? tpl.name : "なし"}{r.updated_at && r.status !== "queued" ? ` · ${hm(r.updated_at)} 更新` : ""}</div>
      {open && <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 7 }}>
        {r.instruction && <div style={{ fontSize: 12.5, color: "#4b4038", background: "#faf8f5", borderRadius: 6, padding: "5px 8px" }}>指示：{r.instruction}</div>}
        {r.note && <div style={{ fontSize: 12.5, color: "#92400e", background: "#fffbeb", borderRadius: 6, padding: "5px 8px" }}>申し送り：{r.note}</div>}
        {r.result_text && <div style={{ fontSize: 12.5, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#1a1a1a", border: "1px solid #eee7df", borderRadius: 6, padding: "7px 9px", maxHeight: 220, overflowY: "auto" }}>{r.result_text}</div>}
        {!!urls.length && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {urls.map((u, i) => <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
            <a href={u.url} target="_blank" rel="noopener noreferrer" title={u.label || "画像を開く"}>
              {/\.(png|jpe?g|webp|gif)(\?|$)/i.test(u.url) ? <img src={u.url} alt={u.label || `${REQUEST_KIND_LABEL[r.kind]} ${i + 1}`} style={{ width: 108, height: 61, objectFit: "cover", borderRadius: 6, border: "1px solid #e7e0d8", display: "block" }} /> : <span style={{ fontSize: 12, color: "#1d4ed8" }}>住所を開く ↗</span>}
            </a>
            {r.kind === "thumbnail" && onThumb && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u.url) && <button onClick={() => onThumb(u.url)} style={{ ...sb, padding: "2px 7px", fontSize: 11 }}>サムネにする</button>}
          </div>)}
        </div>}
        {r.status === "queued" && <div style={{ fontSize: 12, color: "#736a62" }}>次の毎時 0 分に ChatGPT が初稿を作ります。急ぐときは下の「今すぐ GPT で作る」。</div>}
        {r.status === "review" && <div style={{ fontSize: 12, color: "#736a62" }}>仕上げは、通知の届いた ChatGPT のチャットで。「OK」と言うと、GPT が仕上げた版をここへ入れて格納済みにします。</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {r.result_text && <button onClick={copy} style={sb}>初稿をコピー</button>}
          {r.status !== "done" && r.status !== "cancelled" && <button onClick={gpt} style={{ ...sb, color: "#047857", borderColor: "#6ee7b7" }}>今すぐ GPT で作る ↗</button>}
          {r.status === "review" && <button onClick={() => upd({ status: "done" })} style={sb}>格納済みにする</button>}
          {ACTIVE.includes(r.status) && <button onClick={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return; } upd({ status: "cancelled" }); }} style={{ ...sb, color: "#b91c1c" }}>{armed ? "もう一度押すと取り消す" : "取り消す"}</button>}
          {r.status === "cancelled" && <button onClick={() => upd({ status: "queued" })} style={sb}>依頼し直す</button>}
        </div>
      </div>}
    </div>
  );
}

export function RequestTab({ uid, draft, setDraft, saved, templates, postTypes, toast, onManageTemplates }) {
  const [rows, setRows] = useState(null);
  const [checks, setChecks] = useState({});
  const [inst, setInst] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const postId = draft?.id;
  const media = mediaOf(draft?.postType);
  const load = useCallback(async () => {
    if (!uid || postId == null || !saved) { setRows([]); return; }
    try { setRows(await dbFetchRequests(uid, { postId })); setErr(""); }
    catch (e) { setRows([]); setErr(/content_requests|relation|schema/i.test(e.message || "") ? "依頼の置き場はまだ準備中です" : (e.message || "読めませんでした")); }
  }, [uid, postId, saved]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  const active = new Set((rows || []).filter(r => ACTIVE.includes(r.status)).map(r => r.kind));
  const picked = REQUEST_KINDS.filter(([k]) => checks[k] && !active.has(k)).map(([k]) => k);
  const put = row => setRows(rs => [row, ...(rs || []).filter(x => x.id !== row.id)]);
  const send = async () => {
    if (!picked.length || busy) return;
    setBusy(true); setErr("");
    try {
      for (const k of picked) {
        const tpl = pickRequestTemplate(templates, k, draft.postType);
        put(await dbAddRequest(uid, { post_id: postId, account_id: draft.account_id || null, kind: k, media, template_id: tpl ? tpl.id : null, instruction: inst.trim() }));
      }
      setChecks({}); setInst("");
      toast && toast(`${picked.length} 件を依頼しました。1 時間以内に初稿が届きます`);
    } catch (e) { setErr(e.message || "依頼できませんでした"); }
    finally { setBusy(false); }
  };
  if (!saved) return <div style={{ fontSize: 12.5, color: "#736a62", lineHeight: 1.7 }}>依頼は、この投稿を一度保存してから出せます。</div>;
  const sorted = (rows || []).slice().sort((a, b) => { const o = s => ({ review: 0, drafting: 1, queued: 2, done: 3, cancelled: 4 }[s] ?? 5); return o(a.status) - o(b.status) || (a.created_at < b.created_at ? 1 : -1); });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ border: "1px solid #e7e0d8", borderRadius: 10, padding: "10px 11px", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b6259" }}>作るもの <span style={{ fontWeight: 600, color: "#8a8076" }}>· 媒体：{MEDIA_LABEL[media]}（{postTypes?.[draft.postType]?.label || draft.postType}から）</span></div>
        {REQUEST_KINDS.map(([k, l]) => {
          const on = active.has(k);
          const tpl = pickRequestTemplate(templates, k, draft.postType);
          return <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: on ? "#a39a90" : "#1a1a1a", cursor: on ? "default" : "pointer" }}>
            <input type="checkbox" disabled={on} checked={!!checks[k] && !on} onChange={e => setChecks(c => ({ ...c, [k]: e.target.checked }))} style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
            <span style={{ fontWeight: 700 }}>{l}</span>
            <span style={{ fontSize: 11.5, color: "#8a8076", marginLeft: "auto", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>{on ? "依頼中" : tpl ? `型：${tpl.name}` : "型なし"}</span>
          </label>;
        })}
        <textarea value={inst} onChange={e => setInst(e.target.value)} placeholder="ひとこと指示（任意）例：比較の図にして／文字は少なめ" rows={2} aria-label="ひとこと指示" style={{ border: "1px solid #a39a90", borderRadius: 8, padding: "6px 9px", fontSize: 12.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.6 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={send} disabled={!picked.length || busy} style={{ border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: picked.length ? "pointer" : "default", background: picked.length ? "#f59e0b" : "#eee7df", color: picked.length ? "#fff" : "#a39a90" }}>{busy ? "依頼中…" : `依頼する${picked.length ? `（${picked.length}）` : ""}`}</button>
          {onManageTemplates && <button onClick={onManageTemplates} style={{ ...sb, border: "none", color: "#736a62", fontWeight: 600, marginLeft: "auto" }}>依頼の型を直す</button>}
        </div>
      </div>
      {err && <div role="alert" style={{ fontSize: 12, color: "#b91c1c" }}>{err}</div>}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#6b6259" }}>この投稿の依頼 {rows ? rows.length : ""}</span>
        <button onClick={load} style={{ ...sb, border: "none", marginLeft: "auto", color: "#736a62", fontWeight: 600 }}>最新にする</button>
      </div>
      {rows === null ? <div style={{ fontSize: 12, color: "#8a8076" }}>読み込み中…</div>
        : !sorted.length ? <div style={{ fontSize: 12.5, color: "#8a8076", lineHeight: 1.7 }}>まだ依頼はありません。上でチェックを入れて「依頼する」。</div>
        : sorted.map(r => <RequestCard key={r.id} r={r} uid={uid} post={draft} templates={templates} onChange={put} toast={toast} onThumb={url => { setDraft(d => ({ ...d, thumb: url })); toast && toast("サムネにしました（保存で残ります）"); }} />)}
    </div>
  );
}
