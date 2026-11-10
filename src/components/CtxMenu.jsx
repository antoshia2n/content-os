// 右クリックのメニュー（2026-11-10 Naoki「右クリックすると Chrome の右クリックメニューもでちゃう。notion とかの解決策を参考に」→ デモに OK 11:36）
// Notion と同じ考え方：
//   ・行・カード（「…」のメニューを持つもの、カレンダーの投稿）の上で右クリック → コンテンツくんのメニューだけを出す
//   ・文字を書く欄（入力欄・本文）の中 → Chrome のメニューのまま（貼り付け・スペルチェックのため）
//   ・Shift を押しながら右クリック → どこでも Chrome のメニュー
// 行は今ある「…」のメニュー（StockParts の RowMenu）をカーソルの位置に開く（中身を 2 つ持たないため）。
// カレンダーの投稿など「…」の無いものは openCtx(e, items) で開く。窓の決まり：外を押す・Esc で閉じ、閉じたら元の場所へ戻る。
import React, { useEffect, useRef, useState } from "react";

const EDITABLE = 'input,textarea,select,[contenteditable="true"],[contenteditable=""]';

// 右クリックが Chrome のメニューのままでよい所か
export const keepNative = e => e.shiftKey || !!(e.target && e.target.closest && e.target.closest(EDITABLE));

// 「…」を 1 つだけ持ついちばん近い入れ物（＝行）の「…」を探す。2 つ以上入る所まで上がったら、そこは行ではない
function rowMore(t) {
  for (let el = t; el && el !== document.body; el = el.parentElement) {
    if (el.matches && el.matches(".ck-more")) return el;
    const m = el.querySelectorAll ? el.querySelectorAll(".ck-more") : [];
    if (m.length === 1) return m[0];
    if (m.length > 1) return null;
  }
  return null;
}

// 「…」の無いものに開く。items は [{ label, run, danger?, note? }]
export function openCtx(e, items) {
  if (keepNative(e) || !items || !items.length) return;
  e.preventDefault(); e.stopPropagation();
  document.dispatchEvent(new CustomEvent("ck-ctx-open", { detail: { x: e.clientX, y: e.clientY, items, back: document.activeElement } }));
}

export function CtxMenuHost() {
  const [m, setM] = useState(null);
  const box = useRef(null);
  // 行の上の右クリック：行の「…」をカーソルの位置に開く
  useEffect(() => {
    const ctx = e => {
      if (e.defaultPrevented || keepNative(e)) return;
      const btn = rowMore(e.target);
      if (!btn) return;
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("ck-rowctx", { detail: { btn, x: e.clientX, y: e.clientY } }));
    };
    const open = e => setM(e.detail);
    document.addEventListener("contextmenu", ctx);
    document.addEventListener("ck-ctx-open", open);
    return () => { document.removeEventListener("contextmenu", ctx); document.removeEventListener("ck-ctx-open", open); };
  }, []);
  useEffect(() => {
    if (!m) return;
    const first = box.current && box.current.querySelector("button");
    if (first) first.focus({ preventScroll: true });
    const close = (back) => { setM(null); if (back && m.back && m.back.focus) m.back.focus({ preventScroll: true }); };
    const down = e => { if (!box.current || !box.current.contains(e.target)) close(false); };
    const key = e => {
      if (e.key === "Escape") { e.stopPropagation(); close(true); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const bs = [...box.current.querySelectorAll("button")]; const i = bs.indexOf(document.activeElement);
        bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length].focus();
      }
    };
    const away = () => close(false);
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", away, true); window.addEventListener("resize", away); document.addEventListener("ck-rmenu", away);
    return () => {
      document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", away, true); window.removeEventListener("resize", away); document.removeEventListener("ck-rmenu", away);
    };
  }, [m]);
  if (!m) return null;
  const h = m.items.length * 36 + 14, w = 220;
  const style = { position: "fixed", zIndex: 900, left: Math.max(8, Math.min(m.x, window.innerWidth - w - 8)), top: Math.max(8, Math.min(m.y, window.innerHeight - h - 8)),
    minWidth: w, background: "#fff", border: "1px solid #e6dfd6", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.14)", padding: 6, display: "flex", flexDirection: "column" };
  return <div ref={box} role="menu" style={style} onContextMenu={e => e.preventDefault()}>
    {m.items.map(it => <button key={it.label} role="menuitem" onClick={() => { setM(null); it.run(); }}
      onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })}
      style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontSize: 13, fontWeight: 600, padding: "0 10px", minHeight: 34, borderRadius: 8, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", color: it.danger ? "#b91c1c" : "#1a1a1a" }}
      onFocus={e => { e.currentTarget.style.background = "#f7f3ee"; }} onBlur={e => { e.currentTarget.style.background = "none"; }}>
      {it.label}{it.note && <small style={{ fontSize: 12, color: "#6b6259", fontWeight: 500, marginLeft: "auto" }}>{it.note}</small>}
    </button>)}
  </div>;
}
