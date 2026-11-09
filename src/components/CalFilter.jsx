// 2026-11-10 軽量化 便2（デモに Naoki OK 00:17）：カレンダーの絞り込みをボタン 1 つ＋選んだものだけのチップに。
// 作り方の 1 枚「絞り込みはボタン 1 つ＋チップ」。窓は 外を押す・Esc・閉じる で閉じ、閉じたら押したボタンへ戻る
import React, { useEffect, useRef, useState } from "react";

export function CalFilter({ groups }) {
  // groups: [{ key, label, items: [{ k, label, n }], sel: string[], set: fn }]
  const [open, setOpen] = useState(false);
  const btn = useRef(null), pop = useRef(null);
  const total = groups.reduce((a, g) => a + g.sel.length, 0);
  const close = () => { setOpen(false); btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector("button")?.focus();
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    const down = e => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", key, true); document.addEventListener("mousedown", down);
    return () => { document.removeEventListener("keydown", key, true); document.removeEventListener("mousedown", down); };
  }, [open]);
  const toggle = (g, k) => g.set(g.sel.includes(k) ? g.sel.filter(x => x !== k) : [...g.sel, k]);
  const chip = on => ({ border: `1px solid ${on ? "#b45309" : "#a39a90"}`, background: on ? "#b45309" : "#fff", color: on ? "#fff" : "#333", borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 28 });
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button ref={btn} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #a39a90", background: "#fff", borderRadius: 8, padding: "4px 11px", fontSize: 12.5, fontWeight: 700, color: "#1a1a1a", cursor: "pointer", fontFamily: "inherit", minHeight: 30 }}>
        絞り込み{total > 0 && <span style={{ background: "#b45309", color: "#fff", borderRadius: 99, fontSize: 12, padding: "0 7px" }}>{total}</span>} ▾
      </button>
      {groups.flatMap(g => g.sel.map(k => {
        const it = g.items.find(x => x.k === k); const label = it ? it.label : k;
        return <span key={g.key + k} style={{ display: "inline-flex", alignItems: "center", gap: 2, background: "#fef3c7", color: "#b45309", borderRadius: 99, padding: "1px 2px 1px 10px", fontSize: 12, fontWeight: 800 }}>
          {label}<button aria-label={`${label}の絞り込みを外す`} onClick={() => toggle(g, k)} style={{ border: 0, background: "none", color: "#b45309", fontWeight: 800, cursor: "pointer", minWidth: 26, minHeight: 26, fontFamily: "inherit" }}>✕</button></span>;
      }))}
      {open && (
        <div ref={pop} role="dialog" aria-label="絞り込み" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60, background: "#fff", border: "1px solid #e6dfd6", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.12)", padding: 12, width: 320 }}>
          {groups.map(g => (
            <div key={g.key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#6b6259", marginBottom: 6 }}>{g.label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {g.items.length === 0 && <span style={{ fontSize: 12, color: "#736a62" }}>この週にはありません</span>}
                {g.items.map(it => { const on = g.sel.includes(it.k); return <button key={it.k} aria-pressed={on} onClick={() => toggle(g, it.k)} style={chip(on)}>{on ? "✓ " : ""}{it.label} {it.n}</button>; })}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e6dfd6", paddingTop: 8 }}>
            <button onClick={() => groups.forEach(g => g.set([]))} style={{ border: 0, background: "none", color: "#b45309", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", minHeight: 28 }}>すべて外す</button>
            <button onClick={close} style={{ border: 0, background: "none", color: "#b45309", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", minHeight: 28 }}>閉じる（Esc）</button>
          </div>
        </div>
      )}
    </div>
  );
}
