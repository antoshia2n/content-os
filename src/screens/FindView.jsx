// src/screens/FindView.jsx
// 2026-10-23 作り直し 3便：自分の投稿・スワイプくん・思考整理くんを 1 か所で探す。
// ほかの 2 つのアプリの表（sw_swipes・mm_maps）は読むだけ（/api/db で readOnly にしてある）。書き換えない。
// 見つけたものは「受け箱へ」か「素材に足す」（投稿のメモ欄のリンクに住所が入る＝今の編集画面のメモに出る）。
import React, { useState, useEffect, useMemo, useRef } from "react";
import { getPostTypeStyle, STATUS, stripHtml } from "../constants.js";
import { supabase } from "../lib/supabase.js";

export const SWIPE_URL = id => `https://swipe.shia2n.jp/?open=${id}`;
export const MAP_URL = id => `https://mindmap.shia2n.jp/m/${id}`;
const SW_COLS = "id,title,excerpt,body,author,source_url,shu,source_type,reason,an_hypo,an_idea,created_at";
const MM_COLS = "id,title,tags,body_text,is_template,updated_at";

// 1 回読んだら、開いている間は持っておく（開くたびに読みに行かない）
let cache = null, loading = null;
export function loadOthers(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  if (loading && !force) return loading;
  const one = async (table, cols, order) => {
    try {
      const { data, error } = await supabase.from(table).select(cols).order(order, { ascending: false }).limit(3000);
      if (error) return { rows: [], err: error.message || String(error) };
      return { rows: data || [], err: "" };
    } catch (e) { return { rows: [], err: e.message || String(e) }; }
  };
  loading = Promise.all([one("sw_swipes", SW_COLS, "created_at"), one("mm_maps", MM_COLS, "updated_at")])
    .then(([sw, mm]) => {
      const got = { swipes: sw.rows, maps: mm.rows.filter(m => !m.is_template), swErr: sw.err, mmErr: mm.err };
      // 読めなかったときは覚えない（次に開いたときに読み直すため）
      cache = sw.err || mm.err ? null : got; loading = null; return got;
    });
  return loading;
}
// fresh=true：開くたびに読み直す（⌘K の窓）。ほかのアプリで足したスワイプやマップもすぐ出るように
export function useOthers(on, fresh = false) {
  const [d, setD] = useState(cache);
  useEffect(() => { if (!on) return; let live = true; loadOthers(fresh).then(x => { if (live) setD(x); }); return () => { live = false; }; }, [on, fresh]);
  return d;
}

const norm = s => String(s || "").toLowerCase();
const headOf = p => (p.title || "").trim() || (p.memo || "").trim().split("\n")[0] || stripHtml(p.body || "").trim().slice(0, 60);
const swHead = s => (s.title || "").trim() || (s.excerpt || s.body || "").trim().split("\n")[0].slice(0, 80) || "（見出しなし）";
const snip = (text, q, n = 70) => { const t = String(text || "").replace(/\s+/g, " ").trim(); if (!t) return ""; const i = q ? norm(t).indexOf(q) : -1; if (i < 0) return t.slice(0, n); const s = Math.max(0, i - 20); return (s ? "…" : "") + t.slice(s, s + n); };

// 言葉 1 つで 3 つを探す。言葉が空なら、それぞれ新しいものから
export function findAll(q, posts, others, max = 12) {
  const qq = norm(q.trim());
  const terms = qq.split(/\s+/).filter(Boolean);
  const hit = text => !terms.length || terms.every(t => text.includes(t));
  const P = posts.filter(p => hit(norm(headOf(p) + " " + (p.memo || "") + " " + stripHtml(p.body || "")))).slice(0, max)
    .map(p => ({ k: "post", id: p.id, title: headOf(p) || "（タイトルなし）", sub: snip(p.memo || stripHtml(p.body || ""), qq), p }));
  const S = (others?.swipes || []).filter(s => hit(norm([s.title, s.excerpt, s.body, s.author, s.reason, s.an_hypo, s.an_idea].join(" ")))).slice(0, max)
    .map(s => ({ k: "swipe", id: s.id, title: swHead(s), sub: [s.shu, s.author].filter(Boolean).join("・") + (s.reason ? `｜${snip(s.reason, qq, 50)}` : ""), url: SWIPE_URL(s.id), src: s.source_url || "", s }));
  const M = (others?.maps || []).filter(m => hit(norm((m.title || "") + " " + (m.tags || []).join(" ") + " " + (m.body_text || "")))).slice(0, max)
    .map(m => ({ k: "map", id: m.id, title: m.title || "無題のマップ", sub: snip(m.body_text, qq), url: MAP_URL(m.id), m }));
  return { P, S, M };
}

// 受け箱へ入れる中身（どこから来たかをメモ欄のリンクに残す）
export function ideaFrom(r) {
  if (r.k === "swipe") return { title: r.title, memo: [r.s.excerpt || "", r.s.reason ? `なぜ良い：${r.s.reason}` : ""].filter(Boolean).join("\n"), memoLinks: [{ label: "スワイプ", url: r.url }, ...(r.src ? [{ label: "元の投稿", url: r.src }] : [])] };
  if (r.k === "map") return { title: r.title, memo: "", memoLinks: [{ label: "思考整理", url: r.url }], mm_url: r.url };
  return null;
}
export const linkFrom = r => r.k === "swipe" ? { label: `スワイプ：${r.title.slice(0, 30)}`, url: r.url } : r.k === "map" ? { label: `思考整理：${r.title.slice(0, 30)}`, url: r.url } : null;

export const FIND_CSS = `
.ck-find{display:flex;flex-direction:column;gap:8px}
.ck-find-q{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.ck-find-q:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.ck-find-q input:focus-visible{outline:none}
.ck-find-q input{flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:14px;color:var(--fg);font-family:inherit}
.ck-find-tabs{display:flex;gap:2px;flex-wrap:wrap}
.ck-fg{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ck-fgh{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:11.5px;font-weight:700;color:var(--faint);border-bottom:1px solid var(--hair)}
.ck-fgh .n{margin-left:auto;font-weight:600}
.ck-fr{display:flex;gap:10px;align-items:flex-start;padding:9px 12px;border-top:1px solid var(--hair)}
.ck-fr:first-of-type{border-top:0}
.ck-fr:hover{background:var(--rowhover)}
.ck-fr .b{flex:1;min-width:0;cursor:pointer}
.ck-fr .t{font-size:13px;font-weight:600;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ck-fr .s{font-size:11.5px;color:var(--faint);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ck-fr .a{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;flex:none;max-width:48%}
.ck-fdot{width:8px;height:8px;border-radius:50%;flex:none;margin-top:6px}
.ck-ferr{font-size:11.5px;color:var(--warn);padding:6px 12px}
.ck-fto{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--faint);flex-wrap:wrap}
`;
const KIND = { post: { l: "自分の投稿", c: "#ea580c" }, swipe: { l: "スワイプ", c: "#2563eb" }, map: { l: "思考整理", c: "#7c3aed" } };

// ── 探す（サイドパネルでも広い画面でも使う） ──
export function FindPanel({ posts, postTypes, targets = [], onOpenPost, onToInbox, onAddLink, autoFocus, initialQ = "" }) {
  const [q, setQ] = useState(initialQ);
  const [tab, setTab] = useState("all");
  const [to, setTo] = useState("");
  const others = useOthers(true);
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const r = useMemo(() => findAll(q, posts, others, tab === "all" ? 6 : 40), [q, posts, others, tab]);
  const target = targets.find(t => String(t.id) === String(to));
  const groups = [["post", r.P], ["swipe", r.S], ["map", r.M]].filter(([k]) => tab === "all" || tab === k);
  return <div className="ck-find"><style>{FIND_CSS}</style>
    <label className="ck-find-q"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--faint)" }}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
      <input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="投稿・スワイプ・思考整理をまとめて探す" /></label>
    <div className="ck-find-tabs">{[["all", "すべて"], ["post", "自分の投稿"], ["swipe", "スワイプ"], ["map", "思考整理"]].map(([k, l]) => <button key={k} className={`ck-vtab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
    {onAddLink && targets.length > 0 && <div className="ck-fto">素材に足す先
      <select className="ck-sel" value={to} onChange={e => setTo(e.target.value)}><option value="">選ぶ（書きかけの投稿）</option>{targets.map(t => <option key={t.id} value={t.id}>{(headOf(t) || "（タイトルなし）").slice(0, 28)}</option>)}</select></div>}
    {!others && <div className="ck-empty">スワイプと思考整理を読み込んでいます…</div>}
    {others?.swErr && (tab === "all" || tab === "swipe") && <div className="ck-ferr">スワイプを読めませんでした（{others.swErr}）</div>}
    {others?.mmErr && (tab === "all" || tab === "map") && <div className="ck-ferr">思考整理を読めませんでした（{others.mmErr}）</div>}
    {groups.map(([k, rows]) => <div key={k} className="ck-fg">
      <div className="ck-fgh"><span className="ck-fdot" style={{ background: KIND[k].c, marginTop: 0 }} />{KIND[k].l}<span className="n">{rows.length ? `${rows.length} 件${tab === "all" && rows.length >= 6 ? "〜" : ""}` : "なし"}</span></div>
      {rows.map(x => <div key={k + x.id} className="ck-fr">
        <div className="b" onClick={() => x.k === "post" ? onOpenPost(x.p) : window.open(x.url, "_blank", "noopener")}>
          <div className="t">{x.title}</div>
          <div className="s">{x.k === "post" ? <><span style={{ color: getPostTypeStyle(x.p.postType, postTypes).color }}>{getPostTypeStyle(x.p.postType, postTypes).label}</span>・{x.p.status === "idea" ? "ネタ" : STATUS[x.p.status]?.label}{x.sub ? `｜${x.sub}` : ""}</> : x.sub}</div>
        </div>
        <div className="a">
          {x.k !== "post" && onToInbox && <button className="ck-mini" style={{ marginLeft: 0 }} onClick={() => onToInbox(x)}>受け箱へ</button>}
          {x.k !== "post" && onAddLink && target && <button className="ck-mini" style={{ marginLeft: 0 }} onClick={() => onAddLink(target, x)}>素材に足す</button>}
        </div>
      </div>)}
    </div>)}
  </div>;
}

// ── ⌘K：ネタを入れる・3 つを探す ──
export function FindModal({ posts, accountName, onClose, onAdd, onOpenPost, onToInbox }) {
  const [v, setV] = useState("");
  const [sel, setSel] = useState(-1);
  const ref = useRef(null);
  const others = useOthers(true, true);
  useEffect(() => { ref.current?.focus(); }, []);
  const r = useMemo(() => v.trim() ? findAll(v.split("\n")[0], posts, others, 5) : { P: [], S: [], M: [] }, [v, posts, others]);
  const flat = [...r.P, ...r.S, ...r.M];
  const add = () => { const t = v.trim(); if (!t) return; const [first, ...rest] = t.split("\n"); onAdd({ title: first.trim(), memo: rest.join("\n").trim() }); };
  const open = x => x.k === "post" ? onOpenPost(x.p) : window.open(x.url, "_blank", "noopener");
  return <div className="ck-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><style>{FIND_CSS}</style>
    <div className="ck-modal" role="dialog" aria-label="ネタ・検索" onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
      <textarea ref={ref} value={v} onChange={e => { setV(e.target.value); setSel(-1); }} placeholder={`ネタを書く（Enter は改行・⌘＋Enter で ${accountName} の受け箱へ）／投稿・スワイプ・思考整理をまとめて探す`}
        onKeyDown={e => {
          if (e.key === "Escape") { onClose(); return; }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); add(); return; }
          if (e.key === "ArrowDown" && flat.length && (sel >= 0 || !v.includes("\n"))) { e.preventDefault(); setSel(s => Math.min(s + 1, flat.length - 1)); return; }
          if (e.key === "ArrowUp" && sel >= 0) { e.preventDefault(); setSel(s => Math.max(s - 1, -1)); return; }
          if (e.key === "Enter" && sel >= 0 && !e.nativeEvent.isComposing) { e.preventDefault(); open(flat[sel]); }
        }} />
      {flat.length > 0 && <div className="ck-hits">{flat.map((x, j) => <div key={x.k + x.id} className={`ck-hit ${j === sel ? "on" : ""}`} style={{ cursor: "pointer" }} onClick={() => open(x)}>
        <span className="ck-src" style={{ color: KIND[x.k].c, background: KIND[x.k].c + "1a" }}>{x.k === "post" ? (x.p.status === "idea" ? "ネタ" : "投稿") : KIND[x.k].l}</span>
        <span className="t">{x.title}</span>
        {x.k !== "post" && <button className="ck-mini" onClick={e => { e.stopPropagation(); onToInbox(x); }}>受け箱へ</button>}
      </div>)}</div>}
      {v.trim() && !others && <div className="ck-mft" style={{ paddingTop: 0 }}>スワイプと思考整理を読み込んでいます…</div>}
      <div className="ck-mft"><span className="ck-kbd">⌘</span><span className="ck-kbd">Enter</span>受け箱へ　<span className="ck-kbd">↓</span>探した結果を開く<button className="ck-ink" onClick={add} disabled={!v.trim()}>受け箱へ</button></div>
    </div>
  </div>;
}
