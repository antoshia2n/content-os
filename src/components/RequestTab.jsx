// 書く画面の右の「依頼」タブ（2026-11-10 Naoki「初稿はチェックで起動して欲しい」→ 作る前の 1 枚に OK 13:20）
// 作るものにチェックを入れて「依頼する」→ ChatGPT の予定タスクが 1 時間以内に初稿を作り、確認待ちにする。仕上げは GPT のチャットで
import React, { useCallback, useEffect, useRef, useState } from "react";
import { dbFetchRequests, dbAddRequest, dbUpdateRequest } from "../lib/supabase.js";
import { REQUEST_KINDS, REQUEST_KIND_LABEL, REQUEST_STATUS, MEDIA_LABEL, mediaOf, pickRequestTemplate, requestPromptText, requestShortPrompt, chatgptUrl, statusLabel, scheduleBlock } from "../lib/requests.js";
import { threadParts, xLen } from "../lib/xtext.js";
import { XPreview } from "./XPreview.jsx";
import { RefPicker, RefChips } from "./RefPicker.jsx";
import { REF_MAX, REF_LABEL, refKey, normPending, resolveRefs, toggleIn, toggleExcl } from "../lib/refs.js";
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
  return <span style={{ fontSize: 12, fontWeight: 800, color: s.color, background: s.bg, borderRadius: 99, padding: "2px 8px", whiteSpace: "nowrap" }}>{statusLabel({ status, kind })}</span>;
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
    navigator.clipboard?.writeText(text).then(() => toast && toast("依頼の全文もコピーしました（GPT が依頼を読めないときは貼ってください）")).catch(() => {});
    window.open(chatgptUrl(requestShortPrompt({ id: r.id, title: post?.title })), "_blank", "noopener");
  };
  const copy = () => navigator.clipboard?.writeText(r.result_text || "").then(() => toast && toast("初稿をコピーしました"));
  return (
    <div style={{ border: `1px solid ${r.status === "review" ? "#fcd34d" : "#e7e0d8"}`, borderRadius: 10, padding: "9px 11px", background: r.status === "cancelled" ? "#faf8f5" : "#fff", opacity: r.status === "cancelled" ? .7 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ border: "none", background: "none", padding: 0, fontSize: 13, fontWeight: 800, color: "#1a1a1a", cursor: "pointer", fontFamily: "inherit", textAlign: "left", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {showPost && post ? `${post.title || "（無題）"} · ` : ""}{isSch ? "予約（Buffer）" : (REQUEST_KIND_LABEL[r.kind] || r.kind)}<span style={{ fontWeight: 600, color: "#6b6259", fontSize: 12 }}> · {isSch ? (post?.datetime ? post.datetime.replace("T", " ").slice(5) : "") : (MEDIA_LABEL[r.media] || "")}</span>
        </button>
        <StatusChip status={r.status} kind={r.kind} />
      </div>
      <div style={{ fontSize: 12, color: "#6b6259", marginTop: 2 }}>{hm(r.created_at)} 依頼 · {isSch ? (src ? `引用元：${src.title || "（無題）"}` : "Buffer へ") : `パターン：${tpl ? tpl.name : "なし"}`}{r.updated_at && r.status !== "queued" ? ` · ${hm(r.updated_at)} 更新` : ""}</div>
      {open && <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 7 }}>
        {r.instruction && <div style={{ fontSize: 12.5, color: "#4b4038", background: "#faf8f5", borderRadius: 6, padding: "5px 8px" }}>指示：{r.instruction}</div>}
        {Array.isArray(r.refs) && r.refs.length > 0 && <div><div style={{ fontSize: 12, color: "#6b6259", marginBottom: 4 }}>GPT に渡した参考</div><RefChips refs={r.refs} /></div>}
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

export function RequestTab({ mode = "make", uid, draft, setDraft, saved, templates, postTypes, toast, onManageTemplates, allPosts = [], refs: pendingRaw = null, setRefs }) {
  const [pickOpen, setPickOpen] = useState(null); // どこに足す欄を開いているか（'all' か作るもの）
  const [tplChoice, setTplChoice] = useState({}); // 作るものごとに選んだ型（パターン）の番号。空なら自動で合うもの
  const [detail, setDetail] = useState(null); // 1 段奥で開いている作るもの
  const [instOpen, setInstOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const pending = normPending(pendingRaw);
  // 作るものごとの型（パターン）：その作るもの用の型を並べ、投稿の種類が合うものを先に
  const patternsOf = k => (templates || []).filter(t => t.kind === "request" && !t.replaces_id && (t.make === k || !t.make) && (!t.post_type || t.post_type === draft?.postType)).sort((a, b) => ((b.make === k) - (a.make === k)) || ((b.post_type === draft?.postType) - (a.post_type === draft?.postType)) || a.sort_order - b.sort_order);
  const tplFor = k => { const c = tplChoice[k]; if (c === "none") return null; if (c) return (templates || []).find(t => t.id === c) || null; return pickRequestTemplate(templates, k, draft?.postType); };
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
  // 引用元の候補：この投稿より前の日時の投稿（新しい順に 30 件）
  const sources = (allPosts || []).filter(p => p.id !== postId && p.datetime && (!draft?.datetime || p.datetime < draft.datetime) && ["x_post", "x_article", "x_quote"].includes(p.postType)).sort((a, b) => (a.datetime < b.datetime ? 1 : -1)).slice(0, 30);
  const schedule = async () => {
    if (schBlock || busy) return;
    setBusy(true); setErr("");
    try {
      const row = await dbAddRequest(uid, { post_id: postId, account_id: draft.account_id || null, kind: "schedule", media: "x_post", instruction: "", texts: parts.map(p => ({ text: p.text, images: p.images })), ...(isQuote ? { quote_post_id: Number(quoteOf) } : {}) });
      put(row); setHistOpen(true);
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
        const tpl = tplFor(k);
        put(await dbAddRequest(uid, { post_id: postId, account_id: draft.account_id || null, kind: k, media, template_id: tpl ? tpl.id : null, instruction: inst.trim(), refs: resolveRefs(pending, k, tpl?.refs) }));
      }
      setChecks({}); setInst(""); setInstOpen(false); setHistOpen(true); setPickOpen(null); setRefs && setRefs(p => { const n = normPending(p); const out = { ...n, excl: { ...n.excl } }; for (const k of picked) { delete out[k]; delete out.excl[k]; } return out; });
      toast && toast(`${picked.length} 件を依頼しました。1 時間以内に初稿が届きます`);
    } catch (e) { setErr(e.message || "依頼できませんでした"); }
    finally { setBusy(false); }
  };
  if (!saved) return <div style={{ fontSize: 12.5, color: "#6b6259", lineHeight: 1.7 }}>{mode === "ship" ? "予約" : "依頼"}は、この投稿を一度保存してから使えます。</div>;
  const order = s => ({ review: 0, drafting: 1, waiting: 2, queued: 3, done: 4, cancelled: 5 }[s] ?? 6);
  const mine = (rows || []).filter(r => (mode === "ship") === (r.kind === "schedule"));
  const sorted = mine.slice().sort((a, b) => order(a.status) - order(b.status) || (a.created_at < b.created_at ? 1 : -1));
  const nReview = mine.filter(r => r.status === "review").length;
  const History = () => <div style={{ borderTop: "1px solid #eee7df", paddingTop: 8 }}>
    <button onClick={() => setHistOpen(o => !o)} aria-expanded={histOpen} style={{ width: "100%", display: "flex", alignItems: "center", border: "none", background: "none", padding: "4px 0", minHeight: 32, fontSize: 12.5, fontWeight: 700, color: "#3d3530", cursor: "pointer", fontFamily: "inherit" }}>
      この投稿の{mode === "ship" ? "予約" : "依頼"} {rows ? mine.length : "…"}{nReview ? `（確認待ち ${nReview}）` : ""}<span style={{ marginLeft: "auto", color: "#6b6259" }}>{histOpen ? "▾" : "▸"}</span>
    </button>
    {histOpen && <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      <button onClick={load} style={{ ...sb, alignSelf: "flex-end", border: "none", color: "#6b6259", fontWeight: 600 }}>最新にする</button>
      {rows === null ? <div style={{ fontSize: 12, color: "#6b6259" }}>読み込み中…</div>
        : !sorted.length ? <div style={{ fontSize: 12.5, color: "#6b6259" }}>まだありません</div>
        : sorted.map(r => <RequestCard key={r.id} r={r} uid={uid} post={draft} posts={allPosts} templates={templates} onChange={put} toast={toast} onThumb={url => { setDraft(d => ({ ...d, thumb: url })); toast && toast("サムネにしました（保存で残ります）"); }} />)}
    </div>}
  </div>;

  // ── 出す（予約・X での見え方） ──
  if (mode === "ship") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12.5, color: "#3d3530" }}>Buffer（X @antoshia2n）{draft?.datetime ? ` · ${draft.datetime.replace("T", " ")}` : ""}</div>
      {isQuote && !active.has("schedule") && <select value={quoteOf} onChange={e => setQuoteOf(e.target.value)} aria-label="引用元" style={{ border: "1px solid #a39a90", borderRadius: 8, padding: "6px 8px", minHeight: 36, fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
        <option value="">引用元を選ぶ（この投稿より前）</option>
        {sources.map(p => <option key={p.id} value={p.id}>{p.datetime.replace("T", " ").slice(5)} {p.title || "（無題）"}</option>)}
      </select>}
      {!!parts.length && <XPreview parts={parts} quote={isQuote ? (allPosts || []).find(p => String(p.id) === String(quoteOf)) : null} />}
      {!active.has("schedule") && schBlock && <div style={{ fontSize: 12.5, color: "#92400e" }}>{schBlock}</div>}
      {active.has("schedule")
        ? <div style={{ fontSize: 12.5, color: "#047857", fontWeight: 700 }}>予約の依頼が入っています（下の一覧で状態を見られます）</div>
        : <button onClick={schedule} disabled={!!schBlock || busy} style={{ border: "none", borderRadius: 8, padding: "9px 14px", minHeight: 40, fontSize: 13.5, fontWeight: 800, fontFamily: "inherit", cursor: schBlock ? "default" : "pointer", background: schBlock ? "#eee7df" : "#0369a1", color: schBlock ? "#6b6259" : "#fff" }}>{busy ? "予約しています…" : isQuote ? "予約する（引用元が出たら自動で入る）" : `予約する（${parts.length > 1 ? `スレッド ${parts.length} 本` : "1 本"}${parts.some(p => p.images.length) ? "・画像つき" : ""}）`}</button>}
      {!active.has("schedule") && !schBlock && <div style={{ fontSize: 12, color: "#6b6259" }}>押すと本物の X 予約になります。取り消しは下の一覧から。</div>}
      {err && <div role="alert" style={{ fontSize: 12, color: "#b91c1c" }}>{err}</div>}
      <History />
    </div>
  );

  // ── 作る：1 段奥（1 つの依頼の設定） ──
  if (detail) {
    const k = detail, l = REQUEST_KIND_LABEL[k];
    const tpl = tplFor(k), pats = patternsOf(k);
    const tplRefs = Array.isArray(tpl?.refs) ? tpl.refs : [];
    const ex = new Set(pending.excl[k] || []);
    const own = pending[k] || [];
    const final = resolveRefs(pending, k, tplRefs);
    const curChoice = tplChoice[k] || (tpl ? tpl.id : "none");
    const RefRow = ({ r, tag, off, onX }) => <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #f0ebe5", opacity: off ? .55 : 1 }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: r.k === "map" ? "#5b21b6" : "#9a3412", minWidth: 44 }}>{REF_LABEL[r.k]}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: off ? "line-through" : "none" }}>{r.title}</span>
      <span style={{ fontSize: 12, color: "#6b6259" }}>{tag}</span>
      <button onClick={onX} aria-label={off ? `「${r.title}」を戻す` : `「${r.title}」を外す`} style={{ ...sb, border: "none", minWidth: 32, minHeight: 32, color: "#6b6259" }}>{off ? "戻す" : "×"}</button>
    </div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button onClick={() => { setDetail(null); setPickOpen(null); }} style={{ alignSelf: "flex-start", border: "none", background: "none", padding: "4px 0", minHeight: 32, fontSize: 14, fontWeight: 800, color: "#1a1a1a", cursor: "pointer", fontFamily: "inherit" }}>← {l}</button>
        <div role="radiogroup" aria-label={`${l}のパターン`}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6b6259", marginBottom: 6 }}>パターン</div>
          {[...pats.map(t => [t.id, t.name]), ["none", "型なし"]].map(([id, name]) => <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", minHeight: 36, marginBottom: 4, borderRadius: 8, border: `1px solid ${curChoice === id ? "#2563eb" : "#e7e0d8"}`, background: curChoice === id ? "#eff6ff" : "#fff", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" name={`pat-${k}`} checked={curChoice === id} onChange={() => setTplChoice(c => ({ ...c, [k]: id }))} />{name}
          </label>)}
          {onManageTemplates && <button onClick={onManageTemplates} style={{ ...sb, border: "none", color: "#6b6259", fontWeight: 600 }}>パターンを作る・直す</button>}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6b6259", marginBottom: 2 }}>参考（GPT に渡す {final.length}/{REF_MAX}）</div>
          {tplRefs.map(r => <RefRow key={"t" + refKey(r)} r={r} tag="型" off={ex.has(refKey(r))} onX={() => setRefs && setRefs(p => toggleExcl(p, k, r))} />)}
          {pending.all.map(r => <RefRow key={"a" + refKey(r)} r={r} tag="全部" onX={() => setRefs && setRefs(p => toggleIn(p, "all", r))} />)}
          {own.map(r => <RefRow key={"o" + refKey(r)} r={r} tag="今回" onX={() => setRefs && setRefs(p => toggleIn(p, k, r))} />)}
          {!tplRefs.length && !pending.all.length && !own.length && <div style={{ fontSize: 12.5, color: "#6b6259", padding: "6px 0" }}>まだありません。お手本のスワイプや考えの地図を付けると、GPT が初稿で使います。</div>}
          {setRefs && <button onClick={() => setPickOpen(o => o === k ? null : k)} aria-expanded={pickOpen === k} style={{ ...sb, border: "none", color: "#1d4ed8", padding: "8px 0", minHeight: 32 }}>{pickOpen === k ? "閉じる" : "＋ 参考を探す"}</button>}
          {pickOpen === k && setRefs && <RefPicker value={own} onChange={v => setRefs(p => ({ ...normPending(p), [k]: v }))} />}
        </div>
      </div>
    );
  }

  // ── 作る：一覧（ふだんの形） ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        {REQUEST_KINDS.map(([k, l]) => {
          const on = active.has(k);
          const tpl = tplFor(k);
          const n = resolveRefs(pending, k, Array.isArray(tpl?.refs) ? tpl.refs : []).length;
          const summary = on ? "依頼中" : [tpl ? tpl.name.replace(new RegExp(`^${l}[：:\\s]*`), "") : "型なし", n ? `参考${n}` : ""].filter(Boolean).join("・");
          return <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #f0ebe5", minHeight: 44 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 9, flex: "0 0 auto", cursor: on ? "default" : "pointer", minHeight: 44 }}>
              <input type="checkbox" disabled={on} checked={!!checks[k] && !on} onChange={e => setChecks(c => ({ ...c, [k]: e.target.checked }))} style={{ accentColor: "#f59e0b", width: 17, height: 17 }} />
              <span style={{ fontSize: 14, fontWeight: checks[k] && !on ? 800 : 600, color: on ? "#a39a90" : "#1a1a1a", whiteSpace: "nowrap" }}>{l}</span>
            </label>
            <button onClick={() => !on && setDetail(k)} disabled={on} aria-label={`${l}の設定（${summary}）`} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, border: "none", background: "none", minHeight: 44, cursor: on ? "default" : "pointer", fontFamily: "inherit", color: "#6b6259", fontSize: 12.5 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>{!on && <span aria-hidden="true" style={{ fontSize: 15 }}>›</span>}
            </button>
          </div>;
        })}
      </div>
      {instOpen
        ? <textarea autoFocus value={inst} onChange={e => setInst(e.target.value)} placeholder="比較の図にして／文字は少なめ" rows={2} aria-label="ひとこと指示" style={{ border: "1px solid #a39a90", borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", resize: "vertical", lineHeight: 1.6 }} />
        : <button onClick={() => setInstOpen(true)} style={{ ...sb, alignSelf: "flex-start", border: "none", color: "#6b6259", fontWeight: 600, padding: "4px 0" }}>＋ ひとこと指示</button>}
      <button onClick={send} disabled={!picked.length || busy} style={{ border: "none", borderRadius: 8, padding: "9px 14px", minHeight: 40, fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: picked.length ? "pointer" : "default", background: picked.length ? "#f59e0b" : "#eee7df", color: picked.length ? "#3b2300" : "#6b6259" }}>{busy ? "依頼しています…" : picked.length ? `${picked.length} 件を依頼する` : "作るものにチェック"}</button>
      {err && <div role="alert" style={{ fontSize: 12, color: "#b91c1c" }}>{err}</div>}
      <History />
    </div>
  );
}
