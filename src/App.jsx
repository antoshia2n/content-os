import React, { useState, useRef, useEffect } from "react";
import { auth, db, googleProvider } from "./firebase.js";
import { onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore/lite";
import {
  PORTAL_URL,
  POST_TYPE, getPostTypeStyle, STATUS, SCORE,
  DAYS, HOURS, BD, BD2, S,
  OVERDUE_STATUS,
  fmtDate, fmtTime, slotTime, genId, nowStr,
  getWeekDates, dbToPost, getUrlParams,
  TRASH_LABEL, TRASH_DAYS, isTrashed, isArchived, trashedAt,
} from "./constants.js";
import {
  dbFetchPosts, dbDeletePost, dbFetchTemplates, dbRemoveTemplate,
  supabase,
} from "./lib/supabase.js";
import { CK_CSS, CK_PHONE_CSS, AccountPill, ToOutModal, BRAND_ICON, nextFreeSlot } from "./screens/StockParts.jsx";
import { CalendarList, IdeaTray, BufferModal, PLAN_CSS, bufferReason } from "./screens/PlanView.jsx";
import {
  SlotAddForm, slotLabel, slotMatchesDate,
} from "./screens/CalendarView.jsx";

// 2026-10-06：開いたときにだけ読む画面（起動とパネルを軽くするため）。
// それぞれ自分の Suspense を持つので、読み込み中もほかの画面は消えない
function lazyNamed(loader,name){
  const C=React.lazy(()=>loader().then(m=>({default:m[name]})));
  const W=props=><React.Suspense fallback={null}><C {...props}/></React.Suspense>;
  W.displayName=name;
  return W;
}
const loadEditor=()=>import("./screens/EditorModal.jsx");
const EditorModal        =lazyNamed(loadEditor,"EditorModal");
const DiagPanel          =lazyNamed(()=>import("./screens/DiagPanel.jsx"),"DiagPanel");
const TemplatesModal     =lazyNamed(()=>import("./screens/TemplatesModal.jsx"),"TemplatesModal");
const AccountSettings    =lazyNamed(()=>import("./screens/AccountSettings.jsx"),"AccountSettings");
const MetricsView        =lazyNamed(()=>import("./screens/MetricsView.jsx"),"MetricsView");
const ExportModal        =lazyNamed(()=>import("./screens/ExportModal.jsx"),"ExportModal");
import { CtxMenuHost, openCtx } from "./components/CtxMenu.jsx";
const RepostModal        =lazyNamed(()=>import("./components/modals.jsx"),"RepostModal");
// 2026-11-10 軽量化 便3（作る前の 1 枚に Naoki OK 2026-11-09 20:45）：最初の画面（カレンダー）で使わないものは開いたときに読む
const loadFind=()=>import("./screens/FindView.jsx");
const PanelView          =lazyNamed(()=>import("./screens/PanelView.jsx"),"PanelView");
const FindModal          =lazyNamed(loadFind,"FindModal");
const FindPanel          =lazyNamed(loadFind,"FindPanel");
const StockView          =lazyNamed(()=>import("./screens/StockView.jsx"),"StockView");
const ReviewView         =lazyNamed(()=>import("./screens/ReviewView.jsx"),"ReviewView");
import { Btn } from "./components/shared.jsx";
import { CalFilter } from "./components/CalFilter.jsx";
import { usePostActions } from "./hooks/usePostActions.js";
import { useDays } from "./hooks/useDays.js";
import { TodayRing } from "./components/TodayRing.jsx";
import { useSlots } from "./hooks/useSlots.js";
import { useAccounts } from "./hooks/useAccounts.js";
import { isSample, SAMPLE_TEMPLATE_NAME } from "./lib/samples.js";
import { mountAppShell } from "shia2n-core/shell/app-shell-lite.js";
import { WsChip } from "./components/WsChip.jsx"; // 2026-11-04 場所の切り替え
import { getWorkspace } from "shia2n-core/lib/supabase-lite.js"; // 根から読むと lucide-react が要る部品まで入るため、外枠だけを読む
import { MANUAL, KEYS, makeTours } from "./manual.js";
import { DialogFocus } from "./lib/useDialogFocus.js";
import { GQ } from "./lib/guide.jsx";


const {isClient:_isClient,accountId:_urlAccountId}=getUrlParams();

// 「全アカウント」を表す内部キー（アカウントIDと衝突しない値）
const ALL_ACC="__all__";

// 固定の投稿タイプに、そのアカウント独自の投稿タイプを混ぜた対応表を作る
function mergePostTypes(acc){
  const merged={...POST_TYPE};
  (acc?.custom_post_types||[]).forEach(c=>{merged[c.key]={label:c.label,color:c.color,bg:c.bg||"#f3f4f6",border:c.border||"#d1d5db",dot:c.color};});
  return merged;
}

// 2026-10-05：空のまま閉じたネタ（状態 idea で、題名・メモ・本文・メモのリンク・MM がすべて空）を見分ける。
// 本文は入れ物のタグや空白だけでも空とみなす
// 保存したあとは「未保存」の印を外す（保存後のプレビューが未保存の表示にならないため）
function markSaved(p){const {_unsaved,_viaPreview,_untouched,...rest}=p;return rest;}
// 題名・メモ・本文・メモのリンク・MM のどれかに中身があるか（本文はタグや空白だけなら中身なし）
function hasContent(p){
  if(!p)return false;
  const blank=v=>!String(v||"").replace(/&nbsp;|\u00a0/g," ").trim();
  const bodyText=String(p.body||"").replace(/<[^>]*>/g,"");
  const links=p.memoLinks||p.memo_links||[];
  return !(blank(p.title)&&blank(p.memo)&&blank(bodyText)&&links.length===0&&blank(p.mm_url));
}
function isEmptyIdea(p){return !!p&&p.status==="idea"&&!hasContent(p);}


// 画面の切り替えの並び。ボタンと C キーの回る順は、この一覧 1 つから作る。
// 2026-10-05 段 3：週・シート・成績の 3 つにした。月 ["month","月"] とリスト ["list","リスト"] の
// 2026-10-23 作り直し 1便：上の帯を ネタ帳／アウトプット／カレンダー／振り返り にした。
// シートはアウトプットの見せ方（表・流れ・シート）の 1 つへ移した。月・リストのコードは残してある
// 2026-11-07 Notion の形へ 便 ①（Naoki OK 22:40）：上の帯は「カレンダー・コンテンツ・積み上げ」の 3 つ。
// コンテンツ＝ネタとアウトプット（中の値は今までどおり idea / out で、左の一覧から行き来する）。最初の画面はカレンダー
const HEAD=[["calendar","カレンダー"],["data","コンテンツ"],["metrics","積み上げ"]];
const VIEW_KEY="contentos.view";
function lastStock(){try{const v=localStorage.getItem(VIEW_KEY);if(v==="idea"||v==="out")return v;}catch{/* 覚えられなくても動く */}return "out";}
function firstView(){return "calendar";}

// 2026-11-06 便 B2-5：シアラボの教材のメモ（住所の # に入れて来る。サーバーへは送らない）
const LAB_ORIGINS=["https://lab.shia2n.jp"];
export function labMemoFromHash(path,hash){
  try{
    if(!/^\/new\/?$/.test(String(path||"")))return null;
    const m=String(hash||"").match(/^#d=([A-Za-z0-9_-]+)$/);if(!m)return null;
    const bin=atob(m[1].replace(/-/g,"+").replace(/_/g,"/"));
    const d=JSON.parse(new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))));
    const title=String(d.title||"").replace(/\s+/g," ").trim().slice(0,200);
    const text=String(d.text||"").replace(/\r\n?/g,"\n").slice(0,8000);
    let src="";try{const u=new URL(String(d.src||""));if(LAB_ORIGINS.includes(u.origin))src=u.href;}catch{ /* 住所でなければ入れない */ }
    return title||text?{title:title||"教材のメモ",text,src}:null;
  }catch{return null;}
}

function App({uid,panel=false,owner=false}){
  const isClient=_isClient,urlAccountId=_urlAccountId;
  const isAdmin=!isClient;

  // ── UI State ──────────────────────────────────────────
  const [toast,              setToast]              = useState(null);
  // 2026-11-03 便 B：続けて出したとき、前のタイマーが次の知らせを早く消さないようにする。長い文は長く出す
  const toastTimer=useRef(null);
  const showToast=React.useCallback((msg)=>{clearTimeout(toastTimer.current);setToast(msg);toastTimer.current=setTimeout(()=>setToast(null),Math.max(2500,Math.min(6000,String(msg||"").length*90)));},[]);
  // 2026-11-03 便 C：消すときは確かめの窓を出さず、すぐ消して「元に戻す」を 7 秒出す（シアニンのアプリの決まり）
  //   commit があるもの（投稿を消す）は、7 秒たつか次の「元に戻す」が出たときに本当に消す。戻せば何も消さない
  const [undo,setUndoRaw]=useState(null);const undoTimer=useRef(null),undoRef=useRef(null);
  const setUndo=React.useCallback(u=>{clearTimeout(undoTimer.current);const prev=undoRef.current;undoRef.current=u;if(prev&&prev.commit)prev.commit();setUndoRaw(u);
    if(u)undoTimer.current=setTimeout(()=>{const c=undoRef.current;undoRef.current=null;setUndoRaw(null);if(c&&c.commit)c.commit();},7000);},[]);
  const runUndo=React.useCallback(()=>{const u=undoRef.current;undoRef.current=null;clearTimeout(undoTimer.current);setUndoRaw(null);if(u)u.run();},[]);
  useEffect(()=>{const h=()=>{const c=undoRef.current;if(c&&c.commit){undoRef.current=null;c.commit();}};window.addEventListener("pagehide",h);return()=>window.removeEventListener("pagehide",h);},[]);

  // ── データフック（showToast が必要なため先に定義）──────
  const {
    accounts, setAccounts, allPosts, setAllPosts, activeAccId, setActiveAccId, loading,
    switchableAccounts,
    addAccount, updateAccount, copyShareLink,
    setDefaultAccount, setAccountActive, moveAccount,
  } = useAccounts({ uid, urlAccountId, isClient, showToast, autoCreate: !isClient, shared: !isClient && !!getWorkspace() });

  // ── 残りの UI State ────────────────────────────────────
  const [view,               setViewRaw]            = useState(firstView);
  const setView=React.useCallback(v=>{setViewRaw(prev=>{const next=typeof v==="function"?v(prev):v;try{localStorage.setItem(VIEW_KEY,next);}catch{/* 覚えられなくても動く */}return next;});},[]);
  const [quickOpen,setQuickOpen]=useState(false);
  // 2026-10-28 開発部（会員公開の関門 5）：共通の外枠（右上の ？・アプリ一覧・アカウント）。細い画面（/panel）では出さない
  const shellRef=useRef(null),shellSlot=useRef(null);
  // 2026-11-01 ログアウト前に続けて書けなかった回数（2 回目からは保存せずに出るかを聞く。ずっと出られなくならないように）
  const signOutFails=useRef(0);
  useEffect(()=>{
    if(panel)return;
    let sh=null;
    try{
      sh=mountAppShell({appId:"content-os",appName:"コンテンツくん",guide:true,manual:MANUAL,keys:KEYS,
        tours:makeTours({go:v=>{setView(v);return new Promise(r=>setTimeout(r,120));}}),
        // 2026-11-01 閉じる前（pagehide）ではログアウトの後になるので、ログアウトの前に今日の字数などを書き切る。書けなければ止める
        // 2026-11-01 書き込みが返ってこないときも止まり続けないよう、10 秒で打ち切って失敗とみなす
        beforeSignOut:async()=>{
          let t;const ok=await Promise.race([dayApi.flushNow(),new Promise(r=>{t=setTimeout(()=>r(false),10000);})]).catch(()=>false).finally(()=>clearTimeout(t));
          if(ok){signOutFails.current=0;return true;}
          if(++signOutFails.current<2)return false;
          return window.confirm("保存できていない変更があります。保存せずにログアウトしますか？")?true:"cancel";
        }});
      shellRef.current=sh;
      if(shellSlot.current)sh.attach(shellSlot.current);
    }catch{/* 外枠が出せなくてもアプリは動かす */}
    return()=>{try{sh&&sh.destroy();}catch{/* 片づけに失敗しても止めない */}shellRef.current=null;};
  },[panel,setView]);
  useEffect(()=>{if(shellRef.current&&shellSlot.current)shellRef.current.attach(shellSlot.current);});
  // スマホ対応（2026-10-29）：スマホでは表を 1 件 1 枚のカードにするので、各欄に見出しの名前を持たせる（CK_CSS の ::before が出す）。
  // 上の帯は、今いるタブが見える位置へ送る
  useEffect(()=>{
    const phoneTables=()=>{
      document.querySelectorAll(".ck table.ck-table").forEach(t=>{
        const hs=[...t.querySelectorAll("thead th")].map(th=>th.textContent.trim());
        t.querySelectorAll("tbody tr").forEach(tr=>[...tr.children].forEach((td,i)=>{if(hs[i]!=null&&td.dataset.l!==hs[i])td.dataset.l=hs[i];}));
      });
      const hm=document.querySelector(".ck-top .ck-hm"),on=hm&&hm.querySelector("button.on");
      if(on&&hm.scrollWidth>hm.clientWidth){const want=Math.max(0,on.offsetLeft-(hm.clientWidth-on.offsetWidth)/2);if(Math.abs(hm.scrollLeft-want)>4)hm.scrollLeft=want;}
    };
    phoneTables();
    const mo=new MutationObserver(phoneTables);mo.observe(document.body,{childList:true,subtree:true});
    return()=>mo.disconnect();
  },[]);
  const [toOut,setToOut]=useState(null);
  const [navOn,setNavOn]=useState(()=>typeof window==="undefined"||window.innerWidth>860);
  // 2026-10-23 2便：カレンダーの見せ方（週／リスト）・右のネタの棚・Buffer に入れる確認
  const [calMode,setCalModeRaw]=useState(()=>{const narrow=typeof window!=="undefined"&&window.innerWidth<=760;try{return localStorage.getItem("contentos.calmode")||(narrow?"list":"week");}catch{return narrow?"list":"week";}});
  const setCalMode=m=>{setCalModeRaw(m);try{localStorage.setItem("contentos.calmode",m);}catch{/* 覚えられなくても動く */}};
  // 2026-10-24 6便：週の表は、予定と枠のある時間帯だけを出す。夜中も見たいときだけ 0 時から出す
  const [trayOn,setTrayOn]=useState(()=>typeof window==="undefined"||window.innerWidth>900);
  const [bufferFor,setBufferFor]=useState(null);
  const [week,               setWeek]               = useState(new Date());
  const [preview,            setPreview]            = useState(null);
  const [editing,            setEditing]            = useState(null);
  // 2026-11-10 便2：状態・種類とも複数選べる（空 = すべて）
  const [filterStatus,       setFilter]             = useState([]);
  const [filterPlatform,     setFilterPlatform]     = useState([]);
  const [showShare,          setShowShare]          = useState(false);
  const [showAccountSettings,setShowAccountSettings]= useState(false);
  const [repostTgt,          setRepostTgt]          = useState(null);
  const setDeleteConfirm=React.useCallback(()=>{},[]); // 2026-11-03 便 C：確かめの窓は無くした（usePostActions に渡すだけ）
  const [showSlotSettings,   setShowSlotSettings]   = useState(false);
  const [dragId,             setDragId]             = useState(null);
  const [dragOver,           setDragOver]           = useState(null);
  const [showExport,         setShowExport]         = useState(null);
  // 2026-10-06：同じ端末で開いているほかの画面（サイドパネルと広い画面など）と食い違わないようにする。
  // 自分で投稿を変えたら「変わった」を知らせ、受け取った側は表から読み直す。読み直しで変わった分は知らせ返さない
  const syncCh=useRef(null);
  const fromRemote=useRef(false);
  const firstPosts=useRef(true);
  const allPostsRef=useRef(allPosts);allPostsRef.current=allPosts;
  useEffect(()=>{
    if(typeof BroadcastChannel==="undefined"||!uid)return;
    const ch=new BroadcastChannel("contentos-posts");
    syncCh.current=ch;
    let timer=null;
    ch.onmessage=e=>{
      if(e.data?.type!=="posts-changed"||e.data.uid!==uid)return;
      clearTimeout(timer);
      timer=setTimeout(async()=>{
        const ids=_isClient?Object.keys(allPostsRef.current):accounts.map(a=>a.id);
        if(!ids.length)return;
        const {data}=await dbFetchPosts(uid,ids);
        if(!data)return;
        const grouped={};ids.forEach(id=>{grouped[id]=[];});
        data.forEach(p=>{(grouped[p.account_id]=grouped[p.account_id]||[]).push(dbToPost(p));});
        fromRemote.current=true;
        setAllPosts(grouped);
      },300);
    };
    return()=>{clearTimeout(timer);ch.close();syncCh.current=null;};
  },[uid,accounts]);
  useEffect(()=>{
    if(firstPosts.current){if(Object.keys(allPosts).length)firstPosts.current=false;return;}
    if(fromRemote.current){fromRemote.current=false;return;}
    const t=setTimeout(()=>{try{syncCh.current?.postMessage({type:"posts-changed",uid});}catch{/* 知らせられなくても動く */}},400);
    return()=>clearTimeout(t);
  },[allPosts]);

  // 段 5：本文・メモ・締めの型。読めなくても他の動きは止めない
  // 編集画面は使う見込みが高いので、起動の 1.5 秒後に裏で先に読んでおく（開いた瞬間に待たないため）
  useEffect(()=>{const t=setTimeout(()=>{loadEditor().catch(()=>{});},1500);return()=>clearTimeout(t);},[]);
  const [templates,          setTemplates]          = useState([]);
  const [showTemplates,      setShowTemplates]      = useState(false);
  useEffect(()=>{
    if(!uid)return;
    if(loading)return; // はじめての人は、アカウントと見本の型を入れ終えてから読む（2026-10-28）
    dbFetchTemplates(uid).then(setTemplates).catch(e=>console.warn("[ContentOS templates]",e?.message||e));
  },[uid,loading]);
  // 2026-10-28 開発部（会員公開の関門 4）：見本（「例」の札）をまとめて消す。投稿と見本の型の両方
  const clearSamples=React.useCallback(async accId=>{
    const list=(allPosts[accId]||[]).filter(isSample);
    let n=0;
    for(const p of list){const {error}=await dbDeletePost(p.id);if(!error)n++;}
    setAllPosts(prev=>({...prev,[accId]:(prev[accId]||[]).filter(p=>!isSample(p))}));
    const tpl=templates.filter(t=>t.name===SAMPLE_TEMPLATE_NAME);
    for(const t of tpl){try{await dbRemoveTemplate(uid,t.id);}catch{/* 型が消せなくても投稿は消えている */}}
    if(tpl.length)setTemplates(prev=>prev.filter(t=>t.name!==SAMPLE_TEMPLATE_NAME));
    showToast(`見本を ${n} 件消しました`);
  },[allPosts,setAllPosts,templates,uid,showToast]);
  const shareRef=useRef(null);
  useEffect(()=>{
    if(!showShare)return;
    const h=e=>{if(shareRef.current&&!shareRef.current.contains(e.target))setShowShare(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[showShare]);

  const [today,setToday]=useState(()=>fmtDate(new Date()));
  // 「今」は端末の時刻（日本時間）で持つ。投稿の日時も日本時間の文字なので、世界標準時で比べると 9 時間ずれる
  const localNowDt=()=>{const n=new Date(),z=x=>String(x).padStart(2,"0");return `${fmtDate(n)}T${z(n.getHours())}:${z(n.getMinutes())}`;};
  const [nowDt,setNowDt] =useState(localNowDt);
  useEffect(()=>{
    const tick=()=>{
      setToday(fmtDate(new Date()));
      setNowDt(localNowDt());
    };
    const id=setInterval(tick,60000);
    return()=>clearInterval(id);
  },[]);
  const weekDates   =React.useMemo(()=>getWeekDates(week),[week]);
  const weekDateStrs=React.useMemo(()=>weekDates.map(fmtDate),[weekDates]);
  const activeAcc    =React.useMemo(()=>accounts.find(a=>a.id===activeAccId)||null,[accounts,activeAccId]);
  // ── 「全アカウント」表示（要件 v1.2 F5）──────────────────────
  // 横断して「見る」ための状態。書き込み先（宛先）は既定アカウントになる
  const isAllAccounts=activeAccId===ALL_ACC;
  const defaultAcc   =React.useMemo(()=>accounts.find(a=>a.is_default)||switchableAccounts[0]||null,[accounts,switchableAccounts]);
  const targetAccId  =isAllAccounts?(defaultAcc?.id||null):activeAccId;
  const targetAcc    =React.useMemo(()=>accounts.find(a=>a.id===targetAccId)||null,[accounts,targetAccId]);
  // アカウント固有のカスタム投稿タイプ（POST_TYPEにマージして使う）
  const allPostTypes =React.useMemo(()=>mergePostTypes(activeAcc||targetAcc),[activeAcc,targetAcc]);
  // 2026-11-08 ゴミ箱に入れたものは、どの画面にも出さない（ゴミ箱の画面だけが trash を読む）
  const postsWithTrash=React.useMemo(()=>isAllAccounts
    ?Object.values(allPosts).flat()
    :(allPosts[activeAccId]||[])
  ,[allPosts,activeAccId,isAllAccounts]);
  const posts    =React.useMemo(()=>postsWithTrash.filter(p=>!isTrashed(p)),[postsWithTrash]);
  const trash    =React.useMemo(()=>postsWithTrash.filter(isTrashed),[postsWithTrash]);
  // アーカイブしたアウトプットはカレンダーにも出さない
  const filtered =React.useMemo(()=>posts.filter(p=>p.status!=="idea"&&!isArchived(p)&&(!filterStatus.length||filterStatus.includes(p.status))&&(!filterPlatform.length||filterPlatform.includes(p.postType||"x_post"))),[posts,filterStatus,filterPlatform]);
  const allLabels=React.useMemo(()=>{const s=new Set();posts.forEach(p=>(p.labels||[]).forEach(l=>s.add(l)));return[...s].sort();},[posts]);
  // ⑨ 未投稿アラート：予約済みのまま期限が過ぎた投稿数
  const overdueCount=React.useMemo(()=>
    posts.filter(p=>p.status===OVERDUE_STATUS&&p.datetime<=nowDt).length
  ,[posts,nowDt]);

  const { slots, saveSlots } = useSlots({ activeAccId: targetAccId, uid, showToast });
// 種別で絞っているときは予約枠も同じ種別だけ出す（設定画面の一覧は絞らない）
const visibleSlots=React.useMemo(()=>!filterPlatform.length?slots:slots.filter(s=>filterPlatform.includes(s.postType||"x_post")),[slots,filterPlatform]);
  // 2026-10-23 4便：1 日 1 行の記録（書いた字数・計画・ひとこと）
  const dayApi = useDays(isClient?null:uid);
  // 2026-11-04 場所を替える前：書きかけの投稿の窓が開いていたら替えない。消す途中（元に戻すの帯）を確定し、今日の字数を書き切る
  const wsBeforeSwitch=React.useCallback(async()=>{
    if(editing){showToast("書きかけの投稿を閉じてから場所を替えてください");return "skip";}
    const c=undoRef.current;if(c&&c.commit){undoRef.current=null;clearTimeout(undoTimer.current);setUndoRaw(null);await c.commit();}
    return (await dayApi.flushNow())!==false;
  },[editing,dayApi,showToast]);
  const {
    saveToDb, save, del, removePost, changeStatus, changePostType,
    saveMeta, saveComment, handleRepost, handleDuplicate,
    addCustomPostType, openNew, patchFields,
  } = usePostActions({ activeAccId: targetAccId, uid, showToast, setAllPosts, setPreview, setEditing,
    setDeleteConfirm, setRepostTgt, today, posts, activeAcc: activeAcc||targetAcc, setAccounts,
    allPosts, onWrote: n=>dayApi.addChars(n) });

  // 2026-10-23 1便：アカウントは 1 つずつ開く。前に「全アカウント」を開いていたら既定のアカウントへ戻す
  useEffect(()=>{ if(!panel&&isAdmin&&isAllAccounts&&defaultAcc?.id)setActiveAccId(defaultAcc.id); },[panel,isAdmin,isAllAccounts,defaultAcc,setActiveAccId]);
  // 表の行から開くときは、今の編集画面をそのまま開く
  const openPost=React.useCallback(p=>{setPreview(null);setEditing({...p});},[]);
  // 2026-11-07 便②：プレビューを開こうとした所（カレンダーの投稿・予約枠など）は、そのままエディタを開く。まだ表に無いものは _viaPreview を付け、書き換えるまで作らない
  useEffect(()=>{if(preview&&!panel){setEditing(preview._unsaved?{...preview,_viaPreview:true}:{...preview});setPreview(null);}},[preview,panel]);
  // 2026-11-08 「削除」はゴミ箱へ移す（labels に印を付けるだけ。30 日たつと下の掃除で本当に消す）
  const trashWithUndo=React.useCallback(async p=>{
    if(!p)return;
    if(p._unsaved){setEditing(x=>x&&x.id===p.id?null:x);setPreview(x=>x&&x.id===p.id?null:x);return;}
    const labels=[...new Set([...(p.labels||[]),TRASH_LABEL])],history=[...(p.history||[]),{at:nowStr(),note:"ゴミ箱へ移動"}];
    setPreview(x=>x&&x.id===p.id?null:x);setEditing(x=>x&&x.id===p.id?null:x);
    if(!await patchFields(p,{labels,history}))return;
    setUndo({msg:`「${String(p.title||"タイトルなし").slice(0,24)}」をゴミ箱へ移動しました`,run:async()=>{if(await patchFields({...p,labels,history},{labels:(p.labels||[]).filter(l=>l!==TRASH_LABEL),history:p.history||[]}))showToast("元に戻しました");}});
  },[patchFields,setUndo,showToast]);
  const restoreFromTrash=React.useCallback(async p=>{
    if(await patchFields(p,{labels:(p.labels||[]).filter(l=>l!==TRASH_LABEL),history:[...(p.history||[]),{at:nowStr(),note:"ゴミ箱から戻した"}]}))showToast(`「${String(p.title||"タイトルなし").slice(0,24)}」を元に戻しました`);
  },[patchFields,showToast]);
  // 30 日たったゴミ箱の中身を、開いたときに 1 回だけ本当に消す
  const purgedOnce=useRef(false);
  useEffect(()=>{
    if(purgedOnce.current||loading||isClient)return;
    const all=Object.values(allPosts).flat();if(!all.length)return;
    purgedOnce.current=true;
    const limit=Date.now()-TRASH_DAYS*864e5;
    all.filter(p=>isTrashed(p)&&trashedAt(p)&&new Date(trashedAt(p)).getTime()<limit).forEach(async p=>{const {error}=await dbDeletePost(p.id);if(!error)removePost(p.id);});
  },[allPosts,loading,isClient,removePost]);
  // 2026-11-03 便 C：投稿を消す。確かめの窓をやめ、画面からすぐ外して「元に戻す」を出す（7 秒後に本当に消す）
  // 2026-11-08 からはゴミ箱の「完全に削除」だけがこれを使う
  const deleteWithUndo=React.useCallback(p=>{
    if(!p)return;removePost(p.id);setPreview(x=>x&&x.id===p.id?null:x);setEditing(x=>x&&x.id===p.id?null:x);
    const back=()=>setAllPosts(prev=>({...prev,[p.account_id]:[...(prev[p.account_id]||[]).filter(x=>x.id!==p.id),p]}));
    setUndo({msg:`「${String(p.title||"タイトルなし").slice(0,24)}」を消しました`,run:()=>{back();showToast("元に戻しました");},
      commit:async()=>{const {error}=await dbDeletePost(p.id);if(error){back();showToast("消せませんでした。もう一度押してください");}}});
  },[removePost,setAllPosts,setUndo,showToast]);
  // 2026-11-06 便 B2-5：シアラボの教材のメモから、アイデアメモを開く（/new#d=<base64url の JSON { title, text, src }>）。
  // 保存はいつもどおり本人が確かめてから（閉じたときに中身があれば保存）。src はシアラボの住所だけを素材のリンクに入れる
  const labMemoRef=React.useRef(typeof window!=="undefined"&&!panel?labMemoFromHash(window.location.pathname,window.location.hash):null);
  useEffect(()=>{
    const d=labMemoRef.current;if(!d||loading||!uid||!targetAccId)return;
    labMemoRef.current=null;
    try{window.history.replaceState(null,"","/");}catch{ /* 住所が直せなくても開く */ }
    setPreview(null);
    setEditing({id:genId(),account_id:targetAccId,status:"idea",datetime:"",title:d.title,postType:"x_post",body:"",memo:d.text,memoLinks:d.src?[{label:`教材：${d.title.slice(0,30)}`,url:d.src}]:[],comments:[],history:[{at:nowStr(),note:"シアラボの教材のメモから"}],labels:[],genre:null,theme:null,mm_url:null,manabu:false,_unsaved:true});
    showToast("教材のメモをアイデアメモに入れました。確かめて保存してください");
  },[loading,uid,targetAccId,showToast]);
  // 2026-11-03 思考整理くんとの連携 便 1：?post=<id> で開くと、そのネタ（投稿）を開く（マップの上の「ネタ：名前 ↗」から来る）
  const deepPostRef=React.useRef(typeof window!=="undefined"&&!panel?new URLSearchParams(window.location.search).get("post"):null);
  useEffect(()=>{
    const id=deepPostRef.current;if(!id||loading)return;
    const all=Object.values(allPosts).flat();if(!all.length)return;
    deepPostRef.current=null;
    try{const u=new URL(window.location.href);u.searchParams.delete("post");window.history.replaceState(null,"",u.pathname+u.search+u.hash);}catch{ /* 住所が直せなくても開く */ }
    const p=all.find(x=>x.id===id);
    if(!p){showToast("そのネタは見つかりませんでした（消された可能性があります）");return;}
    if(isAdmin&&p.account_id&&p.account_id!==activeAccId)setActiveAccId(p.account_id);
    openPost(p);
  },[allPosts,loading,isAdmin,activeAccId,setActiveAccId,openPost,showToast]);
  // ⌘K・受け箱：ネタを 1 件入れる（状態＝アイデア・ジャンル空＝受け箱）
  const quickAdd=React.useCallback(async({title,memo,memoLinks=[],mm_url=null,accId,note="受け箱に入れた",count=true})=>{
    const to=accId||targetAccId;
    if(!to){showToast("ネタを入れるアカウントが決まっていません");return false;}
    const ok=await saveToDb({id:genId(),account_id:to,status:"idea",datetime:"",title,memo,postType:"x_post",body:"",memoLinks,comments:[],history:[{at:nowStr(),note}],labels:[],genre:null,theme:null,mm_url,manabu:false},{count});
    if(ok)showToast(`${(accounts.find(a=>a.id===to)||targetAcc)?.name||""} の受け箱に入れました`);
    return ok;
  },[targetAccId,targetAcc,accounts,saveToDb,showToast]);
  // 3便：探した結果（スワイプ・思考整理）を受け箱へ／書きかけの投稿の素材に足す
  const toInboxFrom=async(r,accId)=>{const {ideaFrom}=await loadFind();const f=ideaFrom(r);if(f)quickAdd({...f,accId,count:false,note:r.k==="swipe"?"スワイプから受け箱に入れた":"思考整理から受け箱に入れた"});};
  const addLinkTo=async(target,r)=>{
    const {linkFrom}=await loadFind();const l=linkFrom(r);if(!l)return;
    if((target.memoLinks||[]).some(x=>x.url===l.url)){showToast("もう素材に入っています");return;}
    const ok=await saveToDb({...target,memoLinks:[...(target.memoLinks||[]),l],mm_url:target.mm_url||(r.k==="map"?r.url:null),history:[...(target.history||[]),{at:nowStr(),note:`素材を足した（${l.label}）`}]});
    if(ok)showToast(`「${(target.title||"（タイトルなし）").slice(0,20)}」の素材に足しました`);
  };
  // ネタ → アウトプット：状態を下書きにし、種類と日時を入れて、今の編集画面を開く
  const goOut=React.useCallback(async({type,datetime})=>{
    const p=toOut;if(!p)return;
    const next={...p,postType:type,status:"draft",datetime:datetime||"",history:[...(p.history||[]),{at:nowStr(),note:"ネタからアウトプットにした"}]};
    const ok=await saveToDb(next);
    setToOut(null);
    if(!ok)return;
    showToast(datetime?"アウトプットにしました（次の空き枠に置きました）":"アウトプットにしました");
    setPreview(null);setEditing({...next});
  },[toOut,saveToDb,showToast]);

  // ── 2便：置く・入れ替える・次の空き枠・Buffer ──
  const fmtShort=dt=>`${+dt.slice(5,7)}/${+dt.slice(8,10)} ${dt.slice(11,16)}`;
  // Buffer に入っている投稿は、こちらで日時を変えても Buffer 側が動かないので止める
  const bufLocked=p=>{if(p?.buffer_post_id){showToast("Buffer に入っている投稿は、日時を Buffer の画面で変えてください");return true;}return false;};
  // 投稿 1 本を日時 dt に置く。ネタなら下書きになり（仮置き）、枠の種類に合わせる
  const placeAt=React.useCallback(async(id,dt,slotType)=>{
    const p=posts.find(x=>x.id===id);if(!p||!dt||p.datetime===dt)return;
    if(bufLocked(p))return;
    const wasIdea=p.status==="idea";
    const n=new Date(),z=x=>String(x).padStart(2,"0"),localNow=`${fmtDate(n)}T${z(n.getHours())}:${z(n.getMinutes())}`;
    if(wasIdea&&dt<=localNow){showToast("過ぎた日時には仮置きできません");return;}
    const status=wasIdea?"draft":p.status==="waiting"?"reserved":p.status;
    const ok=await patchFields(p,{datetime:dt,status,postType:wasIdea&&slotType?slotType:p.postType,
      history:[...(p.history||[]),{at:nowStr(),note:wasIdea?`ネタを ${dt} に仮置きした`:`${p.datetime||"日時なし"}→${dt}`}]});
    if(ok)showToast(wasIdea?`仮置きしました（下書き・${fmtShort(dt)}）`:`${fmtShort(dt)} に動かしました`);
  },[posts,patchFields,showToast]);// eslint-disable-line react-hooks/exhaustive-deps
  // 2 本の日時を入れ替える。片方に日時が無いときは、その 1 本を相手と同じ時刻に置く
  const swapAt=React.useCallback(async(aId,bId)=>{
    const a=posts.find(x=>x.id===aId),b=posts.find(x=>x.id===bId);if(!a||!b||a.id===b.id)return;
    if(!a.datetime||a.status==="idea"){await placeAt(a.id,b.datetime,b.postType);return;}
    if(bufLocked(a)||bufLocked(b))return;
    const okA=await patchFields(a,{datetime:b.datetime,history:[...(a.history||[]),{at:nowStr(),note:`${a.datetime}→${b.datetime}（入れ替え）`}]});
    const okB=okA&&await patchFields(b,{datetime:a.datetime,history:[...(b.history||[]),{at:nowStr(),note:`${b.datetime}→${a.datetime}（入れ替え）`}]});
    if(okA&&okB)showToast(`入れ替えました（${fmtShort(b.datetime)} ⇄ ${fmtShort(a.datetime)}）`);
  },[posts,patchFields,showToast,placeAt]);// eslint-disable-line react-hooks/exhaustive-deps
  // 週の表のマスに落としたとき：そのマスに予約枠があれば枠の時刻、無ければ ちょうどの時刻
  const placeCell=(id,dateStr,hour)=>{
    const p=posts.find(x=>x.id===id);
    const g=(ghostBySlotRef.current[`${dateStr}_${String(hour).padStart(2,"0")}`]||[]);
    const pick=g.find(s=>(s.postType||"x_post")===(p?.postType||"x_post"))||g[0];
    placeAt(id,`${dateStr}T${pick?slotTime(pick):String(hour).padStart(2,"0")+":00"}`,pick?.postType||"x_post");
  };
  const toNextSlot=p=>{
    const dt=nextFreeSlot({slots,posts,postType:p.postType||"x_post",today});
    if(!dt){showToast("この種類の予約枠がありません（設定の予約枠で足せます）");return;}
    placeAt(p.id,dt,p.postType||"x_post");
  };
  // 状態の切り替え：予約済みにしたとき、Buffer に入れられる 1 本なら確認の窓を出す（自動では入れない）
  const changeStatusB=React.useCallback(async(id,s,score)=>{
    await changeStatus(id,s,score);
    if(s!=="reserved")return;
    const p=posts.find(x=>x.id===id);
    if(p&&p.status!=="reserved"&&!bufferReason({...p,status:"reserved"}))setBufferFor({...p,status:"reserved"});
  },[changeStatus,posts]);
  const bufferDone=(id,bid,warn)=>{
    setAllPosts(prev=>{const n={};for(const k in prev)n[k]=(prev[k]||[]).map(x=>x.id===id?{...x,buffer_post_id:bid}:x);return n;});
    setBufferFor(null);
    showToast(warn||"Buffer に入れました");
  };
  const trayIdeas=React.useMemo(()=>posts.filter(p=>p.status==="idea"&&!(p.labels||[]).includes("寝かせ")).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")||b.id-a.id),[posts]);
  const trayUndated=React.useMemo(()=>posts.filter(p=>p.status!=="idea"&&p.status!=="published"&&!p.datetime),[posts]);
  const trayDragStart=p=>e=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/ck",String(p.id));setDragId(p.id);e.currentTarget.classList.add("dragging");};
  const trayDragEnd=e=>{e.currentTarget.classList.remove("dragging");setDragId(null);setDragOver(null);};

  // N キー：ネタ帳と同じ処理でアイデアを 1 件足し、そのまま編集画面を出す（メモ欄にカーソル）
  // 段 4：/panel は広い画面と別にアカウントを 1 つ選んで持つ（広い画面の選択を動かさないため）
  const [panelAccId,setPanelAccIdRaw]=useState(()=>{try{return localStorage.getItem("contentos.panel.account")||null;}catch{return null;}});
  const setPanelAccId=React.useCallback(id=>{setPanelAccIdRaw(id);try{localStorage.setItem("contentos.panel.account",id);}catch{/* 覚えられなくても動く */}},[]);
  const panelAcc=switchableAccounts.find(a=>a.id===panelAccId)||defaultAcc;
  const panelAccRef=useRef(panelAcc);panelAccRef.current=panelAcc;
  // パネルでは、パネルで選んだアカウントの独自の投稿タイプを混ぜる（広い画面の選択に引きずられないため）
  const panelPostTypes=React.useMemo(()=>mergePostTypes(panelAcc),[panelAcc]);
  const shownPostTypes=panel?panelPostTypes:allPostTypes;
  // 2026-10-05 直し：ネタは「保存」を押すまで表に作らない（_unsaved）。
  // 押した瞬間に作ると、サイドパネルやタブを閉じたときに空の行が残るため。保存は saveToDb の upsert が新しく作る
  const addIdeaAndEdit=React.useCallback((accId,preset={})=>{
    const to=accId||targetAccId;
    if(!uid||!to){showToast("アイデアメモを足すアカウントが決まっていません");return;}
    setPreview(null);
    setEditing({...preset,id:genId(),account_id:to,status:"idea",datetime:"",title:"",postType:preset.postType||"x_post",body:"",memo:"",memoLinks:[],comments:[],history:[],labels:[],genre:preset.genre||null,theme:null,mm_url:null,manabu:false,_unsaved:true});
  },[uid,targetAccId,showToast]);

  // 編集画面を閉じたとき（← 一覧・×・Esc）
  // まだ表に無いネタ（_unsaved）：中身があれば保存して残す、空なら何もしない（表に作らない）
  // 表にある投稿：保存済みの中身が空のネタなら確認なしで消す。それ以外は今までどおり閉じるだけ
  const closeEditor=React.useCallback(async(latest)=>{
    const cur=editing;
    setEditing(null);
    if(!cur?.id)return;
    if(cur._unsaved){
      const d=latest&&latest.id===cur.id?latest:cur;
      if(!hasContent(d)||d._untouched){
        // 裏の保存で一度表に入ったあと中身を消して閉じた場合は、その行も消す
        const stored=Object.values(allPosts).flat().find(x=>x.id===cur.id);
        if(stored){const {error}=await dbDeletePost(cur.id);if(!error)removePost(cur.id);}
        return;
      }
      const ok=await saveToDb(markSaved({...d,history:[...(d.history||[]),{at:new Date().toISOString(),note:"閉じたときに保存"}]}));
      if(ok)showToast("ネタを保存しました");
      return;
    }
    const saved=Object.values(allPosts).flat().find(x=>x.id===cur.id);
    if(!saved||!isEmptyIdea(saved))return;
    const {error}=await dbDeletePost(saved.id);
    if(error){showToast("空のネタを消せませんでした");return;}
    removePost(saved.id);
  },[editing,allPosts,removePost,saveToDb,showToast]);

  // 新しいネタの裏の保存。中身があるときだけ表へ書く（空のネタは作らない）。前回と同じ中身なら書かない
  const lastAuto=useRef("");
  const pendingAuto=useRef(Promise.resolve()); // 走っている裏の保存（Notion へ送ったあと、終わるのを待ってから消すため）
  // 2026-11-10 軽量化 便1：既にある投稿の自動保存もここを通る。保存できたかを返す（エディタが「保存しました」を出すため）
  const autoSaveIdea=React.useCallback(p=>{
    if(!hasContent(p))return Promise.resolve(true);
    const clean=markSaved(p);
    const key=JSON.stringify([clean.id,clean.title,clean.memo,clean.body,clean.memoLinks,clean.mm_url,clean.status,clean.datetime,clean.postType,clean.account_id,clean.labels,clean.score,clean.thumb,clean.comments]);
    if(key===lastAuto.current)return pendingAuto.current;
    lastAuto.current=key;
    pendingAuto.current=Promise.resolve(saveToDb(clean)).then(ok=>ok!==false).catch(()=>false);
    pendingAuto.current.then(ok=>{if(!ok)lastAuto.current="";});
    return pendingAuto.current;
  },[saveToDb]);

  // 2026-10-06：アイデアメモを Notion へ送ったとき。裏の保存で表に入っていたら消し、コンテンツくんには残さない。
  // パネルでは続けて書けるよう、新しいアイデアメモをすぐ開く
  const sentToNotion=React.useCallback(async({id,label})=>{
    setEditing(null);
    await pendingAuto.current;
    lastAuto.current="";
    // 表に入っていたかは画面の手元の写しでは確かめきれないため、id を指定して必ず消す（無ければ何も起きない）
    const {error}=await dbDeletePost(id);
    if(!error)removePost(id);
    showToast(`${label} に入れました`);
    if(panel)setTimeout(()=>addIdeaAndEdit(panelAccRef.current?.id),0);
  },[removePost,showToast,panel,addIdeaAndEdit]);

  // 2026-10-06：サイドパネルは開いたらまずアイデアメモ（一覧は「← 一覧」で見る）。開いたときの 1 回だけ
  const panelOpened=useRef(false);
  useEffect(()=>{
    if(!panel||panelOpened.current||!uid||!panelAcc?.id)return;
    panelOpened.current=true;
    addIdeaAndEdit(panelAcc.id);
  },[panel,uid,panelAcc?.id,addIdeaAndEdit]);


  useEffect(()=>{
    const h=e=>{
      // ⌘K 検索
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();if(!panel)setQuickOpen(true);return;}
      // 入力中・修飾キーは無視
      const tag=e.target.tagName;
      if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||e.target.contentEditable==="true")return;
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      switch(e.key){
        // N：ネタ（アイデア）を足してメモ欄から書き始める／Shift+N：今までどおりの下書き
        case"n": e.preventDefault();addIdeaAndEdit(panel?panelAcc?.id:undefined);break;
        case"N": e.preventDefault();openNew();break;
        case"ArrowLeft":
          if(view==="calendar"){e.preventDefault();setWeek(d=>{const x=new Date(d);x.setDate(x.getDate()-7);return x;});}
          break;
        case"ArrowRight":
          if(view==="calendar"){e.preventDefault();setWeek(d=>{const x=new Date(d);x.setDate(x.getDate()+7);return x;});}
          break;
        case"c":case"C": e.preventDefault();setView(v=>{const ks=["calendar",v==="idea"||v==="out"?v:lastStock(),"metrics"];const i=ks.indexOf(v);return ks[(i+1)%ks.length];});break;
        case"e":case"E":
          if(preview){e.preventDefault();setPreview(null);setEditing({...preview});}
          break;
        case"Escape": if(!e.defaultPrevented)setPreview(null);break; // 上に重なった窓が先に閉じたときは、後ろのプレビューまで閉じない
        default:break;
      }
    };
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[view,preview,openNew,addIdeaAndEdit,panel,panelAcc]);

  const postsBySlot=React.useMemo(()=>{
    const m={};
    filtered.forEach(p=>{
      const key=`${p.datetime.slice(0,10)}_${p.datetime.slice(11,13)}`;
      (m[key]=m[key]||[]).push(p);
    });
    return m;
  },[filtered]);
  // 枠が空いているかは、絞り込みに関係なく全部の予定で見る（絞り込み中に埋まった枠へ二重に入れないため）
  const takenSlot=React.useMemo(()=>{
    const m=new Set();
    posts.forEach(p=>{if(p.status!=="idea"&&p.datetime)m.add(`${p.datetime.slice(0,10)}_${p.datetime.slice(11,13)}_${p.postType||"x_post"}`);});
    return m;
  },[posts]);

  // 過ぎた空き枠は出さない（もう入れられないため）。数えるのも、これからの枠だけ
  const nowHM=nowDt.slice(11,16);
  const slotGone=(dateStr,s)=>dateStr<today||(dateStr===today&&slotTime(s)<=nowHM);
  // 週ビューヘッダー統計（毎レンダーfilterを7×4回走らせないためuseMemoに）
  const weekStats=React.useMemo(()=>{
    return weekDateStrs.map((dateStr,i)=>{
      const dayPosts=filtered.filter(p=>p.datetime.startsWith(dateStr));
      return{
        draftCnt:dayPosts.filter(p=>p.status==="draft").length,
        reservedCnt:dayPosts.filter(p=>p.status==="reserved"||p.status==="waiting").length,
        publishedCnt:dayPosts.filter(p=>p.status==="published").length,
        ghostCnt:visibleSlots.filter(s=>slotMatchesDate(s,weekDates[i])&&!slotGone(dateStr,s)&&!takenSlot.has(`${dateStr}_${slotTime(s).slice(0,2)}_${s.postType||"x_post"}`)).length,
      };
    });
  },[filtered,weekDateStrs,weekDates,visibleSlots,takenSlot,today,nowHM]);// eslint-disable-line react-hooks/exhaustive-deps

  // 出す時間帯：ふだんは 7〜22 時。予定や枠がその外にあれば、その 1 時間前・後まで広げる
  const calHours=React.useMemo(()=>{
    const hs=[];
    filtered.forEach(p=>{if(weekDateStrs.includes(p.datetime.slice(0,10)))hs.push(+p.datetime.slice(11,13));});
    weekDates.forEach(d=>visibleSlots.filter(s=>slotMatchesDate(s,d)).forEach(s=>hs.push(+slotTime(s).slice(0,2))));
    const lo=Math.max(0,Math.min(7,...hs.map(h=>h-1))),hi=Math.min(23,Math.max(22,...hs.map(h=>h+1)));
    return HOURS.filter(h=>h>=lo&&h<=hi);
  },[filtered,weekDateStrs,weekDates,visibleSlots]);
  // 上の段の絞り込み：今週ある状態・種類だけを丸ボタンで出す
  const weekAll=React.useMemo(()=>posts.filter(p=>p.status!=="idea"&&weekDateStrs.includes((p.datetime||"").slice(0,10))),[posts,weekDateStrs]);

  const ghostBySlotRef=useRef({});
  const ghostBySlot=React.useMemo(()=>{
    const m={};
    weekDates.forEach((date,i)=>{
      visibleSlots.filter(s=>slotMatchesDate(s,date)).forEach(s=>{
        const key=`${weekDateStrs[i]}_${slotTime(s).slice(0,2)}`;
        (m[key]=m[key]||[]).push(s);
      });
    });
    ghostBySlotRef.current=m;
    return m;
  },[weekDates,weekDateStrs,visibleSlots]);

  if(loading)return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f0eb",fontFamily:"'Geist','Hiragino Sans','Noto Sans JP',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:22,fontWeight:900,color:"#111",marginBottom:10,letterSpacing:"0"}}>コンテンツ<span style={{color:"#f59e0b"}}>くん</span></div>
        <div style={{width:32,height:2,background:"#e6dfd6",borderRadius:99,margin:"0 auto",overflow:"hidden"}}>
          <div style={{width:"60%",height:"100%",background:"#f59e0b",borderRadius:99,animation:"slide 1s infinite"}}/>
        </div>
        <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:`'Geist','Hiragino Sans','Noto Sans JP',sans-serif`,background:"#f5f0eb",minHeight:"100vh",color:"#1a1a1a"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        :root{--bg:#f5f0eb;--accent:#f59e0b;} /* 2026-11-03 便 C：使われていない古い色の決まりを外した（色は CK_CSS の .ck が正本） */
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#d4cbbf;border-radius:99px;}
        ::-webkit-scrollbar-track{background:transparent;}
        button,select,input,textarea{font-family:inherit;}
        button{transition:opacity .12s,background .12s,box-shadow .12s,transform .08s;}
        button:active{transform:scale(.97);}
        input:focus,textarea:focus,select:focus{outline:none;}
        .xb{outline:none;}
        .xb:empty:before,.xb[data-ph]:empty:before{content:attr(data-ph);color:#736a62;pointer-events:none;}
        .xb p,.xb div{font-size:17px;line-height:1.8;color:#111;margin:0 0 1.2em;}
        .xb p:last-child,.xb div:last-child{margin-bottom:0;}
        .xb br{display:block;height:0;}
        .xb h1{font-size:26px;font-weight:800;line-height:1.3;margin:1.4em 0 .5em;color:#111;letter-spacing:-.3px;}
        .xb h2{font-size:19px;font-weight:700;line-height:1.4;margin:1.1em 0 .4em;color:#111;}
        .xb ul{list-style:disc;padding-left:1.5em;margin:.6em 0 1.2em;}
        .xb ol{list-style:decimal;padding-left:1.5em;margin:.6em 0 1.2em;}
        .xb li{font-size:17px;line-height:1.75;color:#111;margin:.15em 0;}
        .xb ul ul,.xb ol ul{list-style:circle;padding-left:1.5em;margin:.2em 0;}
        .xb blockquote{border-left:3px solid #e6dfd6;padding:6px 0 6px 16px;margin:.8em 0 1.2em;color:#6b6560;font-style:italic;font-size:17px;line-height:1.75;}
        .xb a{color:#2563eb;text-decoration:underline;}
        .xb hr{border:none;border-top:1px solid #e6dfd6;margin:1.5em 0;}
        .xb hr.thread-sep{border:none;border-top:none;margin:1.4em 0;display:flex;align-items:center;gap:8px;}
        .xb hr.thread-sep::before{content:"";flex:1;height:1.5px;background:linear-gradient(90deg,#1d9bf030,#1d9bf080);}
        .xb hr.thread-sep::after{content:"𝕏 スレッド続き";font-size:12px;font-weight:700;color:#1d9bf0;background:#e8f5fe;padding:2px 8px;border-radius:99px;border:1px solid #93d3fc;white-space:nowrap;flex-shrink:0;}
        .xb strong,.xb b{font-weight:700;}
        .xb em,.xb i{font-style:italic;}
        .xb s{text-decoration:line-through;}
        .xb img{max-width:100%;border-radius:8px;margin:.6em 0;display:block;}
      `}</style>

      {/* 段 4：/panel のときは細い画面だけを出す。広い画面（ヘッダー〜成績）は今のまま */}
      {panel&&<PanelView ws={<WsChip beforeSwitch={wsBeforeSwitch} onToast={showToast} note="ここで選んだ場所のネタと予定を見る（ほかの場所のデータは混ざらない）"/>} posts={panelAcc?(allPosts[panelAcc.id]||[]).filter(p=>!isTrashed(p)):[]} accounts={switchableAccounts} account={panelAcc} onAccount={setPanelAccId} postTypes={panelPostTypes} onAddIdea={()=>addIdeaAndEdit(panelAcc?.id)} onOpen={p=>{setPreview(null);setEditing({...p});}}
        onQuick={v=>quickAdd({...v,accId:panelAcc?.id})}
        renderFind={()=>{const ps=panelAcc?(allPosts[panelAcc.id]||[]).filter(p=>!isTrashed(p)):[];return <FindPanel posts={ps} postTypes={panelPostTypes} autoFocus
          targets={ps.filter(p=>["draft","review"].includes(p.status)).sort((a,b)=>(b.updated_at||b.created_at||"").localeCompare(a.updated_at||a.created_at||""))}
          onOpenPost={p=>{setPreview(null);setEditing({...p});}} onToInbox={r=>toInboxFrom(r,panelAcc?.id)} onAddLink={addLinkTo}/>;}}/>}
      {!panel&&<>
      {/* ── ヘッダー ── */}
      <div className="ck"><style>{CK_CSS+CK_PHONE_CSS}</style>
      <div className="ck-top">
        {(view==="idea"||view==="out")&&<button className="ck-ghost" style={{width:32,padding:0,justifyContent:"center",border:"0"}} aria-label="メニュー" onClick={()=>setNavOn(o=>!o)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>}
        <span className="ck-brand">{BRAND_ICON}<span>コンテンツくん<b>.</b></span></span>
        {!isClient&&<WsChip beforeSwitch={wsBeforeSwitch} onToast={showToast}/>}
        {isAdmin&&<AccountPill accounts={switchableAccounts} activeAcc={activeAcc||targetAcc} onPick={id=>{setActiveAccId(id);setPreview(null);}} onManage={()=>setShowAccountSettings(true)}/>}

        <nav className="ck-hm" aria-label="機能" data-tour="nav">
          {HEAD.map(([k,l])=>{
            const isData=k==="data";const on=isData?(view==="idea"||view==="out"):view===k;
            const n=isData?posts.filter(p=>p.status==="idea"&&!p.genre&&(p.postType||"x_post")==="x_post"&&!(p.labels||[]).includes("寝かせ")).length:0;
            // 2026-11-03 上の帯の整理：予約のまま日時が過ぎた数は、直す場所（カレンダー）のタブの横に赤丸と数で出す
            const late=k==="calendar"&&isAdmin?overdueCount:0;
            return <button key={k} className={on?"on":""} aria-current={on?"page":undefined} onClick={()=>setView(isData?(on?view:lastStock()):k)} aria-label={late?`${l}（予約のまま日時が過ぎた投稿 ${late} 件）`:n?`${l}（受け箱 ${n} 件）`:undefined} title={late?`予約のまま日時が過ぎた投稿 ${late} 件`:undefined}>{l}{n>0&&<span className="n" title="受け箱">{n}</span>}{late>0&&<span className="ck-late"><i/>{late}</span>}</button>;
          })}
        </nav>
        {/* 共有リンクバッジ */}
        {isClient&&(
          <div style={{...S.row,gap:6,flexShrink:0}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:activeAcc?.color,display:"inline-block"}}/>
            <span style={{fontWeight:700,fontSize:13}}>{activeAcc?.name}</span>
            <span style={{fontSize:12,color:"#2563eb",background:"#eff6ff",border:"1px solid #bfdbfe",padding:"2px 7px",borderRadius:99,fontWeight:600}}>共有</span>
          </div>
        )}

        {/* 右側コントロール */}
        <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
          <button className="ck-q" data-tour="quick" onClick={()=>setQuickOpen(true)} title="検索・追加（⌘K）" aria-label="検索・追加（⌘K）"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><span className="ql">検索・追加</span><span className="ck-kbd">⌘K</span></button>
          {!isClient&&<button data-tour="today" style={{display:"inline-flex",alignItems:"center",gap:6,height:32,padding:"0 8px",borderRadius:8,flexShrink:0}} title={`今日書いた字数 ${dayApi.todayRow.chars.toLocaleString()} 字（目安 ${(dayApi.todayRow.goal||3000).toLocaleString()} 字）`} onClick={()=>setView("metrics")}>
            <TodayRing chars={dayApi.todayRow.chars} goal={dayApi.todayRow.goal||3000}/><span className="ql" style={{fontSize:12,fontWeight:700,color:"var(--muted)",fontVariantNumeric:"tabular-nums"}}>{dayApi.todayRow.chars.toLocaleString()} 字</span></button>}
          <button className="ck-new" onClick={()=>openNew()}>＋ 新規</button>
          {isAdmin&&(
            <>
              <span className="ck-sep" aria-hidden="true"/>
              <div ref={shareRef} style={{position:"relative"}} data-tour="settings">
                <button className={`ck-ico ${showShare?"on":""}`} onClick={()=>setShowShare(s=>!s)} aria-label="設定" aria-expanded={showShare} title="設定">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
                </button>
                {showShare&&(
                  <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",border:BD2,borderRadius:12,padding:6,zIndex:100,width:200,boxShadow:"0 8px 24px rgba(0,0,0,.1)",display:"flex",flexDirection:"column",gap:1}}>
                    {[
                      ["予約枠",()=>{setShowSlotSettings(true);setShowShare(false);}],
                      ["型の管理",()=>{setShowTemplates(true);setShowShare(false);}],
                      ["書き出し（AI 用・ファイル・CSV）",()=>{setShowExport("ai");setShowShare(false);}], // 2026-11-03 便 C：3 つとも同じ窓だったので 1 つに。窓の中のタブで選ぶ
                      [owner?"クライアント管理":"アカウントの設定",()=>{setShowAccountSettings(true);setShowShare(false);}],
                    ].map(([label,fn])=>(
                      <button key={label} onClick={fn}
                        style={{border:"none",background:"none",borderRadius:7,padding:"8px 11px",fontSize:12,fontWeight:500,color:"#333",cursor:"pointer",textAlign:"left"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f5f0eb"}
                        onMouseLeave={e=>e.currentTarget.style.background="none"}>
                        {label}
                      </button>
                    ))}
                    {owner&&<div style={{borderTop:BD2,marginTop:2,paddingTop:6}}>{/* 共有リンクは Naoki がクライアントに見せる用。会員には出さない（2026-10-28） */}
                      <div style={{fontSize:12,color:"#736a62",fontWeight:600,padding:"2px 11px 5px",letterSpacing:".4px"}}>共有リンク</div>
                      {accounts.map(acc=>(
                        <div key={acc.id} style={{...S.row,gap:7,padding:"5px 11px"}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:acc.color,flexShrink:0}}/>
                          <span style={{fontSize:12,fontWeight:600,flex:1,color:"#333"}}>{acc.name}</span>
                          <button onClick={()=>{copyShareLink(acc.id);setShowShare(false);}}
                            style={{background:"#b45309",border:"none",borderRadius:6,padding:"3px 8px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer"}}>
                            コピー
                          </button>
                        </div>
                      ))}
                    </div>}
                  </div>
                )}
              </div>
            </>
          )}
          {!isClient&&<span ref={shellSlot} className="shell-slot" style={{display:"inline-flex",alignItems:"center"}}/>}
        </div>
      </div>
      <div className="ck-accline" style={{background:(activeAcc||targetAcc)?.color||"#f59e0b"}}/>

      {/* ── ネタ帳・アウトプット（2026-10-23 作り直し 1便） ── */}
      {(view==="idea"||view==="out")&&(targetAccId||isClient)&&(
        <StockView key={`${view}-${targetAccId}`} mode={view} uid={uid} owner={owner} onClearSamples={()=>clearSamples(targetAccId)} accountId={targetAccId} posts={posts} postTypes={allPostTypes}
          slots={slots} today={today} readOnly={isClient}
          onOpen={openPost} saveToDb={saveToDb} patchFields={patchFields} changeStatus={changeStatusB} onDelete={trashWithUndo} showToast={showToast}
          trash={trash} onRestore={restoreFromTrash} onPurge={deleteWithUndo} onUndoBar={(msg,run)=>setUndo({msg,run})}
          onNewIdea={preset=>addIdeaAndEdit(targetAccId,preset)} onNewOut={(dt,o)=>openNew(dt,o)}
          keysOff={!!editing||!!toOut||quickOpen||!!bufferFor||!!preview}
          onToOut={p=>setToOut(p)} navOn={navOn} setNavOn={setNavOn} onMode={m=>setView(m)}/>
      )}
      {quickOpen&&!panel&&<FindModal posts={posts} accountName={(activeAcc||targetAcc)?.name||""} postTypes={allPostTypes} onClose={()=>setQuickOpen(false)}
        onAdd={async v=>{if(await quickAdd(v))setQuickOpen(false);}} onOpenPost={p=>{setQuickOpen(false);openPost(p);}} onToInbox={r=>toInboxFrom(r)}/>}
      {toOut&&<ToOutModal post={toOut} postTypes={allPostTypes} slots={slots} posts={posts} today={today} onClose={()=>setToOut(null)} onGo={goOut}/>}
      </div>

      {/* ── カレンダーナビ ── */}
      {view==="calendar"&&(
        <div className="ck" style={{background:"#fff",borderBottom:BD2,padding:"5px 16px",display:"flex",alignItems:"center",gap:7,flexShrink:0,flexWrap:"wrap",rowGap:4}}>
          {activeAcc&&<span style={{width:7,height:7,borderRadius:"50%",background:activeAcc.color,display:"inline-block"}}/>}
          <span style={{fontWeight:700,fontSize:12.5,color:"#555",whiteSpace:"nowrap"}}>{activeAcc?.name}</span>
          <div style={{...S.row,gap:4,marginLeft:4}}>
            <button aria-label="前の週" title="前の週" onClick={()=>{const d=new Date(week);d.setDate(d.getDate()-7);setWeek(d);}}
              style={{border:BD2,background:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:14,color:"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <span style={{fontWeight:600,fontSize:12.5,minWidth:165,textAlign:"center",whiteSpace:"nowrap",color:"#333"}}>
              {weekDates[0].getMonth()+1}月{weekDates[0].getDate()}日 〜 {weekDates[6].getMonth()+1}月{weekDates[6].getDate()}日
            </span>
            <button aria-label="次の週" title="次の週" onClick={()=>{const d=new Date(week);d.setDate(d.getDate()+7);setWeek(d);}}
              style={{border:BD2,background:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:14,color:"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
            <button onClick={()=>setWeek(new Date())}
              style={{border:BD2,background:"#fff",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:12,color:"#555",fontFamily:"inherit"}}>今週</button><GQ id="calendar" n={1} style={{alignSelf:"center"}}/>
          </div>
          <div className="ck" style={{display:"inline-flex",gap:2,marginLeft:6}}>
            <button className={`ck-vtab ${calMode==="week"?"on":""}`} onClick={()=>setCalMode("week")}>週</button>
            <button className={`ck-vtab ${calMode==="list"?"on":""}`} onClick={()=>setCalMode("list")}>リスト</button><GQ id="calendar" n={2} style={{alignSelf:"center"}}/>
            <button className={`ck-vtab ${trayOn?"on":""}`} onClick={()=>setTrayOn(v=>!v)} title="右にネタと日時なしのアウトプットを出す">ネタの棚</button><GQ id="calendar" n={3} style={{alignSelf:"center"}}/>
          </div>
          <div className="ck-calf"><CalFilter groups={[
            {key:"st",label:"状態",sel:filterStatus,set:setFilter,items:Object.entries(STATUS).filter(([k])=>k!=="idea").map(([k,v])=>({k,label:v.label,n:weekAll.filter(p=>p.status===k&&(!filterPlatform.length||filterPlatform.includes(p.postType||"x_post"))).length})).filter(x=>x.n>0||filterStatus.includes(x.k))},
            {key:"pt",label:"種類",sel:filterPlatform,set:setFilterPlatform,items:Object.entries(allPostTypes).map(([k,v])=>({k,label:v.label,n:weekAll.filter(p=>(p.postType||"x_post")===k&&(!filterStatus.length||filterStatus.includes(p.status))).length})).filter(x=>x.n>0||filterPlatform.includes(x.k))},
          ]}/></div>
        </div>
      )}

      {/* ── カレンダービュー ── */}
      {view==="calendar"&&(
        <div className="ck"><style>{PLAN_CSS}</style><div className="ck-cal"><div className="ck-cal-main">
        {calMode==="list"?(
          <CalendarList weekDates={weekDates} weekDateStrs={weekDateStrs} today={today} posts={filtered} occupied={posts} slots={visibleSlots} postTypes={allPostTypes}
            dragId={dragId} setDragId={setDragId} onPlace={placeAt} onSwap={swapAt} onOpen={openPost} openNew={openNew}
            changeStatus={changeStatusB} onBuffer={p=>setBufferFor(p)}/>
        ):(
        <div style={{height:"calc(100vh - 100px)",overflow:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"48px repeat(7, 1fr)",minWidth:860}}>
            <div style={{background:"#fff",position:"sticky",top:0,zIndex:20,borderRight:"1px solid #e6dfd6",borderBottom:BD2}}/>
            {weekDates.map((date,i)=>{
              const dateStr=weekDateStrs[i];
              const isToday=dateStr===today;
              const{draftCnt,reservedCnt,publishedCnt,ghostCnt}=weekStats[i]||{};
              return(
                <div key={i} style={{background:"#fff",padding:"6px 5px 4px",textAlign:"center",borderBottom:BD2,borderRight:"1px solid #e6dfd6",position:"sticky",top:0,zIndex:20}}>
                  <div style={{fontSize:12,fontWeight:700,color:isToday?"#b45309":i>=5?"#b91c1c":"#736a62"}}>{DAYS[i]}</div>
                  <div style={{width:28,height:28,borderRadius:"50%",background:isToday?"#b45309":"transparent",display:"flex",alignItems:"center",justifyContent:"center",margin:"2px auto",fontSize:13,fontWeight:800,color:isToday?"#fff":"#1a1a1a"}}>{date.getDate()}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:2,justifyContent:"center",minHeight:14}}>
                    {draftCnt>0&&<span style={{fontSize:12,background:"#f3f4f6",color:"#4b5563",borderRadius:4,padding:"0 3px",fontWeight:700}} title={`下書き ${draftCnt} 件`}>下{draftCnt}</span>}
                    {reservedCnt>0&&<span style={{fontSize:12,background:"#ede9fe",color:"#7c3aed",borderRadius:4,padding:"0 3px",fontWeight:700}} title={`予約 ${reservedCnt} 件`}>予{reservedCnt}</span>}
                    {publishedCnt>0&&<span style={{fontSize:12,background:"#d1fae5",color:"#047857",borderRadius:4,padding:"0 3px",fontWeight:700}} title={`公開済 ${publishedCnt} 件`}>済{publishedCnt}</span>}
                    {ghostCnt>0&&<span style={{fontSize:12,background:"#fef3c7",color:"#b45309",borderRadius:4,padding:"0 3px",fontWeight:700}} title={`空いている予約枠 ${ghostCnt} 件`}>枠{ghostCnt}</span>}
                  </div>
                </div>
              );
            })}
            {calHours.map(hour=>(
              <React.Fragment key={hour}>
                <div style={{borderTop:"1px solid #ede8e0",padding:"3px 5px 0",fontSize:12,color:"#736a62",textAlign:"right",background:"#f5f0eb",borderRight:"1px solid #e6dfd6"}}>{hour}:00</div>
                {weekDates.map((date,di)=>{
                  const dateStr=weekDateStrs[di];
                  const key=dateStr+"_"+String(hour).padStart(2,"0");
                  const sp=postsBySlot[key]||[];
                  const isEmpty=sp.length===0;
                  return(
                    <div key={hour+"-"+di}
                      onClick={isEmpty?()=>openNew(`${dateStr}T${String(hour).padStart(2,"0")}:00`):undefined}
                      onDragOver={dragId?e=>{e.preventDefault();setDragOver(key);}:undefined}
                      onDragLeave={dragId?()=>setDragOver(null):undefined}
                      onDrop={dragId?e=>{e.preventDefault();const id=dragId;setDragId(null);setDragOver(null);placeCell(id,dateStr,hour);}:undefined}
                      style={{borderTop:"1px solid #ede8e0",borderRight:"1px solid #e6dfd6",padding:"3px",minHeight:42,
                        background:dragOver===key?"#fef9e7":dragId?"#fffdf5":dateStr===today?"#fffcf5":"#fff",
                        cursor:dragId?"copy":isEmpty?"pointer":"default",transition:"background .1s",
                        outline:dragOver===key?"2px dashed #f59e0b":"none",outlineOffset:-2}}
                      onMouseEnter={!dragId&&isEmpty?e=>{e.currentTarget.style.background=dateStr===today?"#fff8e8":"#f5f0eb";}:undefined}
                      onMouseLeave={!dragId&&isEmpty?e=>{e.currentTarget.style.background=dateStr===today?"#fffcf5":"#fff";}:undefined}>
                      {/* 実投稿 */}
                      {sp.map(p=>{
                        const pt2=getPostTypeStyle(p.postType,allPostTypes),st2=STATUS[p.status];
                        return(
                          <div key={p.id}
                            draggable
                            onDragStart={e=>{e.stopPropagation();setDragId(p.id);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/ck",String(p.id));}}
                            onDragEnd={()=>{setDragId(null);setDragOver(null);}}
                            onDragOver={dragId&&dragId!==p.id?e=>{e.preventDefault();e.stopPropagation();setDragOver("p"+p.id);}:undefined}
                            onDrop={dragId&&dragId!==p.id?e=>{e.preventDefault();e.stopPropagation();const id=dragId;setDragId(null);setDragOver(null);swapAt(id,p.id);}:undefined}
                            onClick={e=>{e.stopPropagation();setPreview(p);}}
                            onContextMenu={e=>openCtx(e,[{label:"開く",run:()=>setPreview(p)},{label:"タイトルをコピー",run:()=>{navigator.clipboard?.writeText(p.title||"").then(()=>showToast("タイトルをコピーしました"),()=>showToast("コピーできませんでした"));}},{label:"複製",run:()=>handleDuplicate(p)},{label:"ゴミ箱へ移動",danger:true,run:()=>trashWithUndo(p)}])}
                            style={{background:"#fff",border:`1.5px solid ${pt2.border}`,borderLeft:`3px solid ${pt2.dot}`,borderRadius:6,padding:"3px 5px",marginBottom:2,cursor:"grab",transition:"all .1s",opacity:dragId===p.id?0.5:1,outline:dragOver==="p"+p.id?"2px solid #f59e0b":"none"}}
                            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 2px 8px #0000001a";e.currentTarget.style.borderColor=pt2.color;}}
                            onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor=pt2.border;}}>
                            <div style={{...S.row,gap:3,marginBottom:1}}>
                              <span style={{width:5,height:5,borderRadius:"50%",background:pt2.dot,flexShrink:0}}/>
                              <span style={{fontSize:12,color:"#6b6259"}}>{fmtTime(p.datetime)}</span>
                              {p.buffer_post_id&&<span title="Buffer に入っています" style={{fontSize:12,fontWeight:800,color:"#047857",background:"#d1fae5",borderRadius:3,padding:"0 3px",marginLeft:p.score?0:"auto"}}>Buffer</span>}
                              {p.score&&<span style={{fontSize:12,fontWeight:800,color:SCORE[p.score]?.color,background:SCORE[p.score]?.bg,borderRadius:3,padding:"0 3px",marginLeft:"auto"}}>{p.score}</span>}
                            </div>
                            <div style={{fontSize:12,fontWeight:700,color:"#0f1419",lineHeight:1.3,whiteSpace:"normal",wordBreak:"break-word"}}>{(p.title||"（タイトルなし）").slice(0,32)}{(p.title||"").length>32?"…":""}</div>
                            <select value={p.status} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();changeStatusB(p.id,e.target.value,p.score);}}
                              style={{marginTop:3,width:"100%",border:`1px solid ${st2?.border}`,borderRadius:5,padding:"2px 4px",fontSize:12,fontWeight:700,color:st2?.text,background:st2?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                              {Object.entries(STATUS).filter(([k])=>k!=="idea").map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                        );
                      })}
                      {/* ゴースト枠（実投稿で埋まっていないもののみ表示） */}
                      {(()=>{
                        const ghosts=(ghostBySlot[key]||[]).filter(g=>!takenSlot.has(`${key}_${g.postType||"x_post"}`)&&!slotGone(dateStr,g));
                        if(ghosts.length===0)return null;
                        const multi=ghosts.length>1;
                        return multi?(
                          <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                            {ghosts.map((g,gi)=>{
                              const gpt=getPostTypeStyle(g.postType,allPostTypes);
                              return(
                                <div key={"g"+gi}
                                  onClick={e=>{e.stopPropagation();openNew(`${dateStr}T${slotTime(g)}`,{title:g.title||"",postType:g.postType||"x_post"});}}
                                  style={{flex:"1 1 0",minWidth:0,border:`1.5px dashed ${gpt.dot}`,borderLeft:`3px dashed ${gpt.dot}`,borderRadius:5,padding:"3px 4px",cursor:"pointer",opacity:0.92,transition:"all .15s",background:gpt.bg}}
                                  onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.boxShadow="0 1px 6px #0000001a";}}
                                  onMouseLeave={e=>{e.currentTarget.style.opacity="0.92";e.currentTarget.style.boxShadow="none";}}>
                                  <div style={{...S.row,gap:2,marginBottom:1}}>
                                    <span style={{width:4,height:4,borderRadius:"50%",background:gpt.dot,flexShrink:0}}/>
                                    <span style={{fontSize:12,color:gpt.color,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{gpt.label}</span>
                                  </div>
                                  <div style={{fontSize:12,color:"#6b6259",fontWeight:600,lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {g.title||"予約枠"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ):(
                          ghosts.map((g,gi)=>{
                            const gpt=getPostTypeStyle(g.postType,allPostTypes);
                            return(
                              <div key={"g"+gi}
                                onClick={e=>{e.stopPropagation();openNew(`${dateStr}T${slotTime(g)}`,{title:g.title||"",postType:g.postType||"x_post"});}}
                                style={{border:`1.5px dashed ${gpt.dot}`,borderLeft:`3px dashed ${gpt.dot}`,borderRadius:6,padding:"4px 6px",marginBottom:2,cursor:"pointer",opacity:0.92,transition:"all .15s",background:gpt.bg}}
                                onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.boxShadow="0 1px 6px #0000001a";}}
                                onMouseLeave={e=>{e.currentTarget.style.opacity="0.92";e.currentTarget.style.boxShadow="none";}}>
                                <div style={{...S.row,gap:3}}>
                                  <span style={{width:4,height:4,borderRadius:"50%",background:gpt.dot,flexShrink:0}}/>
                                  <span style={{fontSize:12,color:gpt.color,fontWeight:700}}>{slotTime(g)}</span>
                                </div>
                                {g.title
                                  ?<div style={{fontSize:12,fontWeight:700,color:"#6b6259",lineHeight:1.3,marginTop:1}}>{g.title.slice(0,12)}{g.title.length>12?"…":""}</div>
                                  :<div style={{fontSize:12,color:"#736a62",lineHeight:1.3}}>予約枠</div>
                                }
                                <span style={{fontSize:12,color:gpt.color,fontWeight:700,background:"#fff",border:`1px solid ${gpt.border}`,padding:"0 4px",borderRadius:6,marginTop:2,display:"inline-block"}}>{gpt.label}</span>
                              </div>
                            );
                          })
                        );
                      })()}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
        )}
        </div>
        <IdeaTray open={trayOn} ideas={trayIdeas} undated={trayUndated} postTypes={allPostTypes} dragStart={trayDragStart} dragEnd={trayDragEnd} onOpen={openPost} onNext={toNextSlot}/>
        </div></div>
      )}
      {bufferFor&&<BufferModal post={bufferFor} onClose={()=>setBufferFor(null)} onDone={(bid,warn)=>bufferDone(bufferFor.id,bid,warn)}/>}

      {/* シートはアウトプットの「シート」へ移した（2026-10-23） */}

      {/* ── 成績ビュー（Buffer から戻ってきた数字） ── */}
      {/* ステータスの絞り込みは通さない。数字の有無で絞るほうが目的に合うため */}
      {view==="metrics"&&!isClient&&<ReviewView days={dayApi.days} today={dayApi.today} todayRow={dayApi.todayRow} ready={dayApi.ready} err={dayApi.err} saveDay={dayApi.saveDay}
        posts={posts} postTypes={allPostTypes} onOpen={openPost}/>}
      {view==="metrics"&&(
        <MetricsView
          posts={posts}
          activeAcc={activeAcc||targetAcc}
          setPreview={setPreview}
          postTypes={allPostTypes}
        />
      )}

      </>}

      {/* 2026-11-03 便 B：窓の群も .ck の中に置き、スマホの決まり（字 16px・押す所 44px）を効かせる。囲みは見た目に出ない */}
      <div className="ck" style={{display:"contents"}}>
      {/* ── 予約枠設定モーダル ── */}
      {showSlotSettings&&isAdmin&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
          onClick={e=>{if(e.target===e.currentTarget)setShowSlotSettings(false);}}>
          <DialogFocus onClose={()=>setShowSlotSettings(false)}>{box=>(
          <div ref={box} role="dialog" aria-modal="true" aria-labelledby="slot-settings-title" style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000030"}}>
            <div style={{padding:"14px 18px",borderBottom:BD2,display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f5f0eb"}}>
              <div>
                <div id="slot-settings-title" style={{fontWeight:800,fontSize:14}}>予約枠の設定</div>
                <div style={{fontSize:12,color:"#736a62",marginTop:2}}>カレンダーに空いている枠として薄く出ます</div>
              </div>
              <Btn onClick={()=>setShowSlotSettings(false)}>閉じる</Btn>
            </div>
            {/* フォーム（固定） */}
            <div style={{padding:"14px 18px",borderBottom:BD2}}>
              <SlotAddForm postTypes={allPostTypes} onAdd={s=>{
                saveSlots([...slots,{...s,id:genId()}]);
              }}/>
            </div>
            {/* 枠一覧（スクロール可能） */}
            <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"12px 18px 24px"}}>
              {slots.length===0
                ?<div style={{textAlign:"center",color:"#736a62",fontSize:13,padding:"20px 0"}}>枠がまだありません</div>
                :slots.map((s,i)=>{
                  const pt=getPostTypeStyle(s.postType,allPostTypes);
                  return(
                    <div key={s.id} style={{...S.row,gap:8,background:"#f8f5f1",border:BD2,borderRadius:9,padding:"7px 10px",marginBottom:6}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:pt.dot,flexShrink:0}}/>
                      <span style={{fontSize:12,fontWeight:700,color:"#555",whiteSpace:"nowrap",flexShrink:0}}>{slotLabel(s)}</span>
                      <input
                        value={s.title||""}
                        onChange={e=>{const v=e.target.value;saveSlots(prev=>prev.map((x,j)=>j===i?{...x,title:v}:x));}}
                        placeholder="仮タイトル"
                        style={{flex:1,minWidth:0,border:"none",borderBottom:BD,borderRadius:0,padding:"2px 4px",fontSize:12,fontFamily:"inherit",color:"#1a1a1a",outline:"none",background:"transparent"}}
                        onFocus={e=>e.target.style.borderBottomColor="#f59e0b"}
                        onBlur={e=>e.target.style.borderBottomColor="#e0d8ce"}
                      />
                      <span style={{fontSize:12,color:pt.color,background:pt.bg,border:`1px solid ${pt.border}`,padding:"1px 7px",borderRadius:10,fontWeight:700,flexShrink:0}}>{pt.label}</span>
                      <button aria-label="この予約枠を消す" title="この予約枠を消す" onClick={()=>{const before=slots;saveSlots(slots.filter((_,j)=>j!==i));setUndo({msg:"予約枠を 1 つ消しました",run:()=>saveSlots(before)});}}
                        style={{border:"none",background:"none",color:"#b91c1c",cursor:"pointer",fontSize:15,fontWeight:700,flexShrink:0,padding:"0 4px"}}>×</button>
                    </div>
                  );
                })
              }
            </div>
          </div>
          )}</DialogFocus>
        </div>
      )}


      {/* ── エクスポートモーダル ── */}
      {showExport&&isAdmin&&(
        <ExportModal
          tab={showExport}
          posts={posts}
          accountName={activeAcc?.name||""}
          allPostTypes={allPostTypes}
          onClose={()=>setShowExport(null)}
        />
      )}

      {/* ── モーダル群 ── */}
      {/* 2026-11-07 Notion の形へ 便②：プレビューの窓はなくした。開くときは下の決まりで、いつもエディタへ直接入る */}

      {editing&&<EditorModal post={{postType:'x_post',body:'',memo:'',memoLinks:[],comments:[],history:[],account_id:targetAccId,...editing}} onSave={panel?(async p=>{await save(markSaved(p));setPreview(null);setEditing(null);}):(p=>save(markSaved(p)))} onDuplicate={panel?undefined:handleDuplicate} onRepost={panel?undefined:(p=>setRepostTgt(p))} onDelete={panel?undefined:trashWithUndo} onClose={closeEditor} allPosts={posts} accounts={switchableAccounts} compact={panel} onAutoSave={autoSaveIdea} onSentToNotion={panel&&owner?sentToNotion:undefined} owner={owner} templates={templates} postTypes={shownPostTypes} onManageTemplates={id=>setShowTemplates(typeof id==="string"?{id}:true)}/>}
      {showTemplates&&<TemplatesModal uid={uid} templates={templates} setTemplates={setTemplates} postTypes={shownPostTypes} initialId={showTemplates?.id||null} onClose={()=>setShowTemplates(false)}/>}


      <CtxMenuHost/>
      {repostTgt&&<RepostModal post={repostTgt} onClose={()=>setRepostTgt(null)}
        onRepost={(dt,r)=>handleRepost(repostTgt,dt,r)}/>}

      {showAccountSettings&&isAdmin&&(
        <AccountSettings
          accounts={accounts}
          activeAcc={activeAcc}
          onUpdate={updateAccount}
          onAdd={owner?addAccount:undefined} /* 会員は 1 メールにアカウント 1 つ（2026-10-28 Naoki「基本的に 1 メアド 1 アカウント」）。複数はプランの決まりができてから */
          onCopyLink={copyShareLink}
          onSetDefault={setDefaultAccount}
          onSetActive={setAccountActive}
          onMove={moveAccount}
          onClose={()=>setShowAccountSettings(false)}/>
      )}

      {/* 削除確認ダイアログ */}

      </div>
      {/* 2026-11-03 便 B：知らせは読み上げにも届く。いつも置いておき、中身だけ入れ替える */}
      {undo&&<div role="status" aria-live="polite" style={{position:"fixed",bottom:toast?76:24,left:"50%",transform:"translateX(-50%)",background:"#1a1a1a",color:"#fff",padding:"8px 8px 8px 18px",borderRadius:10,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:14,zIndex:9999,boxShadow:"0 8px 24px rgba(0,0,0,.18)",maxWidth:"min(560px,calc(100vw - 32px))"}}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{undo.msg}</span>
        <button onClick={runUndo} style={{background:"#fff",color:"#1a1a1a",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12.5,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>元に戻す</button>
      </div>}
      <div role="status" aria-live="polite" style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1a1a1a",color:"#fff",padding:toast?"10px 18px":0,borderRadius:10,fontSize:13,fontWeight:600,lineHeight:1.6,maxWidth:"min(560px,calc(100vw - 32px))",zIndex:9999,boxShadow:toast?"0 8px 24px rgba(0,0,0,.18)":"none",pointerEvents:"none",opacity:toast?1:0,transition:"opacity .15s"}}>{toast||""}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// PortalAuthWrapper — Firebase認証 + Firestore権限チェック
// ════════════════════════════════════════════════════════
const GATE_URL="https://shia2n-mcp.gameister1.workers.dev/gate/resolve";
async function gateAllows(user){
  try{
    const token=await user.getIdToken();
    const r=await fetch(GATE_URL,{method:"POST",headers:{Authorization:`Bearer ${token}`}});
    const b=await r.json().catch(()=>null);
    return !!(b&&b.ok===true&&Array.isArray(b.apps)&&b.apps.includes("content-os"));
  }catch{return false;}
}
function PortalAuthWrapper({children}){
  const [state,setState]=useState("loading");
  const [uid,setUid]=useState(null);
  const [admin,setAdmin]=useState(false); // 2026-10-28：管理者（Firestore の role が admin）か。会員の画面で Naoki 専用のものを出さないために使う

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,async user=>{
      if(!user){setState("unauthed");return;}
      try{
        const snap=await getDoc(doc(db,"users",user.uid));
        const d=snap.exists()?snap.data():{}; // 2026-10-28：Firestore に行が無い会員も、門番の答えで決める
        const isAdmin=d.role==="admin";
        // 2026-10-28 開発部（会員公開の関門 1）：管理者でない人は、門番の答え（権利の表 member_access に content-os があるか）で決める。
        // ほかのアプリ（shia2n-core の AuthGuard）と同じ決め方。それまでは Firestore の paid と個別許可で決めていた
        const isMember=!isAdmin&&await gateAllows(user);
        if(isAdmin||isMember){setAdmin(isAdmin);setUid(user.uid);setState("allowed");}
        else setState("denied");
      }catch(e){
        console.error(e);
        setState("denied");
      }
    });
    return()=>unsub();
  },[]);

  if(state==="loading") return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f0eb",fontFamily:"'Geist','Hiragino Sans','Noto Sans JP',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:22,fontWeight:900,marginBottom:12,letterSpacing:"0"}}>コンテンツ<span style={{color:"#f59e0b"}}>くん</span></div>
        <div style={{width:32,height:2,background:"#e6dfd6",borderRadius:99,margin:"0 auto",overflow:"hidden"}}>
          <div style={{width:"60%",height:"100%",background:"#f59e0b",borderRadius:99,animation:"slide 1s infinite"}}/>
        </div>
        <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
      </div>
    </div>
  );

  if(state==="unauthed") return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f0eb",fontFamily:"'Geist','Hiragino Sans','Noto Sans JP',sans-serif"}}>
      <div style={{background:"#fff",borderRadius:16,padding:"44px 48px",textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,.08)",maxWidth:360,width:"100%",border:BD2}}>
        <div style={{fontSize:22,fontWeight:900,marginBottom:4,letterSpacing:"0"}}>コンテンツ<span style={{color:"#f59e0b"}}>くん</span></div>
        <div style={{fontSize:12.5,color:"#736a62",marginBottom:32}}>コンテンツ管理ツール</div>
        <button
          onClick={()=>signInWithPopup(auth,googleProvider).catch(console.error)}
          style={{...S.row,gap:10,margin:"0 auto",border:BD2,borderRadius:10,padding:"11px 22px",fontSize:13.5,fontWeight:600,cursor:"pointer",background:"#fff",fontFamily:"inherit",color:"#333",boxShadow:"0 1px 4px rgba(0,0,0,.06)",transition:"all .12s"}}
          onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)";e.currentTarget.style.transform="translateY(-1px)";}}
          onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.06)";e.currentTarget.style.transform="none";}}>
          <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Googleでログイン
        </button>
        <a href={PORTAL_URL} style={{display:"block",marginTop:24,fontSize:12,color:"#736a62",textDecoration:"none",letterSpacing:".2px"}}
          onMouseEnter={e=>e.currentTarget.style.color="#6b6259"}
          onMouseLeave={e=>e.currentTarget.style.color="#736a62"}>
          ポータルサイトへ戻る →
        </a>
      </div>
    </div>
  );

  if(state==="denied"){
    window.location.href=PORTAL_URL;
    return null;
  }

  return children(uid,admin);
}

// ── ポータル認証付きエクスポート ──
export default function AppWithAuth(){
  // 診断画面（要件 v1.2 §7・基準9）。/diag または ?diag=1 で開く
  // ログインの前に確認できるようにするため、認証の外側で分岐する
  if(typeof window!=="undefined"){
    const path=window.location.pathname.replace(/\/+$/,"");
    const hasQuery=new URLSearchParams(window.location.search).has("diag");
    if(path==="/diag"||hasQuery)return <DiagPanel/>;
  }
  // 段 4：拡張機能のサイドパネルが枠で開く細い画面。ログインと権限は今と同じ
  const isPanel=typeof window!=="undefined"&&window.location.pathname.replace(/\/+$/,"")==="/panel";
  return(
    <PortalAuthWrapper>
      {(uid,admin)=><App uid={uid} panel={isPanel} owner={admin}/>}
    </PortalAuthWrapper>
  );
}
