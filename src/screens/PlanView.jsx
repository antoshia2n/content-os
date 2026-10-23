// src/screens/PlanView.jsx
// 2026-10-23 作り直し 2便：カレンダーの「リスト」・横の「ネタの棚」・Buffer に入れる確認の窓。
// 週の表（App.jsx の週表示）と同じ週・同じ動き（ネタを空き枠へ置く／2 本の日時を入れ替える）を、縦の一覧で見せる。
// 編集画面（EditorModal）には触らない。行を押すと今の編集画面が開く。
import React, { useState, useMemo, useEffect, useRef } from "react";
import { getPostTypeStyle, STATUS, slotTime, stripHtml } from "../constants.js";
import { slotMatchesDate } from "./CalendarView.jsx";
import { auth } from "../firebase.js";

// Buffer の窓口があるアカウント（functions/api/buffer-schedule.js の CHANNELS と同じ）
export const BUFFER_ACCOUNTS = ["acc_1"];
const W = ["日", "月", "火", "水", "木", "金", "土"];
const OUT_ST = ["draft", "review", "waiting", "reserved", "published"];
const ST_COLOR = { idea: "var(--s-idea)", draft: "var(--s-draft)", review: "var(--s-review)", waiting: "var(--s-wait)", reserved: "var(--s-res)", published: "var(--s-pub)" };
const headOf = p => (p.title || "").trim() || (p.memo || "").trim().split("\n")[0] || stripHtml(p.body || "").trim().slice(0, 60);

export const PLAN_CSS = `
.ck-cal{display:flex;align-items:flex-start;min-height:calc(100vh - 100px)}
.ck-cal-main{flex:1;min-width:0}
.ck-tray{width:250px;flex:none;border-left:1px solid var(--line);background:var(--panel);position:sticky;top:0;align-self:flex-start;height:calc(100vh - 100px);overflow:auto;padding:12px 10px 40px}
.ck-tray.off{display:none}
.ck-tray-h{font-size:11px;font-weight:700;color:var(--faint);letter-spacing:.04em;padding:10px 6px 6px;display:flex;justify-content:space-between}
.ck-tray-note{font-size:11.5px;color:var(--faint);line-height:1.6;padding:0 6px 6px}
.ck-chip{display:flex;flex-direction:column;gap:4px;padding:8px 9px;border:1px solid var(--line);border-radius:9px;background:var(--panel);margin-bottom:6px;cursor:grab;text-align:left;width:100%}
.ck-chip:hover{border-color:var(--accent-line);background:var(--rowhover)}
.ck-chip.dragging{opacity:.4}
.ck-chip .t{font-size:12.5px;font-weight:600;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ck-chip .m{display:flex;gap:6px;align-items:center;font-size:11px;color:var(--faint)}
.ck-mini{font-size:11px;font-weight:700;color:var(--accent-ink);border:1px solid var(--accent-line);background:var(--accent-bg);border-radius:6px;padding:1px 7px;margin-left:auto;white-space:nowrap}
.ck-list{max-width:980px;margin:0 auto;padding:16px 16px 72px;display:flex;flex-direction:column;gap:14px}
.ck-day{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ck-day.today{border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft)}
.ck-dayh{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--hair);font-weight:800;font-size:14px}
.ck-dayh small{font-size:11.5px;color:var(--faint);font-weight:600}
.ck-dayh .n{margin-left:auto;font-size:11.5px;color:var(--faint);font-weight:600}
.ck-dayh .add{font-size:12px;color:var(--faint);font-weight:600;padding:2px 8px;border-radius:6px}
.ck-dayh .add:hover{background:var(--soft);color:var(--fg)}
.ck-lrow{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:12px;align-items:center;padding:9px 14px;border-top:1px solid var(--hair);cursor:pointer;min-height:50px}
.ck-lrow:first-of-type{border-top:0}
.ck-lrow:hover{background:var(--rowhover)}
.ck-lrow.drop{background:var(--accent-bg);box-shadow:inset 0 0 0 2px var(--accent)}
.ck-lrow.dragging{opacity:.4}
.ck-lrow .tm{font-variant-numeric:tabular-nums;font-size:13px;font-weight:700;color:var(--muted)}
.ck-lrow .ti{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ck-lrow .sub{display:flex;gap:6px;align-items:center;margin-top:3px;font-size:11.5px;color:var(--faint)}
.ck-lrow .acts{display:flex;gap:6px;align-items:center}
.ck-lrow.ghost{cursor:pointer}
.ck-lrow.ghost .ti{color:var(--faint);font-weight:500}
.ck-lrow.ghost .tm{color:var(--faint)}
.ck-ghostbox{border:1.5px dashed var(--line);border-radius:8px;padding:6px 10px;display:flex;gap:8px;align-items:center}
.ck-buf{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;border-radius:6px;padding:1px 7px;white-space:nowrap}
.ck-buf.done{color:var(--ok);background:#d1fae5}
.ck-buf.go{color:#fff;background:var(--ink);cursor:pointer}
.ck-buf.go:hover{opacity:.85}
.ck-bq{padding:4px 18px 8px;display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow:auto}
.ck-bq .it{border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;position:relative}
.ck-bq .it .c{position:absolute;right:8px;top:6px;font-size:10.5px;font-weight:700;color:var(--faint);font-family:'Geist',system-ui,sans-serif}
.ck-bq .it.over{border-color:var(--warn)}
.ck-bq .it.over .c{color:var(--warn)}
.ck-berr{margin:0 18px 8px;font-size:12.5px;color:var(--warn);font-weight:600;line-height:1.6}
@media (max-width:900px){.ck-tray{position:fixed;right:0;top:100px;bottom:0;max-height:none;z-index:60;box-shadow:var(--shadow)}}
`;

// ── 本文 → X に送る文字の並び（スレッドの区切りで分ける） ──
// 編集画面と同じ区切り（<hr class="thread-sep">）で分け、段落 1 つ＝ 1 行にする（空の段落は空行）
export function threadTexts(html) {
  if (typeof document === "undefined") return [];
  const root = document.createElement("div");
  root.innerHTML = html || "";
  const parts = [[]];
  root.childNodes.forEach(n => {
    const sep = n.nodeType === 1 && (n.classList?.contains("thread-sep") || n.getAttribute?.("data-thread") === "true");
    if (sep) parts.push([]); else parts[parts.length - 1].push(n);
  });
  const walk = node => {
    if (node.nodeType === 3) return node.textContent;
    const tag = node.tagName?.toLowerCase();
    const inner = Array.from(node.childNodes).map(walk).join("");
    if (tag === "br") return "\n";
    if (tag === "p" || tag === "div" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "blockquote") return inner + "\n";
    if (tag === "li") return "・" + inner + "\n";
    if (tag === "hr") return "\n";
    return inner;
  };
  return parts
    .map(ns => ns.map(walk).join("").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean);
}
// X の数え方（おおよそ）：日本語などは 2、英数字は 1、URL は 23
export function xLen(s) {
  let n = 0;
  const t = String(s || "").replace(/https?:\/\/\S+/g, () => { n += 23; return ""; });
  for (const ch of t) {
    const c = ch.codePointAt(0);
    n += (c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2;
  }
  return n;
}
export function bufferReason(p, now = new Date()) {
  if (!BUFFER_ACCOUNTS.includes(p.account_id)) return "このアカウントには Buffer の窓口がありません";
  if ((p.postType || "x_post") !== "x_post") return "Buffer に入れられるのは Xポストだけです";
  if (p.buffer_post_id) return "もう Buffer に入っています";
  if (!p.datetime) return "日時が入っていません";
  if (new Date(p.datetime + ":00+09:00").getTime() < now.getTime() + 2 * 60 * 1000) return "日時が過ぎています";
  return "";
}
const fmtDt = dt => { if (!dt) return ""; const d = new Date(dt + ":00"); return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]}) ${dt.slice(11, 16)}`; };

function TypeTag({ t, postTypes }) { const pt = getPostTypeStyle(t, postTypes); return <span className="ck-type" style={{ color: pt.color, background: pt.bg }}>{pt.label}</span>; }

// ── Buffer に入れる確認の窓（日時と、送る本文をそのまま見せる） ──
export function BufferModal({ post, onClose, onDone }) {
  const texts = useMemo(() => threadTexts(post.body), [post.body]);
  const hasImg = /<img\b/i.test(post.body || "");
  const over = texts.some(t => xLen(t) > 280);
  const why = bufferReason(post);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const block = why || (!texts.length ? "本文が空です" : "") || (hasImg ? "画像入りのポストは、まだ Buffer の画面で入れてください" : "") || (over ? "280 を超えているポストがあります（X の数え方。日本語は 1 字 2）" : "");
  const send = async () => {
    if (busy || block) return;
    setBusy(true); setErr("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("ログインを確認できませんでした。開き直してください");
      const token = await user.getIdToken();
      const res = await fetch("/api/buffer-schedule", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ post_id: post.id, texts }) });
      const raw = await res.text();
      let data = {}; try { data = JSON.parse(raw); } catch { /* JSON でない返事はそのまま一部を見せる */ }
      if (!data.ok) throw new Error(data.error || `入れられませんでした（${res.status}）${raw ? "：" + raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) : ""}`);
      onDone(data.buffer_post_id, data.warn);
    } catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  return <div className="ck"><div className="ck-scrim" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="ck-modal" role="dialog" aria-label="Buffer に入れる" tabIndex={-1} ref={ref} onKeyDown={e => { if (e.key === "Escape" && !busy) onClose(); }}>
      <div className="ck-mti">{headOf(post) || "（タイトルなし）"}</div>
      <div className="ck-mrow"><span>いつ出す（X @antoshia2n）</span><div style={{ fontWeight: 700, fontSize: 15 }}>{fmtDt(post.datetime)}</div></div>
      <div className="ck-mrow" style={{ paddingBottom: 2 }}><span>送る本文{texts.length > 1 ? `（スレッド ${texts.length} 本）` : ""}</span></div>
      <div className="ck-bq">{texts.map((t, i) => <div key={i} className={`it ${xLen(t) > 280 ? "over" : ""}`}><span className="c">{texts.length > 1 ? `${i + 1}/${texts.length}・` : ""}{xLen(t)}/280</span>{t}</div>)}
        {!texts.length && <div className="ck-empty">本文が空です</div>}</div>
      {(block || err) && <div className="ck-berr">{err || block}</div>}
      <div className="ck-mft"><span>押すと本物の X 予約になります。取り消しは Buffer の画面で</span>
        <button className="ck-ghost" onClick={onClose} disabled={busy}>今回は入れない</button>
        <button className="ck-ink" onClick={send} disabled={!!block || busy}>{busy ? "入れています…" : "Buffer に入れる"}</button></div>
    </div>
  </div></div>;
}

// ── ネタの棚（カレンダーの右）：ドラッグで空き枠へ。日時なしのアウトプットもここに ──
export function IdeaTray({ ideas, undated, postTypes, dragStart, dragEnd, onOpen, onNext, open }) {
  const [q, setQ] = useState("");
  const qq = q.trim().toLowerCase();
  const hit = p => !qq || (headOf(p) + " " + (p.memo || "")).toLowerCase().includes(qq);
  return <aside className={`ck-tray ${open ? "" : "off"}`}>
    <label className="ck-search" style={{ width: "100%", margin: "0 0 4px" }}><input value={q} onChange={e => setQ(e.target.value)} placeholder="棚を探す" /></label>
    {undated.length > 0 && <>
      <div className="ck-tray-h"><span>日時なしのアウトプット</span><span>{undated.length}</span></div>
      {undated.filter(hit).map(p => <div key={p.id} className="ck-chip" draggable onDragStart={dragStart(p)} onDragEnd={dragEnd} onClick={() => onOpen(p)}>
        <span className="t">{headOf(p) || "（タイトルなし）"}</span>
        <span className="m"><TypeTag t={p.postType} postTypes={postTypes} /><button className="ck-mini" onClick={e => { e.stopPropagation(); onNext(p); }}>次の空き枠へ</button></span>
      </div>)}
    </>}
    <div className="ck-tray-h"><span>ネタ</span><span>{ideas.length}</span></div>
    <div className="ck-tray-note">空き枠へドラッグすると、その日時の下書きになる</div>
    {ideas.filter(hit).slice(0, 80).map(p => <div key={p.id} className="ck-chip" draggable onDragStart={dragStart(p)} onDragEnd={dragEnd} onClick={() => onOpen(p)}>
      <span className="t">{headOf(p) || "（空のネタ）"}</span>
      <span className="m"><TypeTag t={p.postType} postTypes={postTypes} />{p.genre && <span>{p.genre}</span>}<button className="ck-mini" onClick={e => { e.stopPropagation(); onNext(p); }}>次の空き枠へ</button></span>
    </div>)}
    {!ideas.length && <div className="ck-tray-note">ネタはまだない。⌘K で入れられる</div>}
  </aside>;
}

// ── リスト：週の 7 日を縦に。予定と空き枠を時刻順に並べる ──
export function CalendarList({ weekDates, weekDateStrs, today, posts, slots, postTypes, dragId, setDragId, onPlace, onSwap, onOpen, openNew, changeStatus, onBuffer }) {
  const [over, setOver] = useState(null);
  const byDate = useMemo(() => { const m = {}; posts.filter(p => p.datetime).forEach(p => { (m[p.datetime.slice(0, 10)] = m[p.datetime.slice(0, 10)] || []).push(p); }); return m; }, [posts]);
  const dz = (key, fn) => ({
    onDragOver: e => { if (!dragId) return; e.preventDefault(); if (over !== key) setOver(key); },
    onDragLeave: () => setOver(o => o === key ? null : o),
    onDrop: e => { e.preventDefault(); setOver(null); if (dragId) fn(dragId); setDragId(null); },
  });
  return <div className="ck-list">
    {weekDates.map((d, i) => {
      const ds = weekDateStrs[i];
      const dayPosts = (byDate[ds] || []).slice().sort((a, b) => a.datetime.localeCompare(b.datetime));
      const daySlots = slots.filter(s => slotMatchesDate(s, d));
      // 過ぎた枠は出さない（過去の日時へ置かないため）
      const now = new Date(); const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const ghosts = ds < today ? [] : daySlots.filter(s => !(ds === today && slotTime(s) <= nowHM) && !dayPosts.some(p => p.datetime.slice(11, 16) === slotTime(s) && (p.postType || "x_post") === (s.postType || "x_post")));
      const items = [...dayPosts.map(p => ({ k: "p", t: p.datetime.slice(11, 16), p })), ...ghosts.map(s => ({ k: "g", t: slotTime(s), s }))].sort((a, b) => a.t.localeCompare(b.t));
      return <section key={ds} className={`ck-day ${ds === today ? "today" : ""}`}>
        <div className="ck-dayh">{d.getMonth() + 1}/{d.getDate()}<small>{W[d.getDay()]}曜{ds === today ? "・今日" : ""}</small><span className="n">{dayPosts.length} 本{ghosts.length ? `・空き ${ghosts.length}` : ""}</span><button className="add" onClick={() => openNew(`${ds}T09:00`)}>＋</button></div>
        {items.map((it, j) => {
          if (it.k === "g") {
            const key = `g:${ds}:${it.t}:${j}`;
            return <div key={key} className={`ck-lrow ghost ${over === key ? "drop" : ""}`} onClick={() => openNew(`${ds}T${it.t}`, { title: it.s.title || "", postType: it.s.postType || "x_post" })} {...dz(key, id => onPlace(id, `${ds}T${it.t}`, it.s.postType || "x_post"))}>
              <span className="tm">{it.t}</span>
              <div className="ck-ghostbox"><TypeTag t={it.s.postType || "x_post"} postTypes={postTypes} /><span className="ti">{it.s.title || "空き枠"}　— ネタをここへドラッグ</span></div>
              <span />
            </div>;
          }
          const p = it.p; const key = `p:${p.id}`;
          const st = STATUS[p.status];
          return <div key={key} className={`ck-lrow ${over === key ? "drop" : ""} ${dragId === p.id ? "dragging" : ""}`} draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/ck", String(p.id)); setDragId(p.id); }} onDragEnd={() => { setDragId(null); setOver(null); }}
            onClick={e => { if (!e.target.closest("select,button")) onOpen(p); }} {...dz(key, id => { if (id !== p.id) onSwap(id, p.id); })}>
            <span className="tm">{it.t}</span>
            <div style={{ minWidth: 0 }}><div className="ti">{headOf(p) || "（タイトルなし）"}</div>
              <div className="sub"><TypeTag t={p.postType} postTypes={postTypes} />{p.genre && <span>{p.genre}</span>}</div></div>
            <div className="acts">
              {p.buffer_post_id ? <span className="ck-buf done">Buffer 済</span>
                : p.status === "reserved" && !bufferReason(p) ? <button className="ck-buf go" onClick={() => onBuffer(p)}>Buffer に入れる</button> : null}
              <select className="ck-stsel" value={p.status} onChange={e => changeStatus(p.id, e.target.value, p.score)} style={{ backgroundImage: `radial-gradient(circle,${ST_COLOR[p.status]} 3.5px,transparent 4px)` }} aria-label={st?.label}>
                {OUT_ST.map(s => <option key={s} value={s}>{STATUS[s]?.label || s}</option>)}
              </select>
            </div>
          </div>;
        })}
        {!items.length && <div className="ck-empty" style={{ padding: "14px" }}>予定も枠もない日</div>}
      </section>;
    })}
  </div>;
}
