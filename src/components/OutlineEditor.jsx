// 2026-11-08 Notion の形へ 便④：エディタの「構成（箇条書き）」タブ（作る前の 1 枚に Naoki OK 2026-11-07 22:40）
// - 正本は思考整理くんのマップ。ここは行を出して直すだけで、書いたら 1 秒後に思考整理くんへ送る
// - Enter で次の行・Tab で一段下げる・Shift+Tab で戻す・空の行で Backspace で消す・↑↓ で行を移る
// - 思考整理くんの画面でも同時に直していたら、上書きせず向こうに合わせて知らせる
import React, { useEffect, useRef, useState } from "react";
import { getOutline, putOutline, mapIdOf } from "../lib/mindmapLink.js";

let seq = 0;
const key = () => "k" + (++seq);
const withKeys = ls => (ls || []).map(l => ({ ...l, k: key() }));

export function OutlineEditor({ mmUrl, onMakeMap, onHeadings, toast }) {
  const id = mapIdOf(mmUrl);
  const [st, setSt] = useState(id ? "loading" : "none"); // none / loading / ready / error
  const [err, setErr] = useState("");
  const [lines, setLines] = useState([]);
  const [save, setSave] = useState(""); // "" / 保存中… / 保存しました / エラー文
  const rev = useRef(0), url = useRef(""), dirty = useRef(false), timer = useRef(null);
  const refs = useRef({}), focusAt = useRef(null);
  const linesRef = useRef(lines); linesRef.current = lines;

  const load = async () => {
    if (!id) { setSt("none"); return; }
    setSt("loading");
    try {
      const j = await getOutline(id);
      rev.current = j.rev; url.current = j.url;
      setLines(j.lines.length ? withKeys(j.lines) : [{ d: 0, t: "", k: key() }]);
      setSt("ready");
    } catch (e) { setErr(e.message); setSt("error"); }
  };
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = async () => {
    if (!dirty.current || !id) return;
    dirty.current = false;
    setSave("保存中…");
    try {
      const out = linesRef.current.filter((l, i, a) => l.t.trim() || i < a.length - 1).map(({ id: nid, d, t }) => ({ id: nid, d, t }));
      const j = await putOutline(id, rev.current, out);
      rev.current = j.rev;
      if (j.conflict) {
        setLines(j.lines.length ? withKeys(j.lines) : [{ d: 0, t: "", k: key() }]);
        setSave("");
        toast && toast("思考整理くんで書き換えられていたので、そちらに合わせました");
        return;
      }
      // 新しい行に枝の id が付いたので、順番どおりに写す（行の数が同じときだけ）
      setLines(cur => cur.length === j.lines.length ? cur.map((l, i) => ({ ...l, id: j.lines[i].id })) : cur);
      setSave("保存しました");
    } catch (e) { dirty.current = true; setSave(e.message); }
  };
  useEffect(() => () => { if (dirty.current) flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (next, fAt) => {
    setLines(next); dirty.current = true; setSave("");
    focusAt.current = fAt || null;
    clearTimeout(timer.current); timer.current = setTimeout(flush, 1000);
  };
  useEffect(() => {
    const f = focusAt.current; if (!f) return; focusAt.current = null;
    const el = refs.current[f.k]; if (!el) return;
    el.focus(); const p = f.pos === "end" ? el.value.length : (f.pos ?? 0); try { el.setSelectionRange(p, p); } catch { /* 置けなくても続ける */ }
  });

  const onKey = (e, i) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const L = lines, l = L[i];
    if (e.key === "Enter") {
      e.preventDefault();
      const at = e.target.selectionStart ?? l.t.length;
      const nl = { d: l.d, t: l.t.slice(at), k: key() };
      change([...L.slice(0, i), { ...l, t: l.t.slice(0, at) }, nl, ...L.slice(i + 1)], { k: nl.k, pos: 0 });
    } else if (e.key === "Tab") {
      e.preventDefault();
      const max = i === 0 ? 0 : L[i - 1].d + 1;
      const d = e.shiftKey ? Math.max(0, l.d - 1) : Math.min(max, l.d + 1);
      if (d !== l.d) change(L.map((x, j) => j === i ? { ...x, d } : x), { k: l.k, pos: e.target.selectionStart });
    } else if (e.key === "Backspace" && !l.t && L.length > 1) {
      e.preventDefault();
      const prev = L[Math.max(0, i - 1)];
      change(L.filter((_, j) => j !== i), { k: (i === 0 ? L[1] : prev).k, pos: "end" });
    } else if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); refs.current[L[i - 1].k]?.focus(); }
    else if (e.key === "ArrowDown" && i < L.length - 1) { e.preventDefault(); refs.current[L[i + 1].k]?.focus(); }
  };

  const box = { border: "1px solid #e6dfd6", background: "#fff", borderRadius: 12, padding: 16, fontSize: 14, color: "#1a1a1a" };
  const btn = { border: "1px solid #a39a90", background: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a" };
  if (st === "none") return (
    <div style={box}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>この投稿には、まだ構成のマップがありません</div>
      <div style={{ color: "#6b6259", fontSize: 13, marginBottom: 12 }}>思考整理くんにマップを 1 枚作り、ここで箇条書きとして直せるようにします。マップの形でも開けます。</div>
      <button style={{ ...btn, background: "#b45309", color: "#fff", border: "none" }} onClick={onMakeMap}>思考整理くんで構成を作る</button>
    </div>
  );
  if (st === "loading") return <div style={{ ...box, color: "#6b6259" }}>思考整理くんのマップを読んでいます…</div>;
  if (st === "error") return (
    <div style={box}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>マップを読めませんでした</div>
      <div style={{ color: "#6b6259", fontSize: 13, marginBottom: 12 }}>{err}</div>
      <button style={btn} onClick={load}>もう一度読む</button>
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#736a62", marginBottom: 10, flexWrap: "wrap" }}>
        <span>Enter で次の行・Tab で一段下げる・Shift+Tab で戻す</span>
        <span style={{ marginLeft: "auto" }} role="status" aria-live="polite">{save}</span>
        <a href={url.current || mmUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#b45309", fontWeight: 700, textDecoration: "none" }}>マップで開く ↗</a>
      </div>
      <div role="list" aria-label="構成" style={{ fontSize: 16, lineHeight: 1.8 }}>
        {lines.map((l, i) => (
          <div key={l.k} role="listitem" style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: l.d * 24 }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: l.d === 0 ? "#1a1a1a" : "transparent", border: "1.5px solid #1a1a1a" }} />
            <input ref={el => { refs.current[l.k] = el; }} value={l.t} aria-label={`${i + 1} 行目（${l.d + 1} 段目）`}
              onChange={e => change(lines.map((x, j) => j === i ? { ...x, t: e.target.value } : x))}
              onKeyDown={e => onKey(e, i)} onBlur={() => { clearTimeout(timer.current); flush(); }}
              placeholder={i === 0 && lines.length === 1 ? "最初の柱を書く" : ""}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 16, fontWeight: l.d === 0 ? 700 : 400, padding: "2px 4px", fontFamily: "inherit", color: "#1a1a1a" }} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <button style={btn} onClick={() => onHeadings(lines.filter(l => l.d === 0 && l.t.trim()).map(l => l.t.trim()))}>一番上の段を本文の見出しにする ⇣</button>
      </div>
    </div>
  );
}
