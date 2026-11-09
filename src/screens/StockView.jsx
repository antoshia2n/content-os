// src/screens/StockView.jsx
// 2026-10-23 作り直し 1便：ネタ帳とアウトプットの「フォルダ → 表」の画面。
// 編集画面（EditorModal）には触らない。行を押すと今の編集画面がそのまま開く。
// ネタは今までどおり投稿の表の「状態＝アイデア」の行。データベースの形は変えていない。
//   ネタ帳：フォルダ＝種類（post_type）、表＝ジャンル（genre・一覧は sheet_genres）。ジャンルが空のネタが受け箱
//   アウトプット：フォルダ＝種類 › 年、表＝月（予定日から作る）。予定日が無いものは「日時なし」の表
//   寝かせ・育て中は、今ある「ラベル」の欄に印を付けて持つ
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { isSample } from "../lib/samples.js";
import { GQ, GNav } from "../lib/guide.jsx";
import { POST_TYPE, getPostTypeStyle, STATUS, genId, nowStr, fmtDate, stripHtml, TRASH_LABEL, ARCHIVE_LABEL, TRASH_DAYS, isArchived, trashedAt } from "../constants.js";
import { dbFetchSheetGenres, dbAddSheetGenre } from "../lib/supabase.js";
import { slotMatchesDate } from "./CalendarView.jsx";
import { useDialogFocus } from "../lib/useDialogFocus.js";
import { makeStructure } from "../lib/mindmapLink.js";
import { I, ST_COLOR, OUT_FLOW, SLEEP, store, fmtDt, toLocal, kNum, textOf, headOf, bornOf, stageOf, typed, STAGE, weekRange, StTag, TypeTag, Score, Srcs, Nv, RowMenu, nextFreeSlot, GROW } from "./StockParts.jsx";
// 前からの読み口（PanelView など）のために、分けた部品もここから出す
export { CK_CSS, CK_PHONE_CSS, AccountPill, ToOutModal, BRAND_ICON, nextFreeSlot, fmtDt } from "./StockParts.jsx";

export function StockView({ mode, uid, owner = false, onClearSamples, accountId, posts, postTypes, slots, today, readOnly,
  onOpen, saveToDb, patchFields, changeStatus, onDelete, showToast, onToOut, renderSheet, navOn, setNavOn, keysOff, onMode,
  trash = [], onRestore, onPurge, onNewIdea, onNewOut, onUndoBar }) {
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
  const [capType, setCapType] = useState(""); // 受け箱の入力欄の種類（"" は決めない＝受け箱へ）
  useEffect(() => { if (!uid) return; dbFetchSheetGenres(uid).then(setGenres).catch(e => console.warn("[ContentOS genres]", e?.message || e)); }, [uid]);
  const genreNames = genres.map(g => g.name);

  const ideas = useMemo(() => posts.filter(p => p.status === "idea"), [posts]);
  const outs = useMemo(() => posts.filter(p => p.status !== "idea" && !isArchived(p)), [posts]);
  const archived = useMemo(() => posts.filter(p => p.status !== "idea" && isArchived(p)), [posts]);
  // 2026-11-09 Naoki OK 20:38：種類を決めたネタ（Xポスト以外）は、ジャンルが無くても受け箱を出てその種類のフォルダに並ぶ。受け箱は「種類もジャンルも決めていないもの」だけ
  const inbox = useMemo(() => ideas.filter(p => !p.genre && !typed(p) && stageOf(p) !== "sleep").sort((a, b) => bornOf(b).localeCompare(bornOf(a)) || b.id - a.id), [ideas]);

  // 状態を変える（予約済みは日時が要る。無いときは日時未定に）＋予約の一拍
  const setStatus = useCallback(async (p, s) => {
    let next = s;
    if (s === "reserved" && !p.datetime) { next = "waiting"; showToast("予約済みには日時が要るので、日時未定にしました"); }
    if (next === p.status) return;
    await changeStatus(p.id, next, p.score ?? null);
    if (next === "reserved") { setPop(p.id); setTimeout(() => setPop(x => x === p.id ? null : x), 900); }
  }, [changeStatus, showToast]);
  // 2026-11-03 思考整理くんとの連携 便 1：ネタから構成のマップを作る（持ち主だけ。思考整理くんは持ち主だけが使える）
  const [making, setMaking] = useState(null);
  const mkMap = async p => { if (making) return; setMaking(p.id); try { await makeStructure(p, url => patch(p, { mm_url: url }), showToast); } finally { setMaking(null); } };
  const mapBtn = p => !owner || readOnly ? null : p.mm_url
    ? <a className="ck-ghost" href={p.mm_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }} aria-label={`「${headOf(p) || "空のネタ"}」の構成のマップを別のタブで開く`}>構成を開く ↗</a>
    : <button className="ck-ghost" onClick={() => mkMap(p)} aria-busy={making === p.id} aria-label={`「${headOf(p) || "空のネタ"}」から構成のマップを作って別のタブで開く`}>{making === p.id ? "作っています…" : "構成をつくる →"}</button>;
  const patch = useCallback(async (p, fields, msg) => { const ok = patchFields ? await patchFields(p, fields) : await saveToDb({ ...p, ...fields }); if (ok && msg) showToast(msg); return ok; }, [patchFields, saveToDb, showToast]);
  const toggleLabel = useCallback((p, label, on) => { const ls = new Set(p.labels || []); if (on) ls.add(label); else ls.delete(label); if (label === SLEEP && on) ls.delete(GROW); if (label === GROW && on) ls.delete(SLEEP); return patch(p, { labels: [...ls] }); }, [patch]);
  const addIdea = useCallback(async ({ title, memo, genre = null, postType = "x_post", count = true }) => {
    const p = { id: genId(), account_id: accountId, status: "idea", datetime: "", title, memo, postType, body: "", memoLinks: [], comments: [], history: [{ at: nowStr(), note: genre || postType !== "x_post" ? "ネタに入れた" : "受け箱に入れた" }], labels: [], genre, theme: null, mm_url: null, manabu: false };
    const ok = await saveToDb(p, { count });
    if (ok) showToast(genre ? `「${genre}」に入れました` : postType !== "x_post" ? `「${postTypes[postType]?.label || postType}」のフォルダに入れました` : "受け箱に入れました");
    return ok;
  }, [accountId, saveToDb, showToast, postTypes]);
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
  // 2026-11-07 Notion の形へ 便 ①（Naoki OK 22:40）：ネタとアウトプットの左の一覧を 1 本にまとめた。
  // 今いない側の行を押すと、その側の場所を覚えてから onMode で切り替える（表の中身の作り方は今までどおり mode ごと）
  const typeKeys = Object.keys(postTypes);
  let nav, rows = [], crumb = "", title = "", note = "", tabs = null;
  const [wFrom, wTo] = weekRange(today);
  const lcOf = m => m === mode ? loc : "";
  // 畳んだフォルダはアカウントごとにブラウザへ覚える（値が無いフォルダは今までどおりの開き方）
  const [folds, setFolds] = useState(() => store.get(`${keyBase}.fold`, {}));
  useEffect(() => { setFolds(store.get(`${keyBase}.fold`, {})); }, [keyBase]);
  const fold = (k, def, inside) => { const open = k in folds ? folds[k] : def; return { open, inside, onToggle: () => setFolds(f => { const nf = { ...f, [k]: !open }; store.set(`${keyBase}.fold`, nf); return nf; }) }; };
  const goTo = (m, l) => { if (m === mode) setLoc(l); else { store.set(`${keyBase}.${m}`, l); if (window.innerWidth <= 860) setNavOn(false); onMode && onMode(m); } };
  // ネタ側の材料
  const live = ideas.filter(p => (p.genre || typed(p)) && stageOf(p) !== "sleep");
  const iTypes = typeKeys.filter(t => t === "x_article" || t === "x_post" || live.some(p => (p.postType || "x_post") === t));
  const dropTo = (genre, type) => ({ onDragOver: e => e.preventDefault(), onDrop: e => { e.preventDefault(); const p = posts.find(x => String(x.id) === e.dataTransfer.getData("text/ck")); if (p) patch(p, { genre, postType: type, labels: (p.labels || []).filter(l => l !== SLEEP) }, `「${genre}」へ入れました`); } });
  // アウトプット側の材料
  const byType = t => outs.filter(p => (p.postType || "x_post") === t);
  const oTypes = typeKeys.filter(t => byType(t).length || t === "x_article" || t === "x_post");
  const weekRows = outs.filter(p => p.datetime && p.datetime.slice(0, 10) >= wFrom && p.datetime.slice(0, 10) <= wTo && !["reserved", "published"].includes(p.status));
  const drafts = outs.filter(p => p.status === "draft");
  {
    const il = lcOf("idea"), ol = lcOf("out");
    nav = <>
      <div className="ck-nh">ネタ<GNav id="idea" label="ネタ" /></div>
      <Nv on={il === "inbox"} icon={I.inbox} label="受け箱" n={inbox.length} cls="warn" onClick={() => goTo("idea", "inbox")} />
      {iTypes.map(t => { const inT = live.filter(p => (p.postType || "x_post") === t); return <React.Fragment key={t}>
        {(() => { const f = fold(`i:${t}`, true, il.startsWith(`it:${t}:`)); return <>
        <Nv on={il === `if:${t}`} icon={I.folder} label={postTypes[t].label} n={inT.length} onClick={() => goTo("idea", `if:${t}`)} fold={f} />
        {f.open && genreNames.filter(g => inT.some(p => p.genre === g) || il === `it:${t}:${g}`).map(g => <Nv key={g} cls="d1" on={il === `it:${t}:${g}`} icon={I.table} label={g} n={inT.filter(p => p.genre === g).length} onClick={() => goTo("idea", `it:${t}:${g}`)} {...dropTo(g, t)} />)}
        </>; })()}
      </React.Fragment>; })}
      <div className="ck-nh">アウトプット<GNav id="out" label="アウトプット" /></div>
      <Nv on={ol === "week"} icon={I.week} label="今週書くもの" n={weekRows.length} onClick={() => goTo("out", "week")} />
      <Nv on={ol === "draft"} icon={I.pen} label="書きかけ" n={drafts.length} cls={drafts.length > 3 ? "warn" : ""} onClick={() => goTo("out", "draft")} />
      {oTypes.map(t => {
        const ps = byType(t);
        const years = [...new Set(ps.filter(p => p.datetime).map(p => p.datetime.slice(0, 4)))].sort().reverse();
        const nodate = ps.filter(p => !p.datetime);
        const curYear = (ol.startsWith(`ot:${t}:`) && ol.split(":")[2]) || "";
        const ft = fold(`o:${t}`, true, ol.startsWith(`ot:${t}:`));
        return <React.Fragment key={t}>
          <Nv on={ol === `of:${t}`} icon={I.folder} label={postTypes[t].label} n={ps.length} onClick={() => goTo("out", `of:${t}`)} fold={ft} />
          {ft.open && years.map(y => { const inY = ps.filter(p => p.datetime?.startsWith(y)); const months = [...new Set(inY.map(p => p.datetime.slice(5, 7)))].sort().reverse(); const fy = fold(`o:${t}:${y}`, curYear.startsWith(y) || y === today.slice(0, 4), curYear.startsWith(y)); return <React.Fragment key={y}>
            <Nv cls="d1" on={false} icon={I.folder} label={`${y.slice(2)}年`} n={inY.length} onClick={() => goTo("out", `ot:${t}:${y}-${months[0]}`)} fold={fy} />
            {fy.open && months.map(m => <Nv key={m} cls="d2" on={ol === `ot:${t}:${y}-${m}`} icon={I.table} label={`${+m}月`} n={inY.filter(p => p.datetime.slice(5, 7) === m).length} onClick={() => goTo("out", `ot:${t}:${y}-${m}`)} />)}
          </React.Fragment>; })}
          {ft.open && nodate.length > 0 && <Nv cls="d1" on={ol === `ot:${t}:none`} icon={I.table} label="日時なし" n={nodate.length} onClick={() => goTo("out", `ot:${t}:none`)} />}
        </React.Fragment>;
      })}
      <div className="ck-nh">しまったもの<GNav id="stash" label="しまったもの" /></div>
      <Nv on={il === "sleep"} icon={I.moon} label="寝かせ中" n={ideas.filter(p => stageOf(p) === "sleep").length} onClick={() => goTo("idea", "sleep")} />
      <Nv on={ol === "arch"} icon={I.archive} label="アーカイブ" n={archived.length} onClick={() => goTo("out", "arch")} />
      <Nv on={ol === "trash"} icon={I.trash} label="ゴミ箱" n={trash.length} onClick={() => goTo("out", "trash")} />
    </>;
  }
  if (mode === "idea") {
    if (loc === "sleep") { rows = ideas.filter(p => stageOf(p) === "sleep"); crumb = "ネタ"; title = "寝かせ中"; note = "今は書かないが捨てたくないもの。時期が来たら「起こす」。"; }
    else if (loc.startsWith("if:")) { const t = loc.slice(3); rows = live.filter(p => (p.postType || "x_post") === t); crumb = "ネタ"; title = postTypes[t]?.label || t; }
    else if (loc.startsWith("it:")) {
      const [, t, g] = loc.split(":"); rows = live.filter(p => (p.postType || "x_post") === t && p.genre === g); crumb = `ネタ › ${postTypes[t]?.label || t}`; title = g;
      tabs = <div className="ck-tabs">{genreNames.map(x => <button key={x} className={`ck-tab ${x === g ? "on" : ""}`} onClick={() => setLoc(`it:${t}:${x}`)}>{x}<span className="n">{live.filter(p => (p.postType || "x_post") === t && p.genre === x).length}</span></button>)}
        {addingGenre ? <span className="ck-tabadd"><input autoFocus placeholder="表の名前（ジャンル）" onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addGenre(e.currentTarget.value); if (e.key === "Escape") setAddingGenre(false); }} onBlur={e => addGenre(e.currentTarget.value)} /></span>
          : !readOnly && <button className="ck-tab add" onClick={() => setAddingGenre(true)}>＋ 表</button>}</div>;
    }
  } else {
    if (loc === "week") { rows = weekRows; crumb = "アウトプット"; title = "今週書くもの"; note = `${wFrom.slice(5).replace("-", "/")}〜${wTo.slice(5).replace("-", "/")} に予定があり、まだ予約まで進んでいないもの。`; }
    else if (loc === "arch") { rows = archived; crumb = "アウトプット"; title = "アーカイブ"; note = "表とカレンダーには出さないが、取っておくもの。行の「…」から戻せる。"; }
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
  // 2026-11-08 行の「…」：しまう（ネタは寝かせる・アウトプットはアーカイブ）とゴミ箱。しまったら「元に戻す」の帯を出す
  const stash = (p, label, on, msg) => toggleLabel(p, label, on).then(ok => { if (!ok) return; if (onUndoBar) onUndoBar(msg, () => toggleLabel({ ...p, labels: on ? [...(p.labels || []), label] : (p.labels || []).filter(l => l !== label) }, label, !on)); else showToast(msg); });
  const menuOf = p => {
    const name = headOf(p) || "タイトルなし", its = [];
    if (p.status === "idea") its.push(stageOf(p) === "sleep" ? { label: "起こす", run: () => stash(p, SLEEP, false, "起こしました") } : { label: "寝かせる", note: "表から外す", run: () => stash(p, SLEEP, true, `「${name.slice(0, 20)}」を寝かせました`) });
    else its.push(isArchived(p) ? { label: "アーカイブから戻す", run: () => stash(p, ARCHIVE_LABEL, false, "表に戻しました") } : { label: "アーカイブ", note: "表とカレンダーから外す", run: () => stash(p, ARCHIVE_LABEL, true, `「${name.slice(0, 20)}」をアーカイブしました`) });
    its.push({ label: "ゴミ箱へ移動", note: `${TRASH_DAYS} 日で消える`, danger: true, run: () => onDelete(p) });
    return <RowMenu label={name} items={its} />;
  };
  // ガイドの「？」の文の組（manual.js の GUIDES.screens）
  const gs = loc === "trash" ? "trash" : mode === "idea" && loc === "inbox" ? "inbox" : loc === "sleep" || loc === "arch" ? "stash" : mode === "idea" ? "idea" : "out";
  // 2026-11-08 表のいちばん下の「＋ 新規」：今いる表の種類・ジャンル・月を引き継いで作る
  let newRow = null;
  if (!readOnly) {
    if (mode === "idea" && loc.startsWith("it:") && onNewIdea) { const [, t, g] = loc.split(":"); newRow = () => onNewIdea({ postType: t, genre: g }); }
    else if (mode === "idea" && loc.startsWith("if:") && onNewIdea) { const t = loc.slice(3); newRow = () => onNewIdea({ postType: t, genre: null }); }
    else if (mode === "out" && onNewOut) {
      const slot = t => nextFreeSlot({ slots, posts, postType: t, today }) || `${today}T07:00`;
      if (loc === "week") newRow = () => onNewOut(slot("x_post"), {});
      else if (loc === "draft") newRow = () => onNewOut(undefined, {});
      else if (loc.startsWith("of:")) { const t = loc.slice(3); newRow = () => onNewOut(undefined, { postType: t }); }
      else if (loc.startsWith("ot:")) { const [, t, ym] = loc.split(":"); newRow = () => onNewOut(ym === "none" ? null : ym === today.slice(0, 7) ? slot(t) : `${ym}-01T07:00`, { postType: t }); }
    }
  }
  const newTr = newRow && <tr className="ck-newrow" onClick={newRow}><td colSpan={9}><button className="p" onClick={e => { e.stopPropagation(); newRow(); }}>＋ 新規<GQ id={gs} n={1} /><span style={{ fontWeight: 500, color: "var(--faint)", fontSize: 12 }}>{title ? `「${title}」に足す` : ""}</span></button></td></tr>;

  let body;
  if (mode === "out" && loc === "trash") {
    const left = p => { const at = trashedAt(p); if (!at) return TRASH_DAYS; return Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(at).getTime()) / 864e5)); };
    const rs = [...trash].sort((a, b) => trashedAt(b).localeCompare(trashedAt(a)));
    body = <>
      <div className="ck-crumb">しまったもの</div><h1 className="ck-title">ゴミ箱</h1>
      <p className="ck-note">入れてから {TRASH_DAYS} 日たつと自動で消えます。それまではここから元に戻せます。</p>
      <div className="ck-card"><div className="ck-tw"><table className="ck-table"><thead><tr><th>タイトル</th><th>元の場所</th><th>ゴミ箱へ移動した日</th><th>自動で消えるまで</th><th /></tr></thead><tbody>
        {rs.map(p => <tr key={p.id} style={{ cursor: "default" }}>
          <td><div className="ck-nm">{headOf(p) || "（タイトルなし）"}</div><div className="ck-snip">{(textOf(p) || p.memo || "").slice(0, 80)}</div></td>
          <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{p.status === "idea" ? "ネタ" : "アウトプット"} › {postTypes[p.postType || "x_post"]?.label || p.postType}</td>
          <td className="ck-num">{trashedAt(p) ? fmtDt(toLocal(trashedAt(p))).replace(/ \d\d:\d\d$/, "") : ""}</td>
          <td className="ck-num">あと {left(p)} 日</td>
          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{!readOnly && <>{p === rs[0] && <GQ id={gs} n={1} />}<button className="ck-go" onClick={() => onRestore(p)}>元に戻す</button> {p === rs[0] && <GQ id={gs} n={2} style={{ marginLeft: 4 }} />}<button className="ck-ghost" style={{ color: "#b91c1c" }} onClick={() => onPurge(p)}>完全に削除</button></>}</td>
        </tr>)}
        {!rs.length && <tr><td colSpan={5} className="ck-empty" style={{ cursor: "default" }}>ゴミ箱は空です。行の「…」から「ゴミ箱へ移動」で入ります。</td></tr>}
      </tbody></table></div></div>
    </>;
  } else if (mode === "idea" && loc === "inbox") {
    body = <>
      <div className="ck-crumb">ネタ</div><h1 className="ck-title">受け箱</h1>
      {!readOnly && onClearSamples && posts.some(isSample) && <div className="ck-cap" style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", borderStyle: "dashed" }}>
        <span style={{ fontSize: 13, lineHeight: 1.6, flex: "1 1 220px" }}><b>「例」の札が付いたものは見本です。</b>触ってみて、要らなくなったら消してください（ネタ・下書き・予約済み・型）。</span>
        <button className="ck-ghost" onClick={onClearSamples}>例をまとめて消す</button></div>}
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
      {!readOnly && <div className="ck-cap" style={{ position: "relative" }}><GQ id={gs} n={1} style={{ position: "absolute", left: -9, top: -9, margin: 0 }} /><textarea value={cap} onChange={e => setCap(e.target.value)} placeholder="思いついたことを書く。Enter は改行、⌘＋Enter で受け箱に入る（1 行目がタイトル、2 行目からメモ）"
        onKeyDown={async e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); const t = cap.trim(); if (!t) return; const [first, ...rest] = t.split("\n"); if (await addIdea({ title: first.trim(), memo: rest.join("\n").trim(), postType: capType || "x_post" })) { setCap(""); setSel(0); } } }} />
        <div className="ck-capft" role="radiogroup" aria-label="入れる先" style={{ flexWrap: "wrap", gap: 6 }}><span>入れる先</span>
          {[["", "受け箱（決めない）"], ...typeKeys.filter(t => t !== "x_post").map(t => [t, `${postTypes[t].label}のフォルダ`])].map(([k, l]) => <button key={k || "none"} role="radio" aria-checked={capType === k} className={`ck-chip-f ${capType === k ? "on" : ""}`} onClick={() => setCapType(k)}>{capType === k ? "✓ " : ""}{l}</button>)}</div>
        <div className="ck-capft"><span className="ck-kbd">⌘</span><span className="ck-kbd">Enter</span>受け箱へ<span style={{ marginLeft: "auto" }}>どの画面からでも <span className="ck-kbd" style={{ marginLeft: 2 }}>⌘K</span></span></div></div>}
      {!readOnly && inbox.length > 0 && <div className="ck-keys"><span><span className="ck-kbd">J</span><span className="ck-kbd">K</span>選ぶ</span><span><span className="ck-kbd">1</span>アウトプットにする</span><span><span className="ck-kbd">2</span>表へ振り分け</span><span><span className="ck-kbd">H</span>寝かせる</span><span><span className="ck-kbd">Enter</span>開く</span><span><span className="ck-kbd">⌫</span>消す</span></div>}
      <div className="ck-card">{inbox.length ? inbox.map((p, j) => <div key={p.id} className={`ck-irow ${j === sel ? "sel" : ""}`} onClick={e => { if (!e.target.closest("select,button,a")) setSel(j); }} draggable={!readOnly} onDragStart={dragStart(p)} onDragEnd={dragEnd}>
        <div style={{ minWidth: 0 }}><div className={`ck-it ${headOf(p) ? "" : "empty"}`} onClick={() => onOpen(p)}>{headOf(p) || "（空のネタ。開いて書くか、⌫ で消す）"}</div>
          <div className="ck-im"><TypeTag t={p.postType} postTypes={postTypes} />{bornOf(p) && <span>{fmtDt(toLocal(bornOf(p)))}</span>}{p.memo && p.title && <span>・{p.memo.split("\n")[0].slice(0, 60)}</span>}</div>
          {!readOnly && anOf(p).map(a => <div key={a.l} className="ck-im" style={{ marginTop: 6 }}><span className="ck-src" style={{ color: "#7c3aed", background: "#ede9fe" }}>Claude の案</span><b style={{ color: "var(--fg)", fontWeight: 700 }}>{a.g}</b>
            <button className="ck-go" onClick={() => adoptAn(p, a.g)}>採用</button><button className="ck-ghost" style={{ minHeight: 26 }} onClick={() => rejectAn(p, a.l)}>却下</button></div>)}</div>
        {!readOnly && <div className="ck-ia">
          {mapBtn(p)}
          {j === 0 && <GQ id={gs} n={2} />}<select className="ck-sel" data-gsel={p.id} value="" onChange={e => { const v = e.target.value; if (!v) return; if (v.startsWith("t:")) { const t = v.slice(2); patch(p, { postType: t }, `「${postTypes[t]?.label || t}」のフォルダへ入れました`); return; } if (v === "__new__") { const n = window.prompt?.("新しい表（ジャンル）の名前"); if (n) addGenre(n).then(() => patch(p, { genre: n.trim() }, `「${n.trim()}」へ入れました`)); return; } patch(p, { genre: v }, `「${v}」へ入れました`); }}>
            <option value="">表へ振り分け</option><optgroup label="ジャンルの表">{genreNames.map(g => <option key={g} value={g}>{g}</option>)}</optgroup>
            <optgroup label="種類のフォルダ">{typeKeys.filter(t => t !== "x_post").map(t => <option key={t} value={`t:${t}`}>{postTypes[t].label}</option>)}</optgroup>
          </select>
          {j === 0 && <GQ id={gs} n={3} style={{ marginLeft: 4 }} />}<button className="ck-go" onClick={() => onToOut(p)}>アウトプットにする →</button>
        </div>}
      </div>) : <div className="ck-empty">受け箱は空っぽ。</div>}</div>
    </>;
  } else {
    const stLabel = s => mode === "idea" ? STAGE[s].l : (STATUS[s]?.label || s);
    const stColor = s => mode === "idea" ? STAGE[s].c : ST_COLOR[s];
    // 種類のフォルダの中では、全行が同じ種類なので種類の列と札を出さない
    const oneType = /^(if|it|of|ot):/.test(loc);
    const inFolder = mode === "idea" && loc.startsWith("if:");
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
          {mode === "idea" ? <><th>ネタ</th><th>状態</th>{!oneType && <th>種類</th>}{inFolder && <th>ジャンル</th>}<th>素材</th><th>入れた日</th><th /></>
            : <><th>タイトル</th><th>状態</th>{!oneType && <th>種類</th>}<th>予定</th><th>ジャンル</th><th>素材</th><th>評価</th><th style={{ textAlign: "right" }}>インプ</th><th /></>}
        </tr></thead><tbody>
          {shown.map(p => mode === "idea" ?
            <tr key={p.id} onClick={e => { if (!e.target.closest("button,select,a")) onOpen(p); }}>
              <td><div className={`ck-nm ${headOf(p) ? "" : "empty"}`}>{loc === "sleep" && p === shown[0] && <GQ id={gs} n={2} />}{headOf(p) || "（空のネタ）"}</div><div className="ck-snip">{p.title ? p.memo : ""}</div></td>
              <td><span className="ck-st" style={{ "--c": STAGE[stageOf(p)].c }}><i />{STAGE[stageOf(p)].l}</span></td>
              {!oneType && <td><TypeTag t={p.postType} postTypes={postTypes} /></td>}
              {inFolder && <td>{readOnly ? <span style={{ fontSize: 12, color: "var(--muted)" }}>{p.genre || ""}</span> : <select className="ck-sel" aria-label={`「${headOf(p) || "空のネタ"}」のジャンル`} value={p.genre || ""} onChange={e => patch(p, { genre: e.target.value || null }, e.target.value ? `「${e.target.value}」へ入れました` : "ジャンルを外しました")}><option value="">なし</option>{genreNames.map(g => <option key={g} value={g}>{g}</option>)}</select>}</td>}
              <td><Srcs p={p} /></td>
              <td className="ck-num">{bornOf(p) ? fmtDt(toLocal(bornOf(p))).replace(/ \d\d:\d\d$/, "") : ""}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{mapBtn(p)}{owner && !readOnly && " "}{!readOnly && (stageOf(p) === "sleep" ? <button className="ck-go" onClick={() => toggleLabel(p, SLEEP, false).then(ok => ok && showToast("起こしました"))}>起こす</button> : <>{p === shown[0] && <GQ id={gs} n={2} style={{ marginLeft: 4 }} />}<button className="ck-go" onClick={() => onToOut(p)}>アウトプットにする →</button></>)}{!readOnly && <> {p === shown[0] && <GQ id={gs} n={loc === "sleep" ? 1 : 3} style={{ marginLeft: 4 }} />}{menuOf(p)}</>}</td>
            </tr> :
            <tr key={p.id} onClick={e => { if (!e.target.closest("button,select,a")) onOpen(p); }}>
              <td><div className="ck-nm">{p === shown[0] && <GQ id={gs} n={2} />}{headOf(p) || "（タイトルなし）"}</div><div className="ck-snip">{textOf(p).slice(0, 80) || p.memo || ""}</div></td>
              <td className={pop === p.id ? "ck-pop" : ""}>{readOnly ? <StTag s={p.status} /> : <select className="ck-stsel" value={p.status} onChange={e => setStatus(p, e.target.value)} style={{ backgroundImage: `radial-gradient(circle,${ST_COLOR[p.status]} 3.5px,transparent 4px)` }}>
                {OUT_FLOW.map(s => <option key={s} value={s}>{STATUS[s]?.label || s}</option>)}</select>}</td>
              {!oneType && <td><TypeTag t={p.postType} postTypes={postTypes} /></td>}
              <td className="ck-num">{p.datetime ? fmtDt(p.datetime) : <span className="ck-dash">日時なし</span>}</td>
              <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.genre || ""}</td>
              <td><Srcs p={p} /></td><td><Score s={p.score} /></td>
              <td className="ck-num" style={{ textAlign: "right" }}>{p.impressions != null ? kNum(p.impressions) : ""}</td>
              <td style={{ width: 40, textAlign: "right", whiteSpace: "nowrap" }}>{!readOnly && <>{p === shown[0] && <GQ id={gs} n={loc === "arch" ? 1 : 3} />}{menuOf(p)}</>}</td>
            </tr>)}
          {newTr}
          {!shown.length && !newTr && <tr><td colSpan={9} className="ck-empty" style={{ cursor: "default" }}>{mode === "idea" ? (inFolder ? "ここにはまだない。下の「＋ 新規」か、受け箱の「入れる先」で入れる" : "ここにはまだない。受け箱から「表へ振り分け」で入れる") : "ここにはまだない。受け箱の「アウトプットにする」から入る"}</td></tr>}
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
