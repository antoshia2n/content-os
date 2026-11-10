// 書く画面の右の「依頼」タブ（2026-11-10 Naoki「初稿はチェックで起動して欲しい」→ 作る前の 1 枚に OK 13:20）
// 作るものにチェックを入れて「依頼する」→ ChatGPT の予定タスクが 1 時間以内に初稿を作り、確認待ちにする。仕上げは GPT のチャットで
import React, { useCallback, useEffect, useRef, useState } from "react";
import { dbFetchRequests, dbAddRequest, dbUpdateRequest } from "../lib/supabase.js";
import { REQUEST_KINDS, REQUEST_KIND_LABEL, REQUEST_STATUS, MEDIA_LABEL, mediaOf, pickRequestTemplate, requestPromptText, chatgptUrl, statusLabel, scheduleBlock } from "../lib/requests.js";
import { threadParts, xLen } from "../lib/xtext.js";
import { XPreview } from "./XPreview.jsx";
import { auth } from "../firebase.js";

// 予約（Buffer）を今すぐ試す。引用元がまだなら「引用元待ち」で返る
export async function callSchedule(requestId, extra = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインを確認できませんでした。開き直してください");
  const token = await user.getIdToken();
  const res = await fetch("/api/buffer-schedule", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ request_id: requestId, ...extra }) });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.error || `予約できませんでした（${res.status}）`);
  return data;
}
import { stripHtml } from "../constants.js";

const ACTIVE = ["queued", "drafting", "review", "waiting"];
const sb = { border: "1px solid #d4cbbf", background: "#fff", borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 700, color: "#3d3530", cursor: "pointer", fontFamily: "inherit" };
const hm = s => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function StatusChip({ status, kind }) {
  const s = REQUEST_STATUS[status] || REQUEST_STATUS.queued;
  return <span style={{ fontSize: 11, fontWeight: 800, color: s.color, background: s.bg, borderRadius: 99, padding: "2px 8px", whiteSpace: "nowrap" }}>{statusLabel({ status, kind })}</span>;
}

export function RequestCard({ r, uid, post, templates, onChange, onThumb, toast, showPost, posts }) {
  const isSch = r.kind === "schedule";
  const src = isSch && r.quote_post_id ? (posts || []).find(p => String(p.id) === String(r.quote_post_id)) : null;
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
          {showPost && post ? `${post.title || "（無題）"} · ` : ""}{isSch ? "予約（Buffer）" : (REQUEST_KIND_LABEL[r.kind] || r.kind)}<span style={{ fontWeight: 600, color: "#8a8076", fontSize: 11.5 }}> · {isSch ? (post?.datetime ? post.datetime.replace("T", " ").slice(5) : "") : (MEDIA_LABEL[r.media] || "")}</span>
        </button>
        <StatusChip status={r.status} kind={r.kind} />
      </div>
      <div style={{ fontSize: 11.5, color: "#8a8076", marginTop: 2 }}>{hm(r.created_at)} 依頼 · {isSch ? (src ? `引用元：${src.title || "（無題）"}` : "Buffer へ") : `型：${tpl ? tpl.name : "なし"}`}{r.updated_at && r.status !== "queued" ? ` · ${hm(r.updated_at)} 更新` : ""}</div>
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
        {isSch && Array.isArray(r.texts) && <XPreview parts={r.texts} quote={src} />}
        {isSch && r.status === "waiting" && <div style={{ fontSize: 12, color: "#736a62" }}>引用元が X に出たら、30 分ごとの見回りが Buffer に入れます。</div>}
        {isSch && r.status === "done" && <div style={{ fontSize: 12, color: "#736a62" }}>Buffer に入りました。日時になると X に出ます。直したいときは「予約を取り消す」→ 直して → もう一度チェック。</div>}
        {isSch && r.status === "queued" && <div style={{ fontSize: 12, color: "#736a62" }}>30 分ごとの見回りで Buffer に入れます。</div>}
        {!isSch && r.status === "queued" && <div style={{ fontSize: 12, color: "#736a62" }}>次の毎時 0 分に ChatGPT が初稿を作ります。急ぐときは下の「今すぐ GPT で作る」。</div>}
        {r.status === "review" && <div style={{ fontSize: 12, color: "#736a62" }}>仕上げは、通知の届いた ChatGPT のチャットで。「OK」と言うと、GPT が仕上げた版をここへ入れて格納済みにします。</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {r.result_text && <button onClick={copy} style={sb}>初稿をコピー</button>}
          {!isSch && r.status !== "done" && r.status !== "cancelled" && <button onClick={gpt} style={{ ...sb, color: "#047857", borderColor: "#6ee7b7" }}>今すぐ GPT で作る ↗</button>}
          {r.status === "review" && <button onClick={() => upd({ status: "done" })} style={sb}>格納済みにする</button>}
          {isSch && ["queued", "waiting"].includes(r.status) && <button onClick={async () => { try { const d = await callSchedule(r.id); toast && toast(d.state === "done" ? "Buffer に入れました" : "引用元がまだ X に出ていません。出たら自動で入れます"); upd({}); } catch (e) { toast && toast(e.message); } }} style={sb}>今すぐ試す</button>}
          {(ACTIVE.includes(r.status) || (isSch && r.status === "done")) && <button onClick={async () => {
            if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return; }
            if (!isSch) return upd({ status: "cancelled" });
            try { await callSchedule(r.id, { cancel: true }); toast && toast(r.status === "done" ? "Buffer から外しました" : "予約の依頼を取り消しました"); upd({}); } catch (e) { toast && toast(e.message); }
          }} style={{ ...sb, color: "#b91c1c" }}>{armed ? "もう一度押すと取り消す" : isSch && r.status === "done" ? "予約を取り消す" : "取り消す"}</button>}
          {!isSch && r.status === "cancelled" && <button onClick={() => upd({ status: "queued" })} style={sb}>依頼し直す</button>}
        </div>
      </div>}
    </div>
  );
}

export function RequestTab({ uid, draft, setDraft, saved, templates, postTypes, toast, onManageTemplates, allPosts = [] }) {
  const [rows, setRows] = useState(null);
  const [checks, setChecks] = useState({});
  const [inst, setInst] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [quoteOf, setQuoteOf] = useState("");
  const postId = draft?.id;
  const media = mediaOf(draft?.postType);
  const load = useCallback(async () => {
    if (!uid || postId == null || !saved) { setRows([]); return; }
    try { setRows(await dbFetchRequests(uid, { postId })); setErr(""); }
    catch (e) { setRows([]); setErr(/content_requests|relation|schema/i.test(e.message || "") ? "依頼の置き場はまだ準備中です" : (e.message || "読めませんでした")); }
  }, [uid, postId, saved]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  const active = new Set((rows || []).filter(r => ACTIVE.includes(r.status) || (r.kind === "schedule" && r.status === "done")).map(r => r.kind));
  const isQuote = draft?.postType === "x_quote";
  const parts = threadParts(draft?.body || "");
  const schBlock = scheduleBlock(draft || {}, parts, { xLen }) || (isQuote && !quoteOf ? "引用元を選んでください" : "");
  const [showPrev, setShowPrev] = useState(true);
  // 引用元の候補：この投稿より前の日時の投稿（新しい順に 30 件）
  const sources = (allPosts || []).filter(p => p.id !== postId && p.datetime && (!draft?.datetime || p.datetime < draft.datetime) && ["x_post", "x_article", "x_quote"].includes(p.postType)).sort((a, b) => (a.datetime < b.datetime ? 1 : -1)).slice(0, 30);
  const schedule = async () => {
    if (schBlock || busy) return;
    setBusy(true); setErr("");
    try {
      const row = await dbAddRequest(uid, { post_id: postId, account_id: draft.account_id || null, kind: "schedule", media: "x_post", instruction: "", texts: parts.map(p => ({ text: p.text, images: p.images })), ...(isQuote ? { quote_post_id: Number(quoteOf) } : {}) });
      put(row);
      // 予約した投稿は「予約済み」にしておく（あとで保存したときに、見回りが付けた状態を古い状態で上書きしないため）
      setDraft(d => ({ ...d, status: "reserved" }));
      try {
        const d = await callSchedule(row.id);
        if (d.buffer_post_id) setDraft(x => ({ ...x, buffer_post_id: d.buffer_post_id }));
        toast && toast(d.state === "done" ? "Buffer に入れました" : "引用元待ちにしました。引用元が X に出たら自動で入れます");
      } catch (e) { toast && toast(`依頼は残しました。見回りで入れ直します（${e.message}）`); }
      setRows(await dbFetchRequests(uid, { postId }));
    } catch (e) { setErr(/schedule|check constraint|texts|quote_post_id/i.test(e.message || "") ? "予約の置き場はまだ準備中です" : (e.message || "予約できませんでした")); }
    finally { setBusy(false); }
  };
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
  const sorted = (rows || []).slice().sort((a, b) => { const o = s => ({ review: 0, drafting: 1, waiting: 2, queued: 3, done: 4, cancelled: 5 }[s] ?? 6); return o(a.status) - o(b.status) || (a.created_at < b.created_at ? 1 : -1); });
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
      <div style={{ border: "1px solid #e7e0d8", borderRadius: 10, padding: "10px 11px", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b6259" }}>出す <span style={{ fontWeight: 600, color: "#8a8076" }}>· Buffer（X @antoshia2n）{draft?.datetime ? ` · ${draft.datetime.replace("T", " ")}` : ""}</span></div>
        {isQuote && !active.has("schedule") && <select value={quoteOf} onChange={e => setQuoteOf(e.target.value)} aria-label="引用元" style={{ border: "1px solid #a39a90", borderRadius: 8, padding: "6px 8px", fontSize: 12.5, fontFamily: "inherit", background: "#fff" }}>
          <option value="">引用元を選ぶ（この投稿より前）</option>
          {sources.map(p => <option key={p.id} value={p.id}>{p.datetime.replace("T", " ").slice(5)} {p.title || "（無題）"}</option>)}
        </select>}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: active.has("schedule") || schBlock ? "#a39a90" : "#1a1a1a", cursor: active.has("schedule") || schBlock ? "default" : "pointer" }}>
          <input type="checkbox" checked={active.has("schedule")} disabled={active.has("schedule") || !!schBlock || busy} onChange={e => { if (e.target.checked) schedule(); }} style={{ accentColor: "#0ea5e9", width: 15, height: 15 }} />
          <span style={{ fontWeight: 700 }}>予約する</span>
          <span style={{ fontSize: 11.5, color: "#8a8076", marginLeft: "auto" }}>{active.has("schedule") ? "依頼中" : isQuote ? "引用元が出たら自動で" : "すぐ Buffer へ"}</span>
        </label>
        {!active.has("schedule") && schBlock && <div style={{ fontSize: 12, color: "#8a8076" }}>{schBlock}</div>}
        {!active.has("schedule") && !schBlock && <div style={{ fontSize: 11.5, color: "#8a8076" }}>チェックすると本物の X 予約になります（{parts.length > 1 ? `スレッド ${parts.length} 本` : "1 本"}{parts.some(p => p.images.length) ? "・画像つき" : ""}）。</div>}
        {!active.has("schedule") && !!parts.length && <>
          <button onClick={() => setShowPrev(v => !v)} aria-expanded={showPrev} style={{ alignSelf: "flex-start", border: "none", background: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "#6b6259", cursor: "pointer", fontFamily: "inherit" }}>{showPrev ? "▾" : "▸"} X での見え方</button>
          {showPrev && <XPreview parts={parts} quote={isQuote ? (allPosts || []).find(p => String(p.id) === String(quoteOf)) : null} />}
        </>}
      </div>
      {err && <div role="alert" style={{ fontSize: 12, color: "#b91c1c" }}>{err}</div>}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#6b6259" }}>この投稿の依頼 {rows ? rows.length : ""}</span>
        <button onClick={load} style={{ ...sb, border: "none", marginLeft: "auto", color: "#736a62", fontWeight: 600 }}>最新にする</button>
      </div>
      {rows === null ? <div style={{ fontSize: 12, color: "#8a8076" }}>読み込み中…</div>
        : !sorted.length ? <div style={{ fontSize: 12.5, color: "#8a8076", lineHeight: 1.7 }}>まだ依頼はありません。上でチェックを入れて「依頼する」。</div>
        : sorted.map(r => <RequestCard key={r.id} r={r} uid={uid} post={draft} posts={allPosts} templates={templates} onChange={put} toast={toast} onThumb={url => { setDraft(d => ({ ...d, thumb: url })); toast && toast("サムネにしました（保存で残ります）"); }} />)}
    </div>
  );
}
