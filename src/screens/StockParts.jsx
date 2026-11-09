// src/screens/StockParts.jsx
// 2026-11-10 軽量化 便3：StockView.jsx の見た目（CK_CSS）と小さな部品を分けた。最初の画面（カレンダー）でも使うのでここは先に読む。
// ネタ帳・アウトプットの画面そのもの（StockView）は開いたときに読む
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { isSample } from "../lib/samples.js";
import { GQ, GNav } from "../lib/guide.jsx";
import { POST_TYPE, getPostTypeStyle, STATUS, genId, nowStr, fmtDate, stripHtml, TRASH_LABEL, ARCHIVE_LABEL, TRASH_DAYS, isArchived, trashedAt } from "../constants.js";
import { dbFetchSheetGenres, dbAddSheetGenre } from "../lib/supabase.js";
import { slotMatchesDate } from "./CalendarView.jsx";
import { useDialogFocus } from "../lib/useDialogFocus.js";
import { makeStructure } from "../lib/mindmapLink.js";

// ── 見た目（スワイプくん・思考整理くんと同じ色と形） ─────────
export const CK_CSS = `
.ck{--bg:#f5f0eb;--panel:#fff;--soft:#f7f3ee;--hair:#f3eee8;--line:#e6dfd6;--fg:#1a1a1a;--muted:#6b6259;--faint:#736a62;--rowhover:#fffbf5;
  --field:#a39a90;--accent:#f59e0b;--accent-ink:#b45309;--accent-bg:#fef3c7;--accent-line:#fcd34d;--accent-soft:rgba(245,158,11,.2);--ink:#1a1a1a;--on-ink:#fff;--ok:#047857;--warn:#b91c1c;
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
.ck-acc small{font-size:12px;font-weight:600;color:var(--faint)}
.ck-accpop{position:absolute;left:0;top:calc(100% + 6px);z-index:120;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:6px;width:260px;display:flex;flex-direction:column;gap:2px}
.ck-accpop .h{font-size:12px;font-weight:700;color:var(--faint);padding:6px 8px 4px}
.ck-accpop button{display:flex!important;align-items:center;gap:9px;padding:8px!important;border-radius:8px;text-align:left;font-size:13px;font-weight:600}
.ck-accpop button:hover,.ck-accpop button.on{background:var(--soft)!important}
.ck-accpop button i{width:9px;height:9px;border-radius:50%}
.ck-accpop button small{margin-left:auto;font-size:12px;color:var(--faint)}
.ck-accline{height:3px;flex:none}
.ck-hm{display:flex;gap:2px;height:100%;overflow-x:auto}
.ck-hm button{font-size:13px;font-weight:700;color:var(--muted);padding:0 12px!important;border-bottom:2.5px solid transparent!important;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:0}
.ck-hm button:hover{color:var(--fg)}
.ck-hm button.on{color:var(--fg);border-bottom-color:var(--accent)!important}
.ck-hm .n{font-size:12px;color:var(--faint);font-weight:600}
.ck-q{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px!important;border:1px solid var(--line)!important;border-radius:8px;color:var(--faint);font-size:12.5px;background:var(--soft)!important;}
.ck-q:hover{color:var(--muted)}
/* 2026-11-03 上の帯の整理（Naoki OK 23:03）：予約のまま過ぎた数・新規・設定の印・区切り */
.ck-late{display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:700;color:var(--warn);font-variant-numeric:tabular-nums}
.ck-late i{width:7px;height:7px;border-radius:50%;background:var(--warn)}
.ck-new{display:inline-flex!important;align-items:center;gap:4px;height:32px;padding:0 12px!important;border-radius:8px;background:var(--accent-ink)!important;color:#fff!important;font-size:12.5px;font-weight:700;white-space:nowrap;flex:none}
.ck-new:hover{background:#92400e!important}
/* 2026-11-03 便 B：書く欄・選ぶ欄の枠は欄の枠の色（--field）。枠の無い欄はそのまま */
.ck :is(input,select,textarea):not([type=checkbox]):not([type=radio]):not([type=range]):not(.ck-stsel){border-color:var(--field)!important}
.ck :is(input,select,textarea):not([type=checkbox]):not([type=radio]):not([type=range]):focus{border-color:var(--accent)!important}
.ck-ico{display:inline-grid!important;place-items:center;width:32px;height:32px;border-radius:8px;color:var(--muted)}
.ck-ico:hover,.ck-ico.on{background:var(--soft)!important;color:var(--fg)}
.ck-sep{width:1px;height:20px;background:var(--line);margin:0 3px;flex:none}
@media (max-width:1180px){.ck-brand span{display:none}.ck-q .ql,.ck-q .ck-kbd{display:none}.ck-top [data-tour="today"] .ql{display:none}}
.ck-kbd{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;color:var(--faint);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;line-height:16px;background:var(--panel);margin-left:auto}
.ck-screen{display:flex;min-height:calc(100vh - 55px);position:relative}
.ck-nav{width:236px;flex:none;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:12px 10px;position:sticky;top:0;align-self:flex-start;height:calc(100vh - 55px);overflow:auto}
.ck-nh{padding:14px 10px 4px;font-size:12px;font-weight:700;color:var(--faint);letter-spacing:.05em;display:flex;justify-content:space-between;align-items:center}
.ck-nv{display:flex!important;align-items:center;gap:9px;width:100%;min-height:32px;padding:0 10px!important;border-radius:8px;font-size:13px;font-weight:500;color:var(--muted);text-align:left}
.ck-nv:hover{background:var(--soft)!important}
.ck-nv.on{background:var(--bg)!important;color:var(--fg);font-weight:700}
.ck-nv svg{flex:none;color:var(--faint)}
.ck-nv.on svg{color:var(--accent-ink)}
.ck-nv .l{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ck-nv .n{font-size:12px;color:var(--faint);font-weight:600;font-variant-numeric:tabular-nums}
.ck-nv.warn .n{color:var(--accent-ink);background:var(--accent-bg);border-radius:99px;padding:0 7px}
.ck-nv.d1{padding-left:26px!important}.ck-nv.d2{padding-left:42px!important}
.ck-nvf{display:flex;align-items:center;gap:2px}.ck-nvf>.ck-nv{flex:1;min-width:0}
.ck-nav>div>.ck-nv{padding-right:36px!important} /* 畳むボタンの無い行も数の位置をそろえる */
.ck-fold{flex:none;display:grid!important;place-items:center;width:24px;height:28px;border-radius:6px;color:var(--muted)}
.ck-fold:hover{background:var(--soft)!important;color:var(--fg)}
.ck-fold svg{transition:transform .15s}.ck-nvf.shut .ck-fold svg{transform:rotate(-90deg)}
.ck-nvf.shut.in>.ck-nv{color:var(--fg);font-weight:700}
@media (prefers-reduced-motion:reduce){.ck-fold svg{transition:none}}
.ck-nav-foot{margin-top:auto;padding:10px 8px 0;border-top:1px solid var(--hair);font-size:12px;color:var(--faint);line-height:1.6}
.ck-main{flex:1;min-width:0}
.ck-wrap{max-width:1180px;margin:0 auto;padding:20px 16px 72px;display:flex;flex-direction:column;gap:12px}
.ck-crumb{font-size:12px;color:var(--faint);font-weight:600}
.ck-title{font-size:26px;font-weight:800;letter-spacing:-.02em;margin:2px 0 0;line-height:1.25}
.ck-note{font-size:13px;color:var(--muted);line-height:1.7;max-width:72ch;margin:0}
.ck-tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);overflow-x:auto}
.ck-tab{font-size:14px;font-weight:700;color:var(--muted);padding:9px 14px 8px!important;border-bottom:2.5px solid transparent!important;margin-bottom:-1px;white-space:nowrap;display:inline-flex!important;gap:7px;align-items:center;border-radius:0}
.ck-tab:hover{color:var(--fg)}
.ck-tab.on{color:var(--fg);border-bottom-color:var(--accent)!important}
.ck-tab .n{font-size:12px;color:var(--faint);font-weight:600}
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
.ck-calf .ck-chip-f{height:26px;font-size:12px}
.ck-calf .sep{width:1px;height:16px;background:var(--line);margin:0 3px}
.ck-calf .sep:first-child,.ck-calf .sep:last-child{display:none}
.ck-search{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--faint);width:230px;max-width:100%;margin-left:auto}
.ck-search input{flex:1;min-width:0;border:0;background:transparent;font-size:13px;color:var(--fg);outline:none}
.ck-search:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.ck-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ck-tw{overflow-x:auto}
.ck-table{width:100%;border-collapse:collapse;min-width:880px}
.ck-table th{text-align:left;font-size:12px;font-weight:700;color:var(--faint);padding:0 12px;height:38px;white-space:nowrap;letter-spacing:.03em}
.ck-table td{padding:0 12px;height:54px;border-top:1px solid var(--hair);vertical-align:middle}
.ck-table tbody tr{cursor:pointer}
.ck-table tbody tr:hover{background:var(--rowhover)}
.ck-nm{font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px}
.ck-nm.empty{color:var(--faint);font-weight:500}
.ck-snip{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px}
.ck-num{font-variant-numeric:tabular-nums;color:var(--muted);white-space:nowrap;font-size:12.5px}
.ck-dash{color:var(--line)}
.ck-st{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;white-space:nowrap}
.ck-st i{width:8px;height:8px;border-radius:50%;background:var(--c)}
.ck-stsel{appearance:none;-webkit-appearance:none;border:1px solid transparent;background:transparent;font:inherit;font-size:12px;font-weight:700;color:var(--fg);padding:4px 6px 4px 18px;border-radius:7px;cursor:pointer;background-repeat:no-repeat;background-position:6px center;background-size:8px 8px}
.ck-stsel:hover{border-color:var(--line);background-color:var(--panel)}
.ck-type{font-size:12px;font-weight:600;padding:2px 8px;border-radius:6px;white-space:nowrap;display:inline-flex}
.ck-score{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:6px;font-size:12px;font-weight:800;color:#fff}
.ck-src{display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:700;border-radius:6px;padding:1px 6px;white-space:nowrap}
.ck-board{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;align-items:flex-start}
/* 2026-10-24 6便：列は画面幅に収める。空の列は細くして、中身のある列に幅を回す */
.ck-col{flex:1 1 0;min-width:180px;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:8px;min-height:120px}
.ck-col.drop{box-shadow:inset 0 0 0 2px var(--accent)}
.ck-col.empty{flex:0 0 150px;min-width:150px;background:transparent;border-style:dashed}
.ck-col-hint{font-size:12px;color:var(--faint);text-align:center;padding:14px 4px;border-radius:8px}
.ck-col.drop .ck-col-hint{color:var(--accent-ink)}
.ck-colh{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;padding:4px 6px;white-space:nowrap}
.ck-colh i{width:8px;height:8px;border-radius:50%;background:var(--c)}
.ck-colh .n{color:var(--faint);font-weight:600;font-size:12px}
.ck-colh .w{margin-left:auto;font-size:12px;font-weight:700;color:var(--warn)}
.ck-bcard{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;text-align:left;display:flex;flex-direction:column;gap:7px;cursor:grab;position:relative}
.ck-bcard:hover{border-color:var(--accent-line)}
.ck-bcard.dragging{opacity:.4}
.ck-bt{font-size:13px;font-weight:600;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ck-bft{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--faint)}
.ck-cap{display:flex;flex-direction:column;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.ck-cap:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.ck-cap textarea{border:0;outline:none;resize:none;font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:15px;line-height:1.7;background:transparent;min-height:52px;width:100%;color:var(--fg)}
.ck-capft{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--faint)}
.ck-capft .ck-kbd{margin-left:0}
.ck-keys{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--faint);align-items:center}
.ck-keys span{display:inline-flex;gap:4px;align-items:center}
.ck-keys .ck-kbd{margin:0}
.ck-irow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;border-top:1px solid var(--hair);cursor:default}
.ck-irow:first-child{border-top:0}
.ck-irow.sel{background:var(--accent-bg);box-shadow:inset 3px 0 0 var(--accent)}
.ck-it{font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:14px;line-height:1.65;overflow-wrap:anywhere;cursor:pointer}
.ck-it.empty{color:var(--faint)}
.ck-im{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--faint);margin-top:4px}
.ck-ia{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.ck-sel{height:30px;font-size:12px;font-weight:600;border:1px solid var(--line);border-radius:8px;padding:0 8px;background:var(--panel);color:var(--muted);max-width:180px;font-family:inherit}
.ck-go{font-size:12px;font-weight:700;color:var(--accent-ink)!important;border:1px solid var(--accent-line)!important;background:var(--accent-bg)!important;border-radius:8px;padding:0 9px!important;min-height:28px;display:inline-flex!important;align-items:center;gap:4px;white-space:nowrap}
.ck-go:hover{filter:brightness(.97)}
.ck-ghost{font-size:12.5px;font-weight:600;border:1px solid var(--line)!important;border-radius:8px;padding:0 11px!important;min-height:30px;background:var(--panel)!important;color:var(--muted);white-space:nowrap;display:inline-flex!important;align-items:center;gap:6px}
.ck-ghost:hover{background:var(--soft)!important;color:var(--fg)}
/* 2026-11-03 便 B：主のボタンは黒い板をやめ、差し色の濃い色にそろえる（シアニンのアプリの決まり） */
.ck-ink{background:var(--accent-ink)!important;color:#fff!important;font-weight:700;font-size:12.5px;padding:0 14px!important;border-radius:8px;display:inline-flex!important;align-items:center;justify-content:center;gap:6px;white-space:nowrap;min-height:34px}
.ck-ink:hover{background:#92400e!important}
.ck-ink[disabled]{opacity:.45;cursor:default}
.ck-empty{color:var(--faint);text-align:center;padding:28px 12px;font-size:13px}
/* 2026-11-08 表の「＋ 新規」の行と、行の「…」のメニュー（Naoki OK 09:56） */
.ck-table tr.ck-newrow td{height:42px;color:var(--muted);font-size:13px;font-weight:600}
.ck-table tr.ck-newrow:hover td{color:var(--fg)}
.ck-newrow .p{display:inline-flex;align-items:center;gap:8px}
.ck-more{display:inline-grid!important;place-items:center;width:30px;height:30px;border-radius:8px;color:var(--muted);vertical-align:middle;opacity:.55}
.ck-table tr:hover .ck-more,.ck-more:focus-visible,.ck-more[aria-expanded="true"]{opacity:1}
.ck-more:hover,.ck-more[aria-expanded="true"]{background:var(--soft)!important;color:var(--fg)}
@media (hover:none){.ck-more{opacity:1}}
.ck-rmenu{position:fixed;z-index:200;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:6px;min-width:200px;display:flex;flex-direction:column}
.ck-rmenu button{display:flex!important;align-items:center;gap:8px;text-align:left;font-size:13px;font-weight:600;padding:0 10px!important;min-height:34px;border-radius:8px;color:var(--fg)}
.ck-rmenu button:hover,.ck-rmenu button:focus-visible{background:var(--soft)!important}
.ck-rmenu button.danger{color:#b91c1c}
.ck-rmenu small{font-size:12px;color:var(--muted);font-weight:500;margin-left:auto}
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
.ck-mrow>span{font-size:12px;font-weight:700;color:var(--faint)}
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
.ck-mini{font-size:12px;font-weight:700;color:var(--accent-ink);border:1px solid var(--accent-line)!important;background:var(--accent-bg)!important;border-radius:6px;padding:1px 7px!important;margin-left:auto;white-space:nowrap}
.ck-mini:hover{filter:brightness(.97)}
@media (max-width:860px){
  .ck-nav{position:fixed;left:0;top:55px;bottom:0;height:auto;z-index:60;box-shadow:var(--shadow)}
  .ck-q .ql,.ck-q .ck-kbd{display:none}.ck-q{min-width:0}
  .ck-acc small{display:none}
  .ck-irow{grid-template-columns:minmax(0,1fr)}.ck-ia{justify-content:flex-start}.ck-keys{display:none}
}
@media (max-width:760px){.ck-top{flex-wrap:wrap;height:auto;padding-top:8px;row-gap:2px}.ck-hm{order:10;width:100%;height:40px}.ck-screen{min-height:calc(100vh - 100px)}.ck-nav{top:100px}}
@media (max-width:560px){.ck-brand span{display:none}.ck-hm button{padding:0 7px!important;font-size:12.5px}.ck-hm .n{display:none}.ck-top{gap:8px}}`;

// スマホの決まり（App の画面だけ。拡張機能のサイドパネルは幅が狭くても入れない）
export const CK_PHONE_CSS = `
/* スマホ対応（2026-10-29 先行の 3 人がスマホだけで迷わず使う・app-design-rules 5b・X攻略くんと同じ直し方）
   読む：字は 12px 以上、書く欄は 16px（iPhone が勝手に拡大しない）／押す：44px 以上／
   崩れない：上の帯は画面の幅に収める・ネタとアウトプットと積み上げの表は 1 件 1 枚のカード（各欄の名前は App.jsx の phoneTables が付ける） */
@media (max-width:640px){
  .ck-accpop .h,.ck-accpop button small,.ck-bft,.ck-calf .ck-chip-f,.ck-col-hint,.ck-colh .n,.ck-colh .w,.ck-hm .n,.ck-im,.ck-kbd,.ck-keys,.ck-mini,.ck-mrow>span,.ck-mv .ck-table .faint,.ck-mvh .sub,.ck-mvn,.ck-mvs,.ck-mvt,.ck-nav-foot,.ck-nh,.ck-nv .n,.ck-score,.ck-snip,.ck-src,.ck-tab .n,.ck-table th,.ck-type{font-size:12px}
  .ck [style*="font-size: 9px"],.ck [style*="font-size: 9.5px"],.ck [style*="font-size: 10px"],.ck [style*="font-size: 10.5px"],.ck [style*="font-size: 11px"],.ck [style*="font-size: 11.5px"]{font-size:12px!important}
  .ck input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]),.ck textarea,.ck select{font-size:16px!important;min-height:44px!important}
  .ck button,.ck select,.ck [role="button"]{min-height:44px!important;min-width:44px}
  .ck input[type=checkbox],.ck input[type=radio]{width:22px;height:22px}
  .ck-hm>*,.ck-tabs>*{flex:none}
  .ck-top [data-tour="today"] .ql{display:none}
  .ck-top>div:last-child{flex-shrink:1;min-width:0}
  .ck-tab .n,.ck-snip,.ck-chip-f,.ck-dayh small,.ck-dayh .n,.ck-type,.ck small,.ck-wk,.ck-mvh .sub,.ck-mvt,.ck-mvs,.ck-num,.ck-mvn{font-size:12px!important}
  .ck-tabs{-webkit-mask-image:linear-gradient(to right,#000 88%,transparent);mask-image:linear-gradient(to right,#000 88%,transparent)}
  .ck-tw{overflow:visible!important}
  .ck-table .ck-nm,.ck-table .ck-snip{white-space:normal}
  .ck-table,.ck-mv .ck-table{min-width:0!important;display:block}
  .ck-table thead{display:none}
  .ck-table tbody{display:block}
  .ck-table tr{display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px 16px;padding:12px 14px;border-top:1px solid var(--hair)}
  .ck-table tbody tr:first-child{border-top:0}
  .ck-table td{display:block;height:auto!important;padding:0!important;border:0!important;max-width:none!important;text-align:left!important}
  .ck-table td:first-child{flex:1 1 100%}
  .ck-table td[data-l]:not(:first-child)::before{content:attr(data-l);display:block;font-size:12px;color:var(--faint);font-weight:700;margin-bottom:2px}
  .ck-table td[data-l=""]::before{display:none}
  .ck-table td:empty{display:none}
}
`;

// ── 小さな部品 ─────────────────────────────────────
export const BRAND_ICON = (
  <svg width="24" height="24" viewBox="0 0 128 128" aria-hidden="true"><defs><clipPath id="ckc"><path d="M44 0H114A14 14 0 0 1 128 14V84A44 44 0 0 1 84 128H14A14 14 0 0 1 0 114V44A44 44 0 0 1 44 0Z"/></clipPath><mask id="ckm"><rect width="128" height="128" fill="#fff"/><g fill="#000"><circle cx="132" cy="40" r="19"/><circle cx="-4" cy="90" r="19"/></g></mask></defs><g mask="url(#ckm)"><g clipPath="url(#ckc)"><rect width="128" height="128" fill="#ea580c"/><path d="M0 128V58C34 58 40 82 64 82S94 104 128 104V128Z" fill="#000" fillOpacity=".22"/></g><g transform="translate(14 14) scale(4.17)" fill="none" stroke="#fff" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 19.5h4l10.2-10.2a2.1 2.1 0 0 0-3-3L5.5 16.5z"/><path d="M14 7.5l3 3"/></g></g></svg>
);
export const I = {
  inbox: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/></svg>,
  archive: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10M10 12.5h4"/></svg>,
  trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3l.8-12.2"/></svg>,
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
export const ST_COLOR = { idea: "var(--s-idea)", draft: "var(--s-draft)", review: "var(--s-review)", waiting: "var(--s-wait)", reserved: "var(--s-res)", published: "var(--s-pub)" };
export const SCORE_BG = { S: "#7c3aed", A: "#2563eb", B: "#059669", C: "#d97706", D: "#dc2626" };
export const OUT_FLOW = ["draft", "review", "waiting", "reserved", "published"];
export const SLEEP = "寝かせ", GROW = "育て中";
export const W = ["日", "月", "火", "水", "木", "金", "土"];
export const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 覚えられなくても動く */ } } };
export const fmtDt = dt => { if (!dt) return ""; const d = new Date(dt.length === 16 ? dt + ":00" : dt); if (isNaN(d)) return dt; return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]}) ${dt.slice(11, 16)}`; };
// 表の日時（UTC）を日本の時刻の「YYYY-MM-DDTHH:MM」にする
export const toLocal = iso => { const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z"); if (isNaN(d)) return iso.slice(0, 16); const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
export const kNum = n => n == null ? "" : n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, "") + "万" : Number(n).toLocaleString();
export const textOf = p => stripHtml(p.body || "").replace(/&nbsp;/g, " ").trim();
export const headOf = p => (p.title || "").trim() || (p.memo || "").trim().split("\n")[0] || textOf(p).slice(0, 60);
// 入れた日時（保存直後で表の日時がまだ無いときは、番号に入っている作った時刻を使う）
export const bornOf = p => p.created_at || (p.id > 1e15 ? new Date(Math.floor(p.id / 1000)).toISOString() : "");
export const stageOf = p => (p.labels || []).includes(SLEEP) ? "sleep" : (p.labels || []).includes(GROW) ? "grow" : "seed";
// 種類を決めたネタか（Xポストは入れたときの既定なので「決めていない」として受け箱に置く）
export const typed = p => (p.postType || "x_post") !== "x_post";
export const STAGE = { seed: { l: "種", c: "var(--s-idea)" }, grow: { l: "育て中", c: "var(--s-review)" }, sleep: { l: "寝かせ", c: "var(--s-wait)" } };
export function weekRange(today) { const d = new Date(today + "T00:00"); const day = d.getDay(); const mon = new Date(d); mon.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return [fmtDate(mon), fmtDate(sun)]; }

export function StTag({ s }) { const st = STATUS[s] || { label: s }; return <span className="ck-st" style={{ "--c": ST_COLOR[s] }}><i />{st.label}</span>; }
export function TypeTag({ t, postTypes }) { const pt = getPostTypeStyle(t, postTypes); return <span className="ck-type" style={{ color: pt.color, background: pt.bg }}>{pt.label}</span>; }
// 2026-10-24 6便：空欄には記号を置かない（「—」が並ぶと、値のある行が埋もれるため）
export function Score({ s }) { return s ? <span className="ck-score" style={{ background: SCORE_BG[s] || "#999" }}>{s}</span> : null; }
export function Srcs({ p }) {
  const n = (p.memoLinks || []).length;
  if (!p.mm_url && !n) return null;
  return <span style={{ display: "inline-flex", gap: 4 }}>
    {p.mm_url && <a className="ck-src" href={p.mm_url} target="_blank" rel="noopener noreferrer" title="構成のマップを別のタブで開く" style={{ color: "#6d28d9", background: "#ede9fe", textDecoration: "none" }}>思考整理 ↗</a>}
    {n > 0 && <span className="ck-src" style={{ color: "#6b6259", background: "#f3eee8" }}>{I.link}{n}</span>}
  </span>;
}
export function Nv({ on, icon, label, n, cls = "", onClick, onDragOver, onDrop, fold }) {
  const b = <button className={`ck-nv ${cls} ${on ? "on" : ""}`} onClick={onClick} onDragOver={onDragOver} onDrop={onDrop}>{icon}<span className="l">{label}</span><span className="n">{n}</span></button>;
  if (!fold) return b;
  // 2026-11-08 フォルダを畳む（Naoki 依頼）：右端の ▸ で中の表を隠す・出す。名前を押したときは今までどおりフォルダを開く
  return <div className={`ck-nvf ${fold.open ? "" : "shut"} ${fold.inside ? "in" : ""}`}>{b}
    <button className="ck-fold" aria-expanded={fold.open} aria-label={`「${label}」を${fold.open ? "畳む" : "開く"}`} title={fold.open ? "畳む" : "開く"} onClick={fold.onToggle}>{I.down}</button>
  </div>;
}

// 行の「…」のメニュー。外を押す・Esc・別の「…」を開く、のどれでも閉じ、閉じたら押した「…」へ戻る
export function RowMenu({ label, items }) {
  const [at, setAt] = useState(null);
  const btn = useRef(null), box = useRef(null);
  const close = (back = true) => { setAt(null); if (back) btn.current?.focus(); };
  useEffect(() => {
    if (!at) return;
    box.current?.querySelector("button")?.focus();
    const down = e => { if (!box.current?.contains(e.target) && !btn.current?.contains(e.target)) close(false); };
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    const other = e => { if (e.detail !== btn.current) close(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key, true); document.addEventListener("ck-rmenu", other);
    window.addEventListener("scroll", () => close(false), { once: true, capture: true });
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true); document.removeEventListener("ck-rmenu", other); };
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = e => {
    e.stopPropagation();
    if (at) { close(); return; }
    document.dispatchEvent(new CustomEvent("ck-rmenu", { detail: btn.current }));
    const r = btn.current.getBoundingClientRect(); const h = items.length * 36 + 14;
    setAt({ top: r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4, left: Math.max(8, r.right - 210) });
  };
  return <>
    <button ref={btn} className="ck-more" aria-haspopup="menu" aria-expanded={!!at} aria-label={`「${label}」の操作`} title="操作" onClick={open}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
    {at && <div ref={box} className="ck-rmenu" role="menu" style={at} onClick={e => e.stopPropagation()}>
      {items.map(it => <button key={it.label} role="menuitem" className={it.danger ? "danger" : ""} onClick={() => { close(); it.run(); }}>{it.label}{it.note && <small>{it.note}</small>}</button>)}
    </div>}
  </>;
}

// ── アカウントの切り替え（混ぜて出す画面は無い） ──────────────
export function AccountPill({ accounts, activeAcc, onPick, onManage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (!open) return; const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  return <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
    <button className="ck-acc" onClick={() => setOpen(o => !o)} aria-label="アカウントを切り替える">
      <i style={{ background: activeAcc?.color || "#ccc" }} /><span>{activeAcc?.name || "アカウント"}</span>{I.down}
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
  useDialogFocus(ref, { initialFocus: false }); // 窓の決まり：Esc と開いたときのフォーカスはこの窓が自分で持つ。足りない Tab の囲い込み・閉じたら戻すだけを足す
  const go = () => onGo({ type, datetime: when === "slot" && slot ? slot : "" });
  return <div className="ck-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="ck-modal" role="dialog" aria-modal="true" aria-label="アウトプットにする" tabIndex={-1} ref={ref} onKeyDown={e => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && !e.nativeEvent.isComposing && e.target.tagName !== "BUTTON") go(); }}>
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
