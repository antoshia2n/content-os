// 2026-11-08 ガイドあり・なし（Naoki がデモに OK 14:15）
// 右上の「ガイド」を「あり」にすると、画面の上に「この画面でできること」の帯と、
// 帯と同じ番号の小さな丸（画面の中の押す場所）と、左の一覧の見出しの説明が出る。
// はじめて開いた人は「あり」。選んだ形はブラウザに覚える。文の正本は manual.js の GUIDES。
import React, { createContext, useContext, useState, useCallback } from "react";
import { GUIDES } from "../manual.js";

const KEY = "contentos.guide";
export const GuideCtx = createContext({ on: false, set: () => {} });

export function useGuideState() {
  const [on, setOn] = useState(() => { try { const v = localStorage.getItem(KEY); return v == null ? true : v === "1"; } catch { return true; } });
  const set = useCallback(v => { setOn(v); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 覚えられなくても動く */ } }, []);
  return { on, set };
}
export const useGuide = () => useContext(GuideCtx);

// 画面の中の番号の丸。読み上げは帯の文で足りるので、丸そのものは読ませない
export function GPin({ n, style }) {
  const { on } = useGuide();
  if (!on) return null;
  return <span className="ck-gpin" data-gpin={n} aria-hidden="true" style={style}>{n}</span>;
}

// 左の一覧の見出しの下の 1 行
export function GCap({ id }) {
  const { on } = useGuide();
  const t = GUIDES.nav?.[id];
  if (!on || !t) return null;
  return <div className="ck-gcap">{t}</div>;
}

const reduce = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
export function GuideBand({ id }) {
  const { on, set } = useGuide();
  const g = GUIDES.screens?.[id];
  if (!on || !g) return null;
  const show = n => {
    const el = document.querySelector(`[data-gpin="${n}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" });
    el.classList.remove("ck-gpulse"); void el.offsetWidth; el.classList.add("ck-gpulse");
  };
  return <section className="ck-gband" aria-label="この画面でできること">
    <div className="ck-gbh"><b>この画面でできること</b><span className="ck-gtag">ガイド</span>
      <button className="ck-goff" onClick={() => { set(false); document.querySelector(".ck-gsw")?.focus(); }}>ガイドをなしにする</button></div>
    <ol>{g.map(([t, d], i) => <li key={t}><button onClick={() => show(i + 1)} title="画面の中の同じ番号を光らせる">
      <span className="ck-gpin">{i + 1}</span><span><b>{t}</b><span className="ck-gd">{d}</span></span></button></li>)}</ol>
  </section>;
}

export function GuideSwitch() {
  const { on, set } = useGuide();
  return <button className="ck-gsw" role="switch" aria-checked={on} onClick={() => set(!on)} title="画面の上に、ここでできることを出す">
    <span>ガイド</span><span className="tr" aria-hidden="true" /><span className="st">{on ? "あり" : "なし"}</span></button>;
}

export const GUIDE_CSS = `
.ck-gsw{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 10px 0 11px;border-radius:999px;border:1px solid var(--line,#e6dfd6);background:var(--panel,#fff);font:inherit;font-size:12px;font-weight:700;color:var(--fg,#1a1a1a);cursor:pointer;flex-shrink:0}
.ck-gsw .tr{width:28px;height:16px;border-radius:8px;background:#a39a90;position:relative;transition:background .15s}
.ck-gsw .tr::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}
.ck-gsw[aria-checked="true"] .tr{background:#b45309}
.ck-gsw[aria-checked="true"] .tr::after{left:14px}
.ck-gsw .st{font-weight:600;color:var(--muted,#6b6259);min-width:2em;text-align:left}
.ck-gsw:focus-visible{outline:2px solid #b45309;outline-offset:2px}
@media (max-width:860px){.ck-gsw>span:first-child{display:none}}
.ck-gband{background:var(--panel,#fff);border:1px solid var(--line,#e6dfd6);border-left:4px solid #b45309;border-radius:12px;padding:10px 14px 12px 12px;margin:0 0 14px}
.ck-gbh{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px}
.ck-gtag{font-size:12px;font-weight:700;color:#b45309;background:#fef3c7;border-radius:6px;padding:0 6px}
.ck-goff{margin-left:auto;font-size:12px;font-weight:600;color:var(--muted,#6b6259);text-decoration:underline;background:none;border:0;cursor:pointer;min-height:28px}
.ck-gband ol{list-style:none;margin:0;padding:0;display:grid;gap:3px}
.ck-gband li button{display:flex;gap:10px;align-items:baseline;text-align:left;background:none;border:0;cursor:pointer;font:inherit;font-size:13px;color:var(--fg,#1a1a1a);padding:2px 4px;margin:0 -4px;border-radius:6px;line-height:1.55}
.ck-gband li button:hover{background:var(--soft,#f7f3ee)}
.ck-gd{font-size:12px;color:var(--muted,#6b6259);margin-left:10px}
.ck-gpin{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#b45309;color:#fff;font-size:12px;font-weight:800;line-height:1;flex:none;vertical-align:middle;font-style:normal}
.ck-gpin[data-gpin]{margin-right:6px}
.ck-gpulse{animation:ckgp 1.1s ease-out 2}
@keyframes ckgp{0%{box-shadow:0 0 0 0 rgba(180,83,9,.55)}100%{box-shadow:0 0 0 12px rgba(180,83,9,0)}}
@media (prefers-reduced-motion:reduce){.ck-gpulse{animation:none;outline:3px solid #b45309;outline-offset:2px}}
.ck-gcap{font-size:12px;color:var(--faint,#736a62);padding:0 10px 6px;line-height:1.5}
@media (max-width:860px){.ck-gd{display:block;margin-left:0}}
`;
