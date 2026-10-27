// src/screens/StockView.jsx
// 2026-10-23 作り直し 1便：ネタ帳とアウトプットの「フォルダ → 表」の画面。
// 編集画面（EditorModal）には触らない。行を押すと今の編集画面がそのまま開く。
// ネタは今までどおり投稿の表の「状態＝アイデア」の行。データベースの形は変えていない。
//   ネタ帳：フォルダ＝種類（post_type）、表＝ジャンル（genre・一覧は sheet_genres）。ジャンルが空のネタが受け箱
//   アウトプット：フォルダ＝種類 › 年、表＝月（予定日から作る）。予定日が無いものは「日時なし」の表
//   寝かせ・育て中は、今ある「ラベル」の欄に印を付けて持つ
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { POST_TYPE, getPostTypeStyle, STATUS, genId, nowStr, fmtDate, stripHtml } from "../constants.js";
import { dbFetchSheetGenres, dbAddSheetGenre } from "../lib/supabase.js";
import { slotMatchesDate } from "./CalendarView.jsx";

// ── 見た目（スワイプくん・思考整理くんと同じ色と形） ─────────
export const CK_CSS = `
.ck{--bg:#f5f0eb;--panel:#fff;--soft:#f7f3ee;--hair:#f3eee8;--line:#e6dfd6;--fg:#1a1a1a;--muted:#6b6259;--faint:#a8a09a;--rowhover:#fffbf5;
  --accent:#f59e0b;--accent-ink:#b45309;--accent-bg:#fef3c7;--accent-line:#fcd34d;--accent-soft:rgba(245,158,11,.2);--ink:#1a1a1a;--on-ink:#fff;--ok:#047857;--warn:#b91c1c;
  --shadow:0 1px 2px rgba(60,40,20,.05),0 8px 24px rgba(60,40,20,.09);
  --s-idea:#c2410c;--s-draft:#6b7280;--s-review:#d97706;--s-wait:#2563eb;--s-res:#7c3aed;--s-pub:#059669;
  font-family:'Geist','Hiragino Sans','Noto Sans JP',system-ui,sans-serif;color:var(--fg);font-size:14px}
:where(.ck) *{box-sizing:border-box}
:where(.ck) :where(button){cursor:pointer;background:none;border:0;padding:0;font-family:inherit;font-size:inherit;color:inherit}
.ck :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.ck-top{display:flex;align-items:center;gap:12px;height:52px;padding:0 16px;background:var(--panel);border-bottom:1px solid var(--line);position:relative;z-index:50}
.ck-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;letter-spacing:-.02em;white-space:nowrap}
.ck-brand b{color:var(--accent)}
.ck-acc{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 10px 0 9px;border:1px solid var(--line)!important;border-radius:9px;background:var(--panel)!important;font-size:12.5px;font-weight:700;white-space:nowrap;position:relative}
.ck-acc:hover{background:var(--soft)!important}
.ck-acc i{width:9px;height:9px;border-radius:50%;flex:none}
.ck-acc small{font-weight:600;color:var(--faint)}
.ck-accpop{position:absolute;left:0;top:calc(100% + 6px);z-index:120;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:6px;width:260px;display:flex;flex-direction:column;gap:2px}
.ck-accpop .h{font-size:11px;font-weight:700;color:var(--faint);padding:6px 8px 4px}
.ck-accpop button{display:flex!important;align-items:center;gap:9px;padding:8px!important;border-radius:8px;text-align:left;font-size:13px;font-weight:600}
.ck-accpop button:hover,.ck-accpop button.on{background:var(--soft)!important}
.ck-accpop button i{width:9px;height:9px;border-radius:50%}
.ck-accpop button small{margin-left:auto;font-size:11px;color:var(--faint)}
.ck-accline{height:3px;flex:none}
.ck-hm{display:flex;gap:2px;height:100%;overflow-x:auto}
.ck-hm button{font-size:13px;font-weight:700;color:var(--muted);padding:0 12px!important;border-bottom:2.5px solid transparent!important;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:0}
.ck-hm button:hover{color:var(--fg)}
.ck-hm button.on{color:var(--fg);border-bottom-color:var(--accent)!important}
.ck-hm .n{font-size:11px;color:var(--faint);font-weight:600}
.ck-q{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px!important;border:1px solid var(--line)!important;border-radius:8px;color:var(--faint);font-size:12.5px;background:var(--soft)!important;min-width:170px}
.ck-q:hover{color:var(--muted)}
.ck-kbd{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;font-weight:600;color:var(--faint);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;line-height:16px;background:var(--panel);margin-left:auto}
.ck-screen{display:flex;min-height:calc(100vh - 55px);position:relative}
.ck-nav{width:236px;flex:none;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:12px 10px;position:sticky;top:0;align-self:flex-start;height:calc(100vh - 55px);overflow:auto}
.ck-nh{padding:14px 10px 4px;font-size:11px;font-weight:700;color:var(--faint);letter-spacing:.05em;display:flex;justify-content:space-between;align-items:center}
.ck-nv{display:flex!important;align-items:center;gap:9px;width:100%;min-height:32px;padding:0 10px!important;border-radius:8px;font-size:13px;font-weight:500;color:var(--muted);text-align:left}
.ck-nv:hover{background:var(--soft)!important}
.ck-nv.on{background:var(--bg)!important;color:var(--fg);font-weight:700}
.ck-nv svg{flex:none;color:var(--faint)}
.ck-nv.on svg{color:var(--accent-ink)}
.ck-nv .l{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ck-nv .n{font-size:11px;color:var(--faint);font-weight:600;font-variant-numeric:tabular-nums}
.ck-nv.warn .n{color:var(--accent-ink);background:var(--accent-bg);border-radius:99px;padding:0 7px}
.ck-nv.d1{padding-left:26px!important}.ck-nv.d2{padding-left:42px!important}
.ck-nav-foot{margin-top:auto;padding:10px 8px 0;border-top:1px solid var(--hair);font-size:11.5px;color:var(--faint);line-height:1.6}
.ck-main{flex:1;min-width:0}
.ck-wrap{max-width:1180px;margin:0 auto;padding:20px 16px 72px;display:flex;flex-direction:column;gap:12px}
.ck-crumb{font-size:12px;color:var(--faint);font-weight:600}
.ck-title{font-size:26px;font-weight:800;letter-spacing:-.02em;margin:2px 0 0;line-height:1.25}
.ck-note{font-size:13px;color:var(--muted);line-height:1.7;max-width:72ch;margin:0}
.ck-tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);overflow-x:auto}
.ck-tab{font-size:14px;font-weight:700;color:var(--muted);padding:9px 14px 8px!important;border-bottom:2.5px solid transparent!important;margin-bottom:-1px;white-space:nowrap;display:inline-flex!important;gap:7px;align-items:center;border-radius:0}
.ck-tab:hover{color:var(--fg)}
.ck-tab.on{color:var(--fg);border-bottom-color:var(--accent)!important}
.ck-tab .n{font-size:11px;color:var(--faint);font-weight:600}
.ck-tab.add{color:var(--faint);font-weight:600;font-size:13px}
.ck-tabadd{display:inline-flex;align-items:center;gap:6px;padding:4px 8px}
.ck-tabadd input{height:28px;border:1px solid var(--accent);border-radius:7px;padding:0 8px;font-size:13px;width:140px;outline:none}
.ck-vrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ck-vtabs{display:inline-flex;gap:2px;flex-wrap:wrap}
.ck-vtab{font-size:12.5px;font-weight:600;padding:5px 10px!important;border-radius:7px;color:var(--muted);display:inline-flex!important;align-items:center;gap:6px;white-space:nowrap}
.ck-vtab:hover{background:var(--soft)!important;color:var(--fg)}
.ck-vtab.on{background:var(--panel)!important;color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ck-chip-f{font-size:12px;font-weight:600;color:var(--muted);background:var(--panel)!important;border:1px solid var(--line)!important;border-radius:99px;padding:0 10px!important;height:28px;display:inline-flex!important;align-items:center}
.ck-chip-f.on{border-color:var(--accent)!important;color:var(--accent-ink);background:var(--accent-bg)!important}
.ck-calf{display:flex;align-items:center;gap:5px;margin-left:auto;flex-wrap:wrap}
.ck-calf .ck-chip-f{height:26px;font-size:11.5px}
.ck-calf .sep{width:1px;height:16px;background:var(--line);margin:0 3px}
.ck-calf .sep:first-child,.ck-calf .sep:last-child{display:none}
.ck-search{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--faint);width:230px;max-width:100%;margin-left:auto}
.ck-search input{flex:1;min-width:0;border:0;background:transparent;font-size:13px;color:var(--fg);outline:none}
.ck-search:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.ck-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ck-tw{overflow-x:auto}
.ck-table{width:100%;border-collapse:collapse;min-width:880px}
.ck-table th{text-align:left;font-size:11.5px;font-weight:700;color:var(--faint);padding:0 12px;height:38px;white-space:nowrap;letter-spacing:.03em}
.ck-table td{padding:0 12px;height:54px;border-top:1px solid var(--hair);vertical-align:middle}
.ck-table tbody tr{cursor:pointer}
.ck-table tbody tr:hover{background:var(--rowhover)}
.ck-nm{font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px}
.ck-nm.empty{color:var(--faint);font-weight:500}
.ck-snip{font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px}
.ck-num{font-variant-numeric:tabular-nums;color:var(--muted);white-space:nowrap;font-size:12.5px}
.ck-dash{color:var(--line)}
.ck-st{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;white-space:nowrap}
.ck-st i{width:8px;height:8px;border-radius:50%;background:var(--c)}
.ck-stsel{appearance:none;-webkit-appearance:none;border:1px solid transparent;background:transparent;font:inherit;font-size:12px;font-weight:700;color:var(--fg);padding:4px 6px 4px 18px;border-radius:7px;cursor:pointer;background-repeat:no-repeat;background-position:6px center;background-size:8px 8px}
.ck-stsel:hover{border-color:var(--line);background-color:var(--panel)}
.ck-type{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:6px;white-space:nowrap;display:inline-flex}
.ck-score{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:6px;font-size:11.5px;font-weight:800;color:#fff}
.ck-src{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;border-radius:6px;padding:1px 6px;white-space:nowrap}
.ck-board{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;align-items:flex-start}
/* 2026-10-24 6便：列は画面幅に収める。空の列は細くして、中身のある列に幅を回す */
.ck-col{flex:1 1 0;min-width:180px;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:8px;min-height:120px}
.ck-col.drop{box-shadow:inset 0 0 0 2px var(--accent)}
.ck-col.empty{flex:0 0 150px;min-width:150px;background:transparent;border-style:dashed}
.ck-col-hint{font-size:11px;color:var(--faint);text-align:center;padding:14px 4px;border-radius:8px}
.ck-col.drop .ck-col-hint{color:var(--accent-ink)}
.ck-colh{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;padding:4px 6px;white-space:nowrap}
.ck-colh i{width:8px;height:8px;border-radius:50%;background:var(--c)}
.ck-colh .n{color:var(--faint);font-weight:600;font-size:11.5px}
.ck-colh .w{margin-left:auto;font-size:10.5px;font-weight:700;color:var(--warn)}
.ck-bcard{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;text-align:left;display:flex;flex-direction:column;gap:7px;cursor:grab;position:relative}
.ck-bcard:hover{border-color:var(--accent-line)}
.ck-bcard.dragging{opacity:.4}
.ck-bt{font-size:13px;font-weight:600;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ck-bft{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--faint)}
.ck-cap{display:flex;flex-direction:column;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.ck-cap:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.ck-cap textarea{border:0;outline:none;resize:none;font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:15px;line-height:1.7;background:transparent;min-height:52px;width:100%;color:var(--fg)}
.ck-capft{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--faint)}
.ck-capft .ck-kbd{margin-left:0}
.ck-keys{display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--faint);align-items:center}
.ck-keys span{display:inline-flex;gap:4px;align-items:center}
.ck-keys .ck-kbd{margin:0}
.ck-irow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;border-top:1px solid var(--hair);cursor:default}
.ck-irow:first-child{border-top:0}
.ck-irow.sel{background:var(--accent-bg);box-shadow:inset 3px 0 0 var(--accent)}
.ck-it{font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:14px;line-height:1.65;overflow-wrap:anywhere;cursor:pointer}
.ck-it.empty{color:var(--faint)}
.ck-im{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--faint);margin-top:4px}
.ck-ia{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.ck-sel{height:30px;font-size:12px;font-weight:600;border:1px solid var(--line);border-radius:8px;padding:0 8px;background:var(--panel);color:var(--muted);max-width:180px;font-family:inherit}
.ck-go{font-size:12px;font-weight:700;color:var(--accent-ink)!important;border:1px solid var(--accent-line)!important;background:var(--accent-bg)!important;border-radius:8px;padding:0 9px!important;min-height:28px;display:inline-flex!important;align-items:center;gap:4px;white-space:nowrap}
.ck-go:hover{filter:brightness(.97)}
.ck-ghost{font-size:12.5px;font-weight:600;border:1px solid var(--line)!important;border-radius:8px;padding:0 11px!important;min-height:30px;background:var(--panel)!important;color:var(--muted);white-space:nowrap;display:inline-flex!important;align-items:center;gap:6px}
.ck-ghost:hover{background:var(--soft)!important;color:var(--fg)}
.ck-ink{background:var(--ink)!important;color:var(--on-ink)!important;font-weight:700;font-size:12.5px;padding:0 14px!important;border-radius:8px;display:inline-flex!important;align-items:center;justify-content:center;gap:6px;white-space:nowrap;min-height:34px}
.ck-ink:hover{opacity:.88}
.ck-ink[disabled]{opacity:.45;cursor:default}
.ck-empty{color:var(--faint);text-align:center;padding:28px 12px;font-size:13px}
.ck-scrim{position:fixed;inset:0;z-index:700;background:rgba(20,14,8,.3);display:flex;align-items:flex-start;justify-content:center;padding:12vh 16px 16px}
.ck-modal{width:min(620px,100%);background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.ck-modal textarea{display:block;width:100%;border:0;outline:none;resize:none;padding:16px 18px 6px;font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:17px;line-height:1.7;background:transparent;min-height:96px;color:var(--fg)}
.ck-mft{display:flex;align-items:center;gap:6px;padding:8px 12px 10px 18px;flex-wrap:wrap;font-size:12px;color:var(--faint)}
.ck-mft .ck-kbd{margin:0}
.ck-mft .ck-ink{margin-left:auto}
.ck-hits{border-top:1px solid var(--hair);max-height:240px;overflow:auto}
.ck-hit{display:flex!important;gap:10px;align-items:center;width:100%;padding:8px 18px!important;text-align:left;font-size:13px}
.ck-hit:hover,.ck-hit.on{background:var(--soft)!important}
.ck-hit span.t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ck-mrow{display:flex;flex-direction:column;gap:6px;padding:4px 18px 10px}
.ck-mrow>span{font-size:11.5px;font-weight:700;color:var(--faint)}
.ck-mti{font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:16px;font-weight:700;line-height:1.5;padding:16px 18px 8px}
.ck-pick{display:flex;flex-wrap:wrap;gap:5px}
.ck-pk{height:30px;padding:0 11px!important;border-radius:8px;border:1px solid var(--line)!important;background:var(--panel)!important;color:var(--muted);font-size:12.5px;font-weight:600}
.ck-pk:hover{border-color:var(--accent)!important;color:var(--fg)}
.ck-pk.on{background:var(--accent-bg)!important;border-color:var(--accent)!important;color:var(--fg)}
.ck-pk[disabled]{opacity:.45;cursor:default}
/* 予約の一拍（予約済みにした瞬間、0.6 秒だけ） */
.ck-pop{position:relative}
.ck-pop::after{content:"";position:absolute;right:10px;top:50%;width:18px;height:18px;margin-top:-9px;border-radius:50%;background:var(--ok);animation:ckpop .6s ease-out forwards}
.ck-pop::before{content:"";position:absolute;right:16px;top:50%;width:5px;height:10px;margin-top:-7px;border:solid #fff;border-width:0 2px 2px 0;z-index:1;transform:rotate(45deg) scale(0);animation:ckchk .45s .1s cubic-bezier(.3,1.6,.5,1) forwards}
td.ck-pop{background:color-mix(in srgb,var(--ok) 8%,transparent)}
.ck-cap textarea:focus-visible,.ck-modal textarea:focus-visible{outline:none}
@keyframes ckpop{0%{transform:scale(0)}55%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes ckchk{to{transform:rotate(45deg) scale(1)}}
@media (prefers-reduced-motion:reduce){.ck-pop::after,.ck-pop::before{animation:none;transform:rotate(45deg) scale(1)}}
.ck-nav.off{display:none}
/* 小さなボタン（PlanView・FindView でも使う。2 か所に別々にあった決まりを 1 つにした） */
.ck-mini{font-size:11px;font-weight:700;color:var(--accent-ink);border:1px solid var(--accent-line)!important;background:var(--accent-bg)!important;border-radius:6px;padding:1px 7px!important;margin-left:auto;white-space:nowrap}
.ck-mini:hover{filter:brightness(.97)}
@media (max-width:860px){
  .ck-nav{position:fixed;left:0;top:55px;bottom:0;height:auto;z-index:60;box-shadow:var(--shadow)}
  .ck-q .ql,.ck-q .ck-kbd{display:none}.ck-q{min-width:0}
  .ck-acc small{display:none}
  .ck-irow{grid-template-columns:minmax(0,1fr)}.ck-ia{justify-content:flex-start}.ck-keys{display:none}
}
@media (max-width:760px){.ck-top{flex-wrap:wrap;height:auto;padding-top:8px;row-gap:2px}.ck-hm{order:10;width:100%;height:40px}.ck-screen{min-height:calc(100vh - 100px)}.ck-nav{top:100px}}
@media (max-width:560px){.ck-brand span{display:none}.ck-hm button{padding:0 7px!important;font-size:12.5px}.ck-hm .n{display:none}.ck-top{gap:8px}}
`;

// ── 小さな部品 ─────────────────────────────────────
export const BRAND_ICON = (
  <svg width="24" height="24" viewBox="0 0 128 128" aria-hidden="true"><defs><clipPath id="ckc"><path d="M44 0H114A14 14 0 0 1 128 14V84A44 44 0 0 1 84 128H14A14 14 0 0 1 0 114V44A44 44 0 0 1 44 0Z"/></clipPath><mask id="ckm"><rect width="128" height="128" fill="#fff"/><g fill="#000"><circle cx="132" cy="40" r="19"/><circle cx="-4" cy="90" r="19"/></g></mask></defs><g mask="url(#ckm)"><g clipPath="url(#ckc)"><rect width="128" height="128" fill="#ea580c"/><path d="M0 128V58C34 58 40 82 64 82S94 104 128 104V128Z" fill="#000" fillOpacity=".22"/></g><g transform="translate(14 14) scale(4.17)" fill="none" stroke="#fff" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 19.5h4l10.2-10.2a2.1 2.1 0 0 0-3-3L5.5 16.5z"/><path d="M14 7.5l3 3"/></g></g></svg>
);
const I = {
  inbox: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/></svg>,
  folder: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h3.5l2 2h7.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>,
  table: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 10v9"/></svg>,
  week: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>,
  pen: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 19.5h4l10.2-10.2a2.1 2.1 0 0 0-3-3L5.5 16.5z"/></svg>,
  moon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>,
  list: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>,
  board: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="5" height="16" rx="1.5"/><rect x="11" y="4" width="5" height="10" rx="1.5"/><rect x="18" y="4" width="2" height="6" rx="1"/></svg>,
  sheet: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M4 14h16M10 4v16"/></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>,
  down: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>,
  link: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>,
};
const ST_COLOR = { idea: "var(--s-idea)", draft: "var(--s-draft)", review: "var(--s-review)", waiting: "var(--s-wait)", reserved: "var(--s-res)", published: "var(--s-pub)" };
const SCORE_BG = { S: "#7c3aed", A: "#2563eb", B: "#059669", C: "#d97706", D: "#dc2626" };
const OUT_FLOW = ["draft", "review", "waiting", "reserved", "published"];
const SLEEP = "寝かせ", GROW = "育て中";
const W = ["日", "月", "火", "水", "木", "金", "土"];
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 覚えられなくても動く */ } } };
export const fmtDt = dt => { if (!dt) return ""; const d = new Date(dt.length === 16 ? dt + ":00" : dt); if (isNaN(d)) return dt; return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]}) ${dt.slice(11, 16)}`; };
// 表の日時（UTC）を日本の時刻の「YYYY-MM-DDTHH:MM」にする
const toLocal = iso => { const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z"); if (isNaN(d)) return iso.slice(0, 16); const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
const kNum = n => n == null ? "" : n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, "") + "万" : Number(n).toLocaleString();
const textOf = p => stripHtml(p.body || "").replace(/&nbsp;/g, " ").trim();
const headOf = p => (p.title || "").trim() || (p.memo || "").trim().split("\n")[0] || textOf(p).slice(0, 60);
// 入れた日時（保存直後で表の日時がまだ無いときは、番号に入っている作った時刻を使う）
const bornOf = p => p.created_at || (p.id > 1e15 ? new Date(Math.floor(p.id / 1000)).toISOString() : "");
const stageOf = p => (p.labels || []).includes(SLEEP) ? "sleep" : (p.labels || []).includes(GROW) ? "grow" : "seed";
const STAGE = { seed: { l: "種", c: "var(--s-idea)" }, grow: { l: "育て中", c: "var(--s-review)" }, sleep: { l: "寝かせ", c: "var(--s-wait)" } };
function weekRange(today) { const d = new Date(today + "T00:00"); const day = d.getDay(); const mon = new Date(d); mon.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return [fmtDate(mon), fmtDate(sun)]; }

function StTag({ s }) { const st = STATUS[s] || { label: s }; return <span className="ck-st" style={{ "--c": ST_COLOR[s] }}><i />{st.label}</span>; }
function TypeTag({ t, postTypes }) { const pt = getPostTypeStyle(t, postTypes); return <span className="ck-type" style={{ color: pt.color, background: pt.bg }}>{pt.label}</span>; }
// 2026-10-24 6便：空欄には記号を置かない（「—」が並ぶと、値のある行が埋もれるため）
function Score({ s }) { return s ? <span className="ck-score" style={{ background: SCORE_BG[s] || "#999" }}>{s}</span> : null; }
function Srcs({ p }) {
  const n = (p.memoLinks || []).length;
  if (!p.mm_url && !n) return null;
  return <span style={{ display: "inline-flex", gap: 4 }}>
    {p.mm_url && <span className="ck-src" style={{ color: "#7c3aed", background: "#ede9fe" }}>思考整理</span>}
    {n > 0 && <span className="ck-src" style={{ color: "#6b6259", background: "#f3eee8" }}>{I.link}{n}</span>}
  </span>;
}
function Nv({ on, icon, label, n, cls = "", onClick, onDragOver, onDrop }) {
  return <button className={`ck-nv ${cls} ${on ? "on" : ""}`} onClick={onClick} onDragOver={onDragOver} onDrop={onDrop}>{icon}<span className="l">{label}</span><span className="n">{n}</span></button>;
}

// ── アカウントの切り替え（混ぜて出す画面は無い） ──────────────
export function AccountPill({ accounts, activeAcc, onPick, onManage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (!open) return; const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  return <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
    <button className="ck-acc" onClick={() => setOpen(o => !o)} aria-label="アカウントを切り替える">
      <i style={{ background: activeAcc?.color || "#ccc" }} /><span>{activeAcc?.name || "アカウント"}</span>{activeAcc?.handle && <small>{activeAcc.handle}</small>}{I.down}
    </button>
    {open && <div className="ck-accpop">
      <div className="h">アカウント（1 つずつ開く）</div>
      {accounts.map(a => <button key={a.id} className={a.id === activeAcc?.id ? "on" : ""} onClick={() => { setOpen(false); onPick(a.id); }}><i style={{ background: a.color }} />{a.name}<small>{a.handle}</small></button>)}
      {onManage && <button onClick={() => { setOpen(false); onManage(); }} style={{ color: "var(--faint)", fontSize: 12 }}>アカウントを足す・直す</button>}
    </div>}
  </div>;
}

// ── 次の空き枠（予約枠の設定から） ───────────────────────
export function nextFreeSlot({ slots, posts, postType, today, now = new Date() }) {
  const sl = (slots || []).filter(s => (s.postType || "x_post") === postType);
  if (!sl.length) return "";
  const taken = new Set((posts || []).map(p => p.datetime).filter(Boolean));
  const hhmm = s => s.time || (s.hour != null ? String(s.hour).padStart(2, "0") + ":00" : "00:00");
  const nowT = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  for (let i = 0; i < 28; i++) {
    const d = new Date(today + "T00:00"); d.setDate(d.getDate() + i);
    const ds = fmtDate(d);
    const cands = sl.filter(s => slotMatchesDate(s, d)).map(hhmm).sort();
    for (const t of cands) { if (i === 0 && t <= nowT) continue; const dt = `${ds}T${t}`; if (!taken.has(dt)) return dt; }
  }
  return "";
}

// ── ネタ → アウトプット の窓 ─────────────────────────────
export function ToOutModal({ post, postTypes, slots, posts, today, onClose, onGo }) {
  const keys = Object.keys(postTypes);
  const [type, setType] = useState(post.postType || "x_post");
  const slot = useMemo(() => nextFreeSlot({ slots, posts, postType: type, today }), [slots, posts, type, today]);
  const [when, setWhen] = useState("slot");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const go = () => onGo({ type, datetime: when === "slot" && slot ? slot : "" });
  return <div className="ck-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="ck-modal" role="dialog" aria-label="アウトプットにする" tabIndex={-1} ref={ref} onKeyDown={e => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && !e.nativeEvent.isComposing && e.target.tagName !== "BUTTON") go(); }}>
      <div className="ck-mti">{headOf(post) || "（空のネタ）"}</div>
      <div className="ck-mrow"><span>何にする</span><div className="ck-pick">{keys.map(k => <button key={k} className={`ck-pk ${k === type ? "on" : ""}`} onClick={() => setType(k)}>{postTypes[k].label}</button>)}</div></div>
      <div className="ck-mrow"><span>いつ出す</span><div className="ck-pick">
        <button className={`ck-pk ${when === "slot" && slot ? "on" : ""}`} disabled={!slot} onClick={() => setWhen("slot")}>{slot ? `次の空き枠 ${fmtDt(slot)}` : "この種類の予約枠が無い"}</button>
        <button className={`ck-pk ${when === "none" || !slot ? "on" : ""}`} onClick={() => setWhen("none")}>まだ決めない</button>
      </div></div>
      <div className="ck-mft"><span>状態が「下書き」になり、アウトプットの表へ移る。今の編集画面が開く</span><button className="ck-ink" onClick={go}>書き始める</button></div>
    </div>
  </div>;
}

// ── ネタ帳とアウトプットの画面 ────────────────────────────
export function StockView({ mode, uid, owner = false, accountId, posts, postTypes, slots, today, readOnly,
  onOpen, saveToDb, patchFields, changeStatus, onDelete, showToast, onToOut, renderSheet, navOn, setNavOn, keysOff }) {
  const keyBase = `contentos.stock.${accountId}`;
  const [loc, setLocRaw] = useState(() => store.get(`${keyBase}.${mode}`, mode === "idea" ? "inbox" : "week"));
  const setLoc = l => { setLocRaw(l); store.set(`${keyBase}.${mode}`, l); setFSt(null); setQ(""); if (window.innerWidth <= 860) setNavOn(false); };
  useEffect(() => { setLocRaw(store.get(`${keyBase}.${mode}`, mode === "idea" ? "inbox" : "week")); }, [keyBase, mode]);
  const [view, setViewRaw] = useState(() => store.get(`contentos.stock.view.${mode}`, "table"));
  const setView = v => { setViewRaw(v); store.set(`contentos.stock.view.${mode}`, v); };
  const [fSt, setFSt] = useState(null);
  const [q, setQ] = useState("");
  const [genres, setGenres] = useState([]);
  const [addingGenre, setAddingGenre] = useState(false);
  const [pop, setPop] = useState(null);
  const [sel, setSel] = useState(0);
  const [cap, setCap] = useState("");
  useEffect(() => { if (!uid) return; dbFetchSheetGenres(uid).then(setGenres).catch(e => console.warn("[ContentOS genres]", e?.message || e)); }, [uid]);
  const genreNames = genres.map(g => g.name);

  const ideas = useMemo(() => posts.filter(p => p.status === "idea"), [posts]);
  const outs = useMemo(() => posts.filter(p => p.status !== "idea"), [posts]);
  const inbox = useMemo(() => ideas.filter(p => !p.genre && stageOf(p) !== "sleep").sort((a, b) => bornOf(b).localeCompare(bornOf(a)) || b.id - a.id), [ideas]);

  // 状態を変える（予約済みは日時が要る。無いときは日時未定に）＋予約の一拍
  const setStatus = useCallback(async (p, s) => {
    let next = s;
    if (s === "reserved" && !p.datetime) { next = "waiting"; showToast("予約済みには日時が要るので、日時未定にしました"); }
    if (next === p.status) return;
    await changeStatus(p.id, next, p.score ?? null);
    if (next === "reserved") { setPop(p.id); setTimeout(() => setPop(x => x === p.id ? null : x), 900); }
  }, [changeStatus, showToast]);
  const patch = useCallback(async (p, fields, msg) => { const ok = patchFields ? await patchFields(p, fields) : await saveToDb({ ...p, ...fields }); if (ok && msg) showToast(msg); return ok; }, [patchFields, saveToDb, showToast]);
  const toggleLabel = useCallback((p, label, on) => { const ls = new Set(p.labels || []); if (on) ls.add(label); else ls.delete(label); if (label === SLEEP && on) ls.delete(GROW); if (label === GROW && on) ls.delete(SLEEP); return patch(p, { labels: [...ls] }); }, [patch]);
  const addIdea = useCallback(async ({ title, memo, genre = null, postType = "x_post", count = true }) => {
    const p = { id: genId(), account_id: accountId, status: "idea", datetime: "", title, memo, postType, body: "", memoLinks: [], comments: [], history: [{ at: nowStr(), note: "受け箱に入れた" }], labels: [], genre, theme: null, mm_url: null, manabu: false };
    const ok = await saveToDb(p, { count });
    if (ok) showToast(genre ? `「${genre}」に入れました` : "受け箱に入れました");
    return ok;
  }, [accountId, saveToDb, showToast]);
  // 3便：Claude が付けた「案：ジャンル」を採用・却下する（採用するとジャンルに入り、受け箱から出る）
  const addedG = useRef(new Set());
  const anOf = p => (p.labels || []).filter(l => /^案[:：]/.test(l)).map(l => ({ l, g: l.replace(/^案[:：]\s*/, "").trim() })).filter(x => x.g);
  const adoptAn = async (p, g, quiet) => {
    if (!genreNames.includes(g) && !addedG.current.has(g)) { addedG.current.add(g); try { const ng = await dbAddSheetGenre(uid, g, genres.length); setGenres(x => x.some(y => y.name === g) ? x : [...x, ng]); } catch (e) { showToast("表を足せませんでした：" + (e.message || e)); return false; } }
    return patch(p, { genre: g, labels: (p.labels || []).filter(l => !/^案[:：]/.test(l)), history: [...(p.history || []), { at: nowStr(), note: `Claude の案で「${g}」へ振り分けた` }] }, quiet ? null : `「${g}」へ入れました`);
  };
  const rejectAn = (p, l) => patch(p, { labels: (p.labels || []).filter(x => x !== l) });
  // 4便：今日の掘り起こし（受け箱の上に 1 件だけ）。評価 S の公開済みか、寝かせたネタから日替わりで選ぶ
  const [digOff, setDigOff] = useState(() => store.get("contentos.dig.off", "") === today);
  const dig = useMemo(() => {
    const best = posts.filter(p => p.status === "published" && p.score === "S");
    const sleep = posts.filter(p => p.status === "idea" && stageOf(p) === "sleep");
    const all = [...best.map(p => ({ k: "post", p })), ...sleep.map(p => ({ k: "idea", p }))];
    if (!all.length) return null;
    const n = Math.floor(new Date(today + "T00:00").getTime() / 864e5);
    return all[n % all.length];
  }, [posts, today]);
  const digAgain = async p => { if (await addIdea({ title: `（もう一度）${headOf(p)}`, memo: `前に出した 1 本を、切り口を変えてもう一度。${p.datetime ? `前回 ${fmtDt(p.datetime)}` : ""}${p.impressions != null ? `・${kNum(p.impressions)} インプ` : ""}`, count: false })) { setDigOff(true); store.set("contentos.dig.off", today); } };
  const addGenre = async name => { const n = name.trim(); setAddingGenre(false); if (!n || genreNames.includes(n)) return; try { const g = await dbAddSheetGenre(uid, n, genres.length); setGenres(x => [...x, g]); setLoc(`it:${loc.split(":")[1]}:${n}`); } catch (e) { showToast("表を足せませんでした：" + (e.message || e)); } };

  // ── 左のメニュー ──
  const typeKeys = Object.keys(postTypes);
  let nav, rows = [], crumb = "", title = "", note = "", tabs = null;
  const [wFrom, wTo] = weekRange(today);
  if (mode === "idea") {
    const live = ideas.filter(p => p.genre && stageOf(p) !== "sleep");
    const shownTypes = typeKeys.filter(t => t === "x_article" || t === "x_post" || live.some(p => (p.postType || "x_post") === t));
    const dropTo = (genre, type) => ({ onDragOver: e => e.preventDefault(), onDrop: e => { e.preventDefault(); const p = posts.find(x => String(x.id) === e.dataTransfer.getData("text/ck")); if (p) patch(p, { genre, postType: type, labels: (p.labels || []).filter(l => l !== SLEEP) }, `「${genre}」へ入れました`); } });
    nav = <>
      <Nv on={loc === "inbox"} icon={I.inbox} label="受け箱" n={inbox.length} cls="warn" onClick={() => setLoc("inbox")} />
      <div className="ck-nh">フォルダ</div>
      {shownTypes.map(t => { const inT = live.filter(p => (p.postType || "x_post") === t); return <React.Fragment key={t}>
        <Nv on={loc === `if:${t}`} icon={I.folder} label={postTypes[t].label} n={inT.length} onClick={() => setLoc(`if:${t}`)} />
        {genreNames.filter(g => inT.some(p => p.genre === g) || loc === `it:${t}:${g}`).map(g => <Nv key={g} cls="d1" on={loc === `it:${t}:${g}`} icon={I.table} label={g} n={inT.filter(p => p.genre === g).length} onClick={() => setLoc(`it:${t}:${g}`)} {...dropTo(g, t)} />)}
      </React.Fragment>; })}
      <div className="ck-nh">しまったもの</div>
      <Nv on={loc === "sleep"} icon={I.moon} label="寝かせ中" n={ideas.filter(p => stageOf(p) === "sleep").length} onClick={() => setLoc("sleep")} />
    </>;
    if (loc === "sleep") { rows = ideas.filter(p => stageOf(p) === "sleep"); crumb = "ネタ帳"; title = "寝かせ中"; note = "今は書かないが捨てたくないもの。時期が来たら「起こす」。"; }
    else if (loc.startsWith("if:")) { const t = loc.slice(3); rows = live.filter(p => (p.postType || "x_post") === t); crumb = "ネタ帳"; title = postTypes[t]?.label || t; }
    else if (loc.startsWith("it:")) {
      const [, t, g] = loc.split(":"); rows = live.filter(p => (p.postType || "x_post") === t && p.genre === g); crumb = `ネタ帳 › ${postTypes[t]?.label || t}`; title = g;
      tabs = <div className="ck-tabs">{genreNames.map(x => <button key={x} className={`ck-tab ${x === g ? "on" : ""}`} onClick={() => setLoc(`it:${t}:${x}`)}>{x}<span className="n">{live.filter(p => (p.postType || "x_post") === t && p.genre === x).length}</span></button>)}
        {addingGenre ? <span className="ck-tabadd"><input autoFocus placeholder="表の名前（ジャンル）" onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addGenre(e.currentTarget.value); if (e.key === "Escape") setAddingGenre(false); }} onBlur={e => addGenre(e.currentTarget.value)} /></span>
          : !readOnly && <button className="ck-tab add" onClick={() => setAddingGenre(true)}>＋ 表</button>}</div>;
    }
  } else {
    const byType = t => outs.filter(p => (p.postType || "x_post") === t);
    const shownTypes = typeKeys.filter(t => byType(t).length || t === "x_article" || t === "x_post");
    const weekRows = outs.filter(p => p.datetime && p.datetime.slice(0, 10) >= wFrom && p.datetime.slice(0, 10) <= wTo && !["reserved", "published"].includes(p.status));
    const drafts = outs.filter(p => p.status === "draft");
    nav = <>
      <Nv on={loc === "week"} icon={I.week} label="今週書くもの" n={weekRows.length} onClick={() => setLoc("week")} />
      <Nv on={loc === "draft"} icon={I.pen} label="書きかけ" n={drafts.length} cls={drafts.length > 3 ? "warn" : ""} onClick={() => setLoc("draft")} />
      <div className="ck-nh">フォルダ</div>
      {shownTypes.map(t => {
        const ps = byType(t);
        const years = [...new Set(ps.filter(p => p.datetime).map(p => p.datetime.slice(0, 4)))].sort().reverse();
        const nodate = ps.filter(p => !p.datetime);
        const curYear = (loc.startsWith(`ot:${t}:`) && loc.split(":")[2]) || "";
        return <React.Fragment key={t}>
          <Nv on={loc === `of:${t}`} icon={I.folder} label={postTypes[t].label} n={ps.length} onClick={() => setLoc(`of:${t}`)} />
          {years.map(y => { const inY = ps.filter(p => p.datetime?.startsWith(y)); const months = [...new Set(inY.map(p => p.datetime.slice(5, 7)))].sort().reverse(); const open = curYear.startsWith(y) || y === today.slice(0, 4); return <React.Fragment key={y}>
            <Nv cls="d1" on={false} icon={I.folder} label={`${y.slice(2)}年`} n={inY.length} onClick={() => setLoc(`ot:${t}:${y}-${months[0]}`)} />
            {open && months.map(m => <Nv key={m} cls="d2" on={loc === `ot:${t}:${y}-${m}`} icon={I.table} label={`${+m}月`} n={inY.filter(p => p.datetime.slice(5, 7) === m).length} onClick={() => setLoc(`ot:${t}:${y}-${m}`)} />)}
          </React.Fragment>; })}
          {nodate.length > 0 && <Nv cls="d1" on={loc === `ot:${t}:none`} icon={I.table} label="日時なし" n={nodate.length} onClick={() => setLoc(`ot:${t}:none`)} />}
        </React.Fragment>;
      })}
    </>;
    if (loc === "week") { rows = weekRows; crumb = "アウトプット"; title = "今週書くもの"; note = `${wFrom.slice(5).replace("-", "/")}〜${wTo.slice(5).replace("-", "/")} に予定があり、まだ予約まで進んでいないもの。`; }
    else if (loc === "draft") { rows = drafts; crumb = "アウトプット"; title = "書きかけ"; note = drafts.length > 3 ? "書きかけが 4 本を超えている。新しく始めるより、仕上げるほうへ。" : ""; }
    else if (loc.startsWith("of:")) { const t = loc.slice(3); rows = byType(t); crumb = "アウトプット"; title = postTypes[t]?.label || t; }
    else if (loc.startsWith("ot:")) {
      const [, t, ym] = loc.split(":"); const ps = byType(t);
      rows = ym === "none" ? ps.filter(p => !p.datetime) : ps.filter(p => p.datetime?.startsWith(ym));
      crumb = `アウトプット › ${postTypes[t]?.label || t}`; title = ym === "none" ? "日時なし" : `${ym.slice(2, 4)}年 ${+ym.slice(5)}月`;
      const sib = ym === "none" ? [] : [...new Set(ps.filter(p => p.datetime?.startsWith(ym.slice(0, 4))).map(p => p.datetime.slice(0, 7)))].sort();
      if (sib.length) tabs = <div className="ck-tabs">{sib.map(x => <button key={x} className={`ck-tab ${x === ym ? "on" : ""}`} onClick={() => setLoc(`ot:${t}:${x}`)}>{+x.slice(5)}月<span className="n">{ps.filter(p => p.datetime?.startsWith(x)).length}</span></button>)}</div>;
    } else { rows = []; title = ""; }
  }

  const stList = mode === "idea" ? ["seed", "grow", "sleep"] : OUT_FLOW;
  const stOf = p => mode === "idea" ? stageOf(p) : p.status;
  const countSt = s => rows.filter(p => stOf(p) === s).length;
  let shown = fSt ? rows.filter(p => stOf(p) === fSt) : rows;
  if (q) { const qq = q.toLowerCase(); shown = shown.filter(p => (headOf(p) + " " + (p.memo || "") + " " + textOf(p)).toLowerCase().includes(qq)); }
  shown = [...shown].sort((a, b) => mode === "idea" ? bornOf(b).localeCompare(bornOf(a)) : (a.datetime || "9").localeCompare(b.datetime || "9"));

  // ── 受け箱をキーで裁く ──
  const inboxRef = useRef({ inbox, sel });
  inboxRef.current = { inbox, sel };
  useEffect(() => {
    if (mode !== "idea" || loc !== "inbox" || readOnly || keysOff) return;
    const h = e => {
      const tag = e.target.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
      if (tag === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;   // ボタンを押す Enter と重ねない
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector(".ck-scrim")) return;
      const { inbox: rs, sel: s } = inboxRef.current; const cur = rs[s];
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setSel(x => Math.min(x + 1, rs.length - 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setSel(x => Math.max(x - 1, 0)); }
      else if (!cur) return;
      else if (e.key === "1") { e.preventDefault(); onToOut(cur); }
      else if (e.key === "2") { e.preventDefault(); document.querySelector(`[data-gsel="${cur.id}"]`)?.focus(); }
      else if (e.key === "h" || e.key === "H") { e.preventDefault(); toggleLabel(cur, SLEEP, true).then(ok => ok && showToast("寝かせました")); }
      else if (e.key === "Enter" || e.key === "o") { e.preventDefault(); onOpen(cur); }
      else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); onDelete(cur); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [mode, loc, readOnly, keysOff, onToOut, onOpen, onDelete, toggleLabel, showToast]);
  useEffect(() => { if (sel >= inbox.length) setSel(Math.max(0, inbox.length - 1)); }, [inbox.length, sel]);

  const dragStart = p => e => { e.dataTransfer.setData("text/ck", String(p.id)); e.currentTarget.classList.add("dragging"); };
  const dragEnd = e => e.currentTarget.classList.remove("dragging");

  // ── 中身 ──
  let body;
  if (mode === "idea" && loc === "inbox") {
    body = <>
      <div className="ck-crumb">ネタ帳</div><h1 className="ck-title">受け箱</h1>
      <p className="ck-note">{owner ? "入れるときは何も決めない。分けるのは後でまとめて、キー 1 つで。サイドパネルや Claude から入れたネタもここに入る。たまったら、Claude とのチャットで「受け箱を振り分けて」と言うと、各ネタに「案」が付く。" : "入れるときは何も決めない。思いついたらここに書いて入れ、分けるのは後でまとめて、キー 1 つで。"}</p>
      {!readOnly && dig && !digOff && <div className="ck-cap" style={{ borderStyle: "dashed", gap: 6 }}>
        <div className="ck-capft" style={{ fontWeight: 700, color: "var(--accent-ink)" }}>今日の掘り起こし</div>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.5, cursor: "pointer" }} onClick={() => onOpen(dig.p)}>{headOf(dig.p) || "（タイトルなし）"}</div>
        <div className="ck-capft">{dig.k === "post" ? `${dig.p.datetime ? fmtDt(dig.p.datetime) + " に出して" : ""}${dig.p.impressions != null ? " " + kNum(dig.p.impressions) + " インプ" : ""}・評価 S。切り口を変えて、もう一度？` : "寝かせていたネタ。今なら書ける？"}
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>{dig.k === "post" ? <button className="ck-go" onClick={() => digAgain(dig.p)}>ネタにする</button> : <button className="ck-go" onClick={() => toggleLabel(dig.p, SLEEP, false).then(ok => { if (ok) { showToast("起こしました"); setDigOff(true); store.set("contentos.dig.off", today); } })}>起こす</button>}
            <button className="ck-ghost" style={{ minHeight: 28 }} onClick={() => { setDigOff(true); store.set("contentos.dig.off", today); }}>今日はいい</button></span></div>
      </div>}
      {!readOnly && inbox.some(p => anOf(p).length) && <div className="ck-vrow"><span className="ck-note" style={{ margin: 0 }}>Claude の案が {inbox.filter(p => anOf(p).length).length} 件</span>
        <button className="ck-ghost" onClick={async () => { const list = inbox.filter(p => anOf(p).length); let n = 0; for (const p of list) { if (await adoptAn(p, anOf(p)[0].g, true)) n++; } showToast(`${n} 件を案のとおり振り分けました`); }}>案をすべて採用</button></div>}
      {!readOnly && <div className="ck-cap"><textarea value={cap} onChange={e => setCap(e.target.value)} placeholder="思いついたことを書く。Enter は改行、⌘＋Enter で受け箱に入る（1 行目がタイトル、2 行目からメモ）"
        onKeyDown={async e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); const t = cap.trim(); if (!t) return; const [first, ...rest] = t.split("\n"); if (await addIdea({ title: first.trim(), memo: rest.join("\n").trim() })) { setCap(""); setSel(0); } } }} />
        <div className="ck-capft"><span className="ck-kbd">⌘</span><span className="ck-kbd">Enter</span>受け箱へ<span style={{ marginLeft: "auto" }}>どの画面からでも <span className="ck-kbd" style={{ marginLeft: 2 }}>⌘K</span></span></div></div>}
      {!readOnly && inbox.length > 0 && <div className="ck-keys"><span><span className="ck-kbd">J</span><span className="ck-kbd">K</span>選ぶ</span><span><span className="ck-kbd">1</span>アウトプットにする</span><span><span className="ck-kbd">2</span>表へ振り分け</span><span><span className="ck-kbd">H</span>寝かせる</span><span><span className="ck-kbd">Enter</span>開く</span><span><span className="ck-kbd">⌫</span>消す</span></div>}
      <div className="ck-card">{inbox.length ? inbox.map((p, j) => <div key={p.id} className={`ck-irow ${j === sel ? "sel" : ""}`} onClick={e => { if (!e.target.closest("select,button")) setSel(j); }} draggable={!readOnly} onDragStart={dragStart(p)} onDragEnd={dragEnd}>
        <div style={{ minWidth: 0 }}><div className={`ck-it ${headOf(p) ? "" : "empty"}`} onClick={() => onOpen(p)}>{headOf(p) || "（空のネタ。開いて書くか、⌫ で消す）"}</div>
          <div className="ck-im"><TypeTag t={p.postType} postTypes={postTypes} />{bornOf(p) && <span>{fmtDt(toLocal(bornOf(p)))}</span>}{p.memo && p.title && <span>・{p.memo.split("\n")[0].slice(0, 60)}</span>}</div>
          {!readOnly && anOf(p).map(a => <div key={a.l} className="ck-im" style={{ marginTop: 6 }}><span className="ck-src" style={{ color: "#7c3aed", background: "#ede9fe" }}>Claude の案</span><b style={{ color: "var(--fg)", fontWeight: 700 }}>{a.g}</b>
            <button className="ck-go" onClick={() => adoptAn(p, a.g)}>採用</button><button className="ck-ghost" style={{ minHeight: 26 }} onClick={() => rejectAn(p, a.l)}>却下</button></div>)}</div>
        {!readOnly && <div className="ck-ia">
          <select className="ck-sel" data-gsel={p.id} value="" onChange={e => { const v = e.target.value; if (!v) return; if (v === "__new__") { const n = window.prompt?.("新しい表（ジャンル）の名前"); if (n) addGenre(n).then(() => patch(p, { genre: n.trim() }, `「${n.trim()}」へ入れました`)); return; } patch(p, { genre: v }, `「${v}」へ入れました`); }}>
            <option value="">表へ振り分け</option>{genreNames.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <button className="ck-go" onClick={() => onToOut(p)}>アウトプットにする →</button>
        </div>}
      </div>) : <div className="ck-empty">受け箱は空っぽ。</div>}</div>
    </>;
  } else {
    const stLabel = s => mode === "idea" ? STAGE[s].l : (STATUS[s]?.label || s);
    const stColor = s => mode === "idea" ? STAGE[s].c : ST_COLOR[s];
    // 種類のフォルダの中では、全行が同じ種類なので種類の列と札を出さない
    const oneType = /^(if|it|of|ot):/.test(loc);
    const TT = props => oneType ? null : <TypeTag {...props} />;
    body = <>
      <div className="ck-crumb">{crumb}</div><h1 className="ck-title">{title}</h1>{note && <p className="ck-note">{note}</p>}{tabs}
      <div className="ck-vrow">
        <div className="ck-vtabs"><button className={`ck-vtab ${view === "table" ? "on" : ""}`} onClick={() => setView("table")}>{I.list}表</button><button className={`ck-vtab ${view === "board" ? "on" : ""}`} onClick={() => setView("board")}>{I.board}流れ</button>
          {mode === "out" && renderSheet && <button className={`ck-vtab ${view === "sheet" ? "on" : ""}`} onClick={() => setView("sheet")}>{I.sheet}シート</button>}</div>
        {view !== "sheet" && <div className="ck-vtabs" style={{ marginLeft: 6 }}>{stList.filter(s => countSt(s)).map(s => <button key={s} className={`ck-chip-f ${fSt === s ? "on" : ""}`} onClick={() => setFSt(fSt === s ? null : s)}>{stLabel(s)} {countSt(s)}</button>)}</div>}
        {view !== "sheet" && <label className="ck-search">{I.search}<input value={q} onChange={e => setQ(e.target.value)} placeholder={mode === "idea" ? "ネタを探す" : "この中を探す"} /></label>}
      </div>
      {view === "sheet" && mode === "out" && renderSheet ? renderSheet() :
        view === "board" ? <div className="ck-board">{stList.map(s => { const rs = shown.filter(p => stOf(p) === s); return <div key={s} className={`ck-col ${rs.length ? "" : "empty"}`}
          onDragOver={e => { if (readOnly) return; e.preventDefault(); e.currentTarget.classList.add("drop"); }} onDragLeave={e => e.currentTarget.classList.remove("drop")}
          onDrop={async e => { e.preventDefault(); e.currentTarget.classList.remove("drop"); const p = posts.find(x => String(x.id) === e.dataTransfer.getData("text/ck")); if (!p) return;
            if (mode === "idea") { if (s === "sleep") toggleLabel(p, SLEEP, true); else if (s === "grow") toggleLabel(p, GROW, true); else patch(p, { labels: (p.labels || []).filter(l => l !== SLEEP && l !== GROW) }); }
            else setStatus(p, s); }}>
          <div className="ck-colh" style={{ "--c": stColor(s) }}><i />{stLabel(s)}<span className="n">{rs.length}</span>{mode === "out" && s === "draft" && rs.length > 3 && <span className="w">書きかけが多い</span>}</div>
          {!rs.length && !readOnly && <div className="ck-col-hint">ここへドラッグ</div>}
          {rs.map(p => <div key={p.id} className={`ck-bcard ${pop === p.id ? "ck-pop" : ""}`} draggable={!readOnly} onDragStart={dragStart(p)} onDragEnd={dragEnd} onClick={() => onOpen(p)}>
            <div className="ck-bt">{headOf(p) || "（タイトルなし）"}</div>
            <div className="ck-bft"><TT t={p.postType} postTypes={postTypes} />{p.datetime && <span className="ck-num">{fmtDt(p.datetime)}</span>}{p.score && <Score s={p.score} />}
              {mode === "idea" && !readOnly && <button className="ck-go" style={{ marginLeft: "auto" }} onClick={e => { e.stopPropagation(); onToOut(p); }}>アウトプットに →</button>}</div>
          </div>)}
        </div>; })}</div>
        : <div className="ck-card"><div className="ck-tw"><table className="ck-table"><thead><tr>
          {mode === "idea" ? <><th>ネタ</th><th>状態</th>{!oneType && <th>種類</th>}<th>素材</th><th>入れた日</th><th /></>
            : <><th>タイトル</th><th>状態</th>{!oneType && <th>種類</th>}<th>予定</th><th>ジャンル</th><th>素材</th><th>評価</th><th style={{ textAlign: "right" }}>インプ</th></>}
        </tr></thead><tbody>
          {shown.map(p => mode === "idea" ?
            <tr key={p.id} onClick={e => { if (!e.target.closest("button,select")) onOpen(p); }}>
              <td><div className={`ck-nm ${headOf(p) ? "" : "empty"}`}>{headOf(p) || "（空のネタ）"}</div><div className="ck-snip">{(p.title ? p.memo : "") || "メモはまだ"}</div></td>
              <td><span className="ck-st" style={{ "--c": STAGE[stageOf(p)].c }}><i />{STAGE[stageOf(p)].l}</span></td>
              {!oneType && <td><TypeTag t={p.postType} postTypes={postTypes} /></td>}<td><Srcs p={p} /></td>
              <td className="ck-num">{bornOf(p) ? fmtDt(toLocal(bornOf(p))).replace(/ \d\d:\d\d$/, "") : ""}</td>
              <td style={{ textAlign: "right" }}>{!readOnly && (stageOf(p) === "sleep" ? <button className="ck-go" onClick={() => toggleLabel(p, SLEEP, false).then(ok => ok && showToast("起こしました"))}>起こす</button> : <button className="ck-go" onClick={() => onToOut(p)}>アウトプットにする →</button>)}</td>
            </tr> :
            <tr key={p.id} onClick={e => { if (!e.target.closest("button,select")) onOpen(p); }}>
              <td><div className="ck-nm">{headOf(p) || "（タイトルなし）"}</div><div className="ck-snip">{textOf(p).slice(0, 80) || p.memo || "本文はまだ"}</div></td>
              <td className={pop === p.id ? "ck-pop" : ""}>{readOnly ? <StTag s={p.status} /> : <select className="ck-stsel" value={p.status} onChange={e => setStatus(p, e.target.value)} style={{ backgroundImage: `radial-gradient(circle,${ST_COLOR[p.status]} 3.5px,transparent 4px)` }}>
                {OUT_FLOW.map(s => <option key={s} value={s}>{STATUS[s]?.label || s}</option>)}</select>}</td>
              {!oneType && <td><TypeTag t={p.postType} postTypes={postTypes} /></td>}
              <td className="ck-num">{p.datetime ? fmtDt(p.datetime) : <span className="ck-dash">日時なし</span>}</td>
              <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.genre || ""}</td>
              <td><Srcs p={p} /></td><td><Score s={p.score} /></td>
              <td className="ck-num" style={{ textAlign: "right" }}>{p.impressions != null ? kNum(p.impressions) : ""}</td>
            </tr>)}
          {!shown.length && <tr><td colSpan={8} className="ck-empty" style={{ cursor: "default" }}>{mode === "idea" ? "ここにはまだない。受け箱から「表へ振り分け」で入れる" : "ここにはまだない。ネタ帳の「アウトプットにする」から入る"}</td></tr>}
        </tbody></table></div></div>}
    </>;
  }

  return <div className="ck-screen">
    <aside className={`ck-nav ${navOn ? "" : "off"}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>{nav}</div>
      <div className="ck-nav-foot">{mode === "idea" ? "ネタは「1 つに 1 つの主張」。タイトルを言い切りの文にしておくと、書くときに迷わない" : "表の行を押すと、いつもの編集画面が開く"}</div>
    </aside>
    <main className="ck-main"><div className="ck-wrap">{body}</div></main>
  </div>;
}
