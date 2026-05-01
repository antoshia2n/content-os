import React, { useState, useRef, useEffect } from "react";
import { auth, db, googleProvider } from "./firebase.js";
import { onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  PORTAL_APP_ID, PORTAL_URL,
  POST_TYPE, STATUS, SCORE,
  DAYS, HOURS, COLORS, BD, BD2, S,
  OVERDUE_STATUS,
  
  
  fmtDate, fmtTime, slotTime, genId, nowStr,
  nextDaySameTime, getWeekDates, dbToPost, getUrlParams,
} from "./constants.js";
import {
  dbFetchAccounts, dbInsertAccount, dbUpdateAccount, dbDeleteAccount, dbFetchAllAccounts,
  dbFetchPosts, dbUpsertPost, dbDeletePost, dbUpdatePost,
  supabase,
} from "./lib/supabase.js";
import {
  EditorModal,
} from "./screens/EditorModal.jsx";
import {
  PreviewOverlay,
} from "./screens/PreviewOverlay.jsx";
import {
  AccountSettings,
} from "./screens/AccountSettings.jsx";
import {
  MonthView, ListView, SlotAddForm, slotLabel, slotMatchesDate,
} from "./screens/CalendarView.jsx";
import {
  ExportModal,
} from "./screens/ExportModal.jsx";
import {
  NotifySettingsModal,
} from "./screens/NotifySettingsModal.jsx";
import {
  RepostModal, SearchModal,
} from "./components/modals.jsx";
import { Btn } from "./components/shared.jsx";
import { usePostActions } from "./hooks/usePostActions.js";
import { useSlots } from "./hooks/useSlots.js";
import { useAccounts } from "./hooks/useAccounts.js";


const {isClient:_isClient,accountId:_urlAccountId}=getUrlParams();

function App({uid}){
  const isClient=_isClient,urlAccountId=_urlAccountId;
  const isAdmin=!isClient;

  // ── UI State ──────────────────────────────────────────
  const [toast,              setToast]              = useState(null);
  const showToast=React.useCallback((msg)=>{setToast(msg);setTimeout(()=>setToast(null),2500);},[]);

  // ── データフック（showToast が必要なため先に定義）──────
  const {
    accounts, setAccounts, allPosts, setAllPosts, activeAccId, setActiveAccId, loading,
    addAccount, updateAccount, deleteAccount, copyShareLink,
  } = useAccounts({ uid, urlAccountId, isClient, showToast });

  // ── 残りの UI State ────────────────────────────────────
  const [view,               setView]               = useState("calendar");
  const [week,               setWeek]               = useState(new Date());
  const [preview,            setPreview]            = useState(null);
  const [editing,            setEditing]            = useState(null);
  const [filterStatus,       setFilter]             = useState("all");
  const [filterPlatform,     setFilterPlatform]     = useState("all");
  const [showShare,          setShowShare]          = useState(false);
  const [showAccountSettings,setShowAccountSettings]= useState(false);
  const [showSearch,         setShowSearch]         = useState(false);
  const [repostTgt,          setRepostTgt]          = useState(null);
  const [deleteConfirm,      setDeleteConfirm]      = useState(null);
  const [showSlotSettings,   setShowSlotSettings]   = useState(false);
  const [dragId,             setDragId]             = useState(null);
  const [dragOver,           setDragOver]           = useState(null);
  const [showNotifySettings, setShowNotifySettings] = useState(false);
  const [notifySettings,     setNotifySettings]     = useState(null);
  const [showExport,         setShowExport]         = useState(null);
  const shareRef=useRef(null);
  useEffect(()=>{
    if(!showShare)return;
    const h=e=>{if(shareRef.current&&!shareRef.current.contains(e.target))setShowShare(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[showShare]);

  const [today,setToday]=useState(()=>fmtDate(new Date()));
  const [nowDt,setNowDt] =useState(()=>new Date().toISOString().slice(0,16));
  useEffect(()=>{
    const tick=()=>{
      setToday(fmtDate(new Date()));
      setNowDt(new Date().toISOString().slice(0,16));
    };
    const id=setInterval(tick,60000);
    return()=>clearInterval(id);
  },[]);
  const weekDates   =React.useMemo(()=>getWeekDates(week),[week]);
  const weekDateStrs=React.useMemo(()=>weekDates.map(fmtDate),[weekDates]);
  const activeAcc    =React.useMemo(()=>accounts.find(a=>a.id===activeAccId),[accounts,activeAccId]);
  // アカウント固有のカスタム投稿タイプ（POST_TYPEにマージして使う）
  const allPostTypes =React.useMemo(()=>{
    const custom=(activeAcc?.custom_post_types||[]);
    const merged={...POST_TYPE};
    custom.forEach(c=>{merged[c.key]={label:c.label,color:c.color,bg:c.bg||"#f3f4f6",border:c.border||"#d1d5db",dot:c.color};});
    return merged;
  },[activeAcc]);
  const posts    =React.useMemo(()=>allPosts[activeAccId]||[],[allPosts,activeAccId]);
  const filtered =React.useMemo(()=>posts.filter(p=>(filterStatus==="all"||p.status===filterStatus)&&(filterPlatform==="all"||p.postType===filterPlatform)),[posts,filterStatus,filterPlatform]);
  const allLabels=React.useMemo(()=>{const s=new Set();posts.forEach(p=>(p.labels||[]).forEach(l=>s.add(l)));return[...s].sort();},[posts]);
  // ⑨ 未投稿アラート：予約済みのまま期限が過ぎた投稿数
  const overdueCount=React.useMemo(()=>
    posts.filter(p=>p.status===OVERDUE_STATUS&&p.datetime<=nowDt).length
  ,[posts,nowDt]);

  const { slots, saveSlots } = useSlots({ activeAccId, uid, showToast });
  const {
    saveToDb, save, del, changeStatus, changePostType,
    saveMeta, saveComment, handleRepost, handleDuplicate,
    addCustomPostType, handleDrop, openNew,
  } = usePostActions({ activeAccId, uid, showToast, setAllPosts, setPreview, setEditing,
    setDeleteConfirm, setRepostTgt, today, posts, activeAcc });

  const saveNotifySettings=React.useCallback(async(s)=>{
    setNotifySettings(s);
    await supabase.from("notification_settings").upsert({...s,account_id:activeAccId});
    showToast("通知設定を保存しました ✅");
  },[activeAccId,showToast]);

  // メール通知設定ロード
  useEffect(()=>{
    if(!activeAccId)return;
    supabase.from("notification_settings").select("*").eq("account_id",activeAccId).single()
      .then(({data})=>{
        if(data)setNotifySettings(data);
        else setNotifySettings({account_id:activeAccId,email:"",notify_overdue:true,notify_today:true,notify_daily:false,send_hour:8,enabled:false});
      });
  },[activeAccId]);

  const handleTestSend=React.useCallback(async(email)=>{
    if(!email){alert("メールアドレスを入力してください");return;}
    try{
      const res=await fetch("/api/cron-notify",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({accountId:activeAccId,testMode:true,email}),
      });
      const d=await res.json();
      if(res.ok)showToast("テストメールを送信しました ✅");
      else alert("送信失敗:\n"+(d.error||JSON.stringify(d)));
    }catch(e){
      alert("通信エラー: "+e.message);
    }
  },[activeAccId,showToast]);

  useEffect(()=>{
    const h=e=>{
      // ⌘K 検索
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setShowSearch(true);return;}
      // 入力中・修飾キーは無視
      const tag=e.target.tagName;
      if(tag==="INPUT"||tag==="TEXTAREA"||e.target.contentEditable==="true")return;
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      switch(e.key){
        case"n":case"N": e.preventDefault();openNew();break;
        case"ArrowLeft":
          if(view==="calendar"){e.preventDefault();setWeek(d=>{const x=new Date(d);x.setDate(x.getDate()-7);return x;});}
          break;
        case"ArrowRight":
          if(view==="calendar"){e.preventDefault();setWeek(d=>{const x=new Date(d);x.setDate(x.getDate()+7);return x;});}
          break;
        case"c":case"C": e.preventDefault();setView(v=>v==="calendar"?"month":v==="month"?"list":"calendar");break;
        case"e":case"E":
          if(preview){e.preventDefault();setPreview(null);setEditing({...preview});}
          break;
        case"Escape": setPreview(null);break;
        default:break;
      }
    };
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[view,preview,openNew]);

  const postsBySlot=React.useMemo(()=>{
    const m={};
    filtered.forEach(p=>{
      const key=`${p.datetime.slice(0,10)}_${p.datetime.slice(11,13)}`;
      (m[key]=m[key]||[]).push(p);
    });
    return m;
  },[filtered]);

  // 週ビューヘッダー統計（毎レンダーfilterを7×4回走らせないためuseMemoに）
  const weekStats=React.useMemo(()=>{
    return weekDateStrs.map((dateStr,i)=>{
      const dayPosts=filtered.filter(p=>p.datetime.startsWith(dateStr));
      return{
        draftCnt:dayPosts.filter(p=>p.status==="draft").length,
        reservedCnt:dayPosts.filter(p=>p.status==="reserved"||p.status==="waiting").length,
        publishedCnt:dayPosts.filter(p=>p.status==="published"||p.status==="popular").length,
        ghostCnt:slots.filter(s=>slotMatchesDate(s,weekDates[i])).length,
      };
    });
  },[filtered,weekDateStrs,weekDates,slots]);

  const ghostBySlot=React.useMemo(()=>{
    const m={};
    weekDates.forEach((date,i)=>{
      slots.filter(s=>slotMatchesDate(s,date)).forEach(s=>{
        const key=`${weekDateStrs[i]}_${slotTime(s).slice(0,2)}`;
        (m[key]=m[key]||[]).push(s);
      });
    });
    return m;
  },[weekDates,weekDateStrs,slots]);

  if(loading)return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f0eb",fontFamily:"'Geist','Hiragino Sans','Noto Sans JP',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:22,fontWeight:900,color:"#111",marginBottom:10,letterSpacing:"-0.8px"}}>Content<span style={{color:"#f59e0b"}}>OS</span></div>
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
        :root{
          --bg:#f5f0eb;
          --surface:#fff;
          --border:#e6dfd6;
          --border-strong:#d4cbbf;
          --text-primary:#111;
          --text-secondary:#6b6560;
          --text-muted:#a8a09a;
          --accent:#f59e0b;
          --accent-hover:#e08c00;
          --accent-light:#fef3c7;
          --radius-sm:6px;
          --radius-md:10px;
          --radius-lg:14px;
          --radius-xl:20px;
          --shadow-sm:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
          --shadow-md:0 4px 12px rgba(0,0,0,.08),0 2px 4px rgba(0,0,0,.04);
          --shadow-lg:0 20px 48px rgba(0,0,0,.12),0 8px 16px rgba(0,0,0,.06);
        }
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#d4cbbf;border-radius:99px;}
        ::-webkit-scrollbar-track{background:transparent;}
        button,select,input,textarea{font-family:inherit;}
        button{transition:opacity .12s,background .12s,box-shadow .12s,transform .08s;}
        button:active{transform:scale(.97);}
        input:focus,textarea:focus,select:focus{outline:none;}
        .xb{outline:none;}
        .xb:empty:before,.xb[data-ph]:empty:before{content:attr(data-ph);color:#a8a09a;pointer-events:none;}
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
        .xb hr.thread-sep::after{content:"𝕏 スレッド続き";font-size:10px;font-weight:700;color:#1d9bf0;background:#e8f5fe;padding:2px 8px;border-radius:99px;border:1px solid #93d3fc;white-space:nowrap;flex-shrink:0;}
        .xb strong,.xb b{font-weight:700;}
        .xb em,.xb i{font-style:italic;}
        .xb s{text-decoration:line-through;}
        .xb img{max-width:100%;border-radius:8px;margin:.6em 0;display:block;}
        .chip{display:inline-flex;align-items:center;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:.2px;}
        .btn-ghost{background:none;border:1.5px solid var(--border);color:var(--text-secondary);border-radius:var(--radius-md);padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;}
        .btn-ghost:hover{background:#f5f0eb;border-color:var(--border-strong);color:var(--text-primary);}
        .btn-primary{background:var(--accent);border:none;color:#fff;border-radius:var(--radius-md);padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;}
        .btn-primary:hover{background:var(--accent-hover);}
      `}</style>

      {/* ── ヘッダー ── */}
      <div style={{background:"#fff",borderBottom:BD2,padding:"0 16px",display:"flex",alignItems:"center",gap:8,height:50,boxShadow:"0 1px 3px rgba(0,0,0,.04)",flexShrink:0,position:"relative",zIndex:50}}>
        <span style={{fontWeight:900,fontSize:16,letterSpacing:"-0.6px",flexShrink:0,color:"#111"}}>Content<span style={{color:"#f59e0b"}}>OS</span></span>
        <div style={{width:1,height:18,background:"#e6dfd6",flexShrink:0,marginLeft:2}}/>

        {/* 管理者：アカウントタブ */}
        {isAdmin&&(
          <div style={{display:"flex",gap:2,background:"#f5f0eb",borderRadius:8,padding:2,maxWidth:400,overflow:"auto",flexShrink:0}}>
            {accounts.map(acc=>(
              <button key={acc.id} onClick={()=>{setActiveAccId(acc.id);setPreview(null);}}
                style={{...S.row,gap:5,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:600,fontSize:11.5,background:activeAccId===acc.id?"#fff":"transparent",color:activeAccId===acc.id?"#111":"#a8a09a",boxShadow:activeAccId===acc.id?"0 1px 4px rgba(0,0,0,.08)":"none",whiteSpace:"nowrap",fontFamily:"inherit",transition:"all .12s"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:activeAccId===acc.id?acc.color:"#ccc",display:"inline-block",flexShrink:0}}/>
                {acc.name}
              </button>
            ))}
            <button onClick={addAccount}
              style={{padding:"4px 8px",borderRadius:6,border:"1px dashed #ccc",cursor:"pointer",fontSize:11,background:"transparent",color:"#bbb",whiteSpace:"nowrap"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#ccc";e.currentTarget.style.color="#bbb";}}>
              + 追加
            </button>
          </div>
        )}

        {/* 共有リンクバッジ */}
        {isClient&&(
          <div style={{...S.row,gap:6,flexShrink:0}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:activeAcc?.color,display:"inline-block"}}/>
            <span style={{fontWeight:700,fontSize:13}}>{activeAcc?.name}</span>
            <span style={{fontSize:10,color:"#2563eb",background:"#eff6ff",border:"1px solid #bfdbfe",padding:"2px 7px",borderRadius:99,fontWeight:600}}>共有</span>
          </div>
        )}

        {/* 右側コントロール */}
        <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
          <button onClick={()=>setShowSearch(true)}
            style={{...S.row,gap:5,border:BD2,background:"#f5f0eb",borderRadius:8,padding:"5px 10px",fontSize:11.5,color:"#6b6560",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6.5" cy="6.5" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
            検索
            <span style={{fontSize:9.5,color:"#bbb",background:"#fff",border:BD2,borderRadius:4,padding:"1px 4px"}}>⌘K</span>
          </button>
          <div style={{display:"flex",background:"#f5f0eb",borderRadius:8,padding:2,gap:1,flexShrink:0,border:BD2}}>
            {[["calendar","週"],["month","月"],["list","リスト"]].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11.5,fontWeight:600,background:view===v?"#fff":"transparent",color:view===v?"#111":"#a8a09a",boxShadow:view===v?"0 1px 3px rgba(0,0,0,.08)":"none",whiteSpace:"nowrap",transition:"all .12s"}}>{l}</button>
            ))}
          </div>
          {isAdmin&&(
            <>
              {overdueCount>0&&(
                <button onClick={()=>setFilter("reserved")}
                  style={{...S.row,gap:4,background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"4px 9px",fontSize:11,fontWeight:700,color:"#dc2626",cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" opacity=".8"><path d="M8 1.5L1.5 13.5h13L8 1.5zM8 6v4m0 2v1"/><rect x="7.25" y="6" width="1.5" height="4" rx=".75"/><rect x="7.25" y="11" width="1.5" height="1.5" rx=".75"/></svg>
                  {overdueCount}件
                </button>
              )}
              <div ref={shareRef} style={{position:"relative"}}>
                <button onClick={()=>setShowShare(s=>!s)}
                  style={{...S.row,gap:5,border:BD2,background:showShare?"#f5f0eb":"#fff",borderRadius:8,padding:"5px 10px",fontSize:11.5,fontWeight:600,color:"#555",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="3" cy="8" r="1.5"/><circle cx="13" cy="3" r="1.5"/><circle cx="13" cy="13" r="1.5"/><path d="m4.5 7.1 7-3.2M4.5 8.9l7 3.2"/></svg>
                  設定
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
                </button>
                {showShare&&(
                  <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",border:BD2,borderRadius:12,padding:6,zIndex:100,width:200,boxShadow:"0 8px 24px rgba(0,0,0,.1)",display:"flex",flexDirection:"column",gap:1}}>
                    {[
                      ["予約枠",()=>{setShowSlotSettings(true);setShowShare(false);}],
                      ["通知設定",()=>{setShowNotifySettings(true);setShowShare(false);}],
                      ["AIコンテキスト出力",()=>{setShowExport("ai");setShowShare(false);}],
                      ["ローカル保存",()=>{setShowExport("file");setShowShare(false);}],
                      ["CSVエクスポート",()=>{setShowExport("csv");setShowShare(false);}],
                      ["クライアント管理",()=>{setShowAccountSettings(true);setShowShare(false);}],
                    ].map(([label,fn])=>(
                      <button key={label} onClick={fn}
                        style={{border:"none",background:"none",borderRadius:7,padding:"8px 11px",fontSize:12,fontWeight:500,color:"#333",cursor:"pointer",textAlign:"left"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f5f0eb"}
                        onMouseLeave={e=>e.currentTarget.style.background="none"}>
                        {label}
                      </button>
                    ))}
                    <div style={{borderTop:BD2,marginTop:2,paddingTop:6}}>
                      <div style={{fontSize:10,color:"#a8a09a",fontWeight:600,padding:"2px 11px 5px",letterSpacing:".4px"}}>共有リンク</div>
                      {accounts.map(acc=>(
                        <div key={acc.id} style={{...S.row,gap:7,padding:"5px 11px"}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:acc.color,flexShrink:0}}/>
                          <span style={{fontSize:12,fontWeight:600,flex:1,color:"#333"}}>{acc.name}</span>
                          <button onClick={()=>{copyShareLink(acc.id);setShowShare(false);}}
                            style={{background:"#f59e0b",border:"none",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,color:"#fff",cursor:"pointer"}}>
                            コピー
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          <button onClick={()=>openNew()}
            style={{background:"#111",border:"none",borderRadius:8,padding:"6px 13px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",flexShrink:0,letterSpacing:"-.1px"}}>
            + 新規
          </button>
        </div>
      </div>

      {/* ── カレンダーナビ ── */}
      {view==="calendar"&&(
        <div style={{background:"#fff",borderBottom:BD2,padding:"5px 16px",display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
          {activeAcc&&<span style={{width:7,height:7,borderRadius:"50%",background:activeAcc.color,display:"inline-block"}}/>}
          <span style={{fontWeight:700,fontSize:12.5,color:"#555"}}>{activeAcc?.name}</span>
          <div style={{...S.row,gap:4,marginLeft:4}}>
            <button onClick={()=>{const d=new Date(week);d.setDate(d.getDate()-7);setWeek(d);}}
              style={{border:BD2,background:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:14,color:"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <span style={{fontWeight:600,fontSize:12.5,minWidth:165,textAlign:"center",color:"#333"}}>
              {weekDates[0].getMonth()+1}月{weekDates[0].getDate()}日 〜 {weekDates[6].getMonth()+1}月{weekDates[6].getDate()}日
            </span>
            <button onClick={()=>{const d=new Date(week);d.setDate(d.getDate()+7);setWeek(d);}}
              style={{border:BD2,background:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:14,color:"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
            <button onClick={()=>setWeek(new Date())}
              style={{border:BD2,background:"#fff",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:11,color:"#555",fontFamily:"inherit"}}>今週</button>
          </div>
          <select value={filterStatus} onChange={e=>setFilter(e.target.value)}
            style={{background:"#f5f0eb",border:BD2,borderRadius:7,padding:"4px 8px",fontSize:11,color:"#555",outline:"none",cursor:"pointer",marginLeft:"auto"}}>
            <option value="all">すべて</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterPlatform} onChange={e=>setFilterPlatform(e.target.value)}
            style={{background:"#f5f0eb",border:BD2,borderRadius:7,padding:"4px 8px",fontSize:11,color:"#555",outline:"none",cursor:"pointer"}}>
            <option value="all">全プラットフォーム</option>
            {Object.entries(allPostTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      )}

      {/* ── カレンダービュー ── */}
      {view==="calendar"&&(
        <div style={{height:"calc(100vh - 100px)",overflow:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"48px repeat(7, 1fr)",minWidth:860}}>
            <div style={{background:"#fff",position:"sticky",top:0,zIndex:20,borderRight:"1px solid #e6dfd6",borderBottom:BD2}}/>
            {weekDates.map((date,i)=>{
              const dateStr=weekDateStrs[i];
              const isToday=dateStr===today;
              const{draftCnt,reservedCnt,publishedCnt,ghostCnt}=weekStats[i]||{};
              return(
                <div key={i} style={{background:"#fff",padding:"6px 5px 4px",textAlign:"center",borderBottom:BD2,borderRight:"1px solid #e6dfd6",position:"sticky",top:0,zIndex:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:isToday?"#f59e0b":i>=5?"#ef4444":"#9ca3af"}}>{DAYS[i]}</div>
                  <div style={{width:28,height:28,borderRadius:"50%",background:isToday?"#f59e0b":"transparent",display:"flex",alignItems:"center",justifyContent:"center",margin:"2px auto",fontSize:13,fontWeight:800,color:isToday?"#fff":"#1a1a1a"}}>{date.getDate()}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:2,justifyContent:"center",minHeight:14}}>
                    {draftCnt>0&&<span style={{fontSize:8,background:"#f3f4f6",color:"#6b7280",borderRadius:4,padding:"0 3px",fontWeight:700}}>下{draftCnt}</span>}
                    {reservedCnt>0&&<span style={{fontSize:8,background:"#ede9fe",color:"#7c3aed",borderRadius:4,padding:"0 3px",fontWeight:700}}>予{reservedCnt}</span>}
                    {publishedCnt>0&&<span style={{fontSize:8,background:"#d1fae5",color:"#059669",borderRadius:4,padding:"0 3px",fontWeight:700}}>済{publishedCnt}</span>}
                    {ghostCnt>0&&<span style={{fontSize:8,background:"#fef3c7",color:"#d97706",borderRadius:4,padding:"0 3px",fontWeight:700}}>枠{ghostCnt}</span>}
                  </div>
                </div>
              );
            })}
            {HOURS.map(hour=>(
              <React.Fragment key={hour}>
                <div style={{borderTop:"1px solid #ede8e0",padding:"3px 5px 0",fontSize:10,color:"#c8bfb4",textAlign:"right",background:"#f5f0eb",borderRight:"1px solid #e6dfd6"}}>{hour}:00</div>
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
                      onDrop={dragId?e=>{e.preventDefault();handleDrop(dragId,dateStr,hour);}:undefined}
                      style={{borderTop:"1px solid #ede8e0",borderRight:"1px solid #e6dfd6",padding:"3px",minHeight:42,
                        background:dragOver===key?"#fef9e7":dragId?"#fffdf5":dateStr===today?"#fffcf5":"#fff",
                        cursor:dragId?"copy":isEmpty?"pointer":"default",transition:"background .1s",
                        outline:dragOver===key?"2px dashed #f59e0b":"none",outlineOffset:-2}}
                      onMouseEnter={!dragId&&isEmpty?e=>{e.currentTarget.style.background=dateStr===today?"#fff8e8":"#f5f0eb";}:undefined}
                      onMouseLeave={!dragId&&isEmpty?e=>{e.currentTarget.style.background=dateStr===today?"#fffcf5":"#fff";}:undefined}>
                      {/* 実投稿 */}
                      {sp.map(p=>{
                        const pt2=allPostTypes[p.postType||"x_post"],st2=STATUS[p.status];
                        return(
                          <div key={p.id}
                            draggable
                            onDragStart={e=>{e.stopPropagation();setDragId(p.id);e.dataTransfer.effectAllowed="move";}}
                            onDragEnd={()=>{setDragId(null);setDragOver(null);}}
                            onClick={e=>{e.stopPropagation();setPreview(p);}}
                            style={{background:"#fff",border:`1.5px solid ${pt2.border}`,borderLeft:`3px solid ${pt2.dot}`,borderRadius:6,padding:"3px 5px",marginBottom:2,cursor:"grab",transition:"all .1s",opacity:dragId===p.id?0.5:1}}
                            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 2px 8px #0000001a";e.currentTarget.style.borderColor=pt2.color;}}
                            onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor=pt2.border;}}>
                            <div style={{...S.row,gap:3,marginBottom:1}}>
                              <span style={{width:5,height:5,borderRadius:"50%",background:pt2.dot,flexShrink:0}}/>
                              <span style={{fontSize:9,color:"#888"}}>{fmtTime(p.datetime)}</span>
                              {p.score&&<span style={{fontSize:8,fontWeight:800,color:SCORE[p.score]?.color,background:SCORE[p.score]?.bg,borderRadius:3,padding:"0 3px",marginLeft:"auto"}}>{p.score}</span>}
                            </div>
                            <div style={{fontSize:10,fontWeight:700,color:"#0f1419",lineHeight:1.3}}>{(p.title||"（タイトルなし）").slice(0,12)}{(p.title||"").length>12?"…":""}</div>
                            <select value={p.status} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();changeStatus(p.id,e.target.value,p.score);}}
                              style={{marginTop:3,width:"100%",border:`1px solid ${st2?.border}`,borderRadius:5,padding:"2px 4px",fontSize:10,fontWeight:700,color:st2?.text,background:st2?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                              {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                        );
                      })}
                      {/* ゴースト枠（実投稿で埋まっていないもののみ表示） */}
                      {(()=>{
                        const filledTypes=new Set(sp.map(p=>p.postType||"x_post"));
                        const ghosts=(ghostBySlot[key]||[]).filter(g=>!filledTypes.has(g.postType||"x_post"));
                        if(ghosts.length===0)return null;
                        const multi=ghosts.length>1;
                        return multi?(
                          <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                            {ghosts.map((g,gi)=>{
                              const gpt=allPostTypes[g.postType||"x_post"];
                              return(
                                <div key={"g"+gi}
                                  onClick={e=>{e.stopPropagation();openNew(`${dateStr}T${slotTime(g)}`,{title:g.title||"",postType:g.postType||"x_post"});}}
                                  style={{flex:"1 1 0",minWidth:0,border:`1.5px dashed ${gpt.dot}`,borderLeft:`3px dashed ${gpt.dot}`,borderRadius:5,padding:"3px 4px",cursor:"pointer",opacity:0.7,transition:"all .15s",background:gpt.bg}}
                                  onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.boxShadow="0 1px 6px #0000001a";}}
                                  onMouseLeave={e=>{e.currentTarget.style.opacity="0.7";e.currentTarget.style.boxShadow="none";}}>
                                  <div style={{...S.row,gap:2,marginBottom:1}}>
                                    <span style={{width:4,height:4,borderRadius:"50%",background:gpt.dot,flexShrink:0}}/>
                                    <span style={{fontSize:8,color:gpt.color,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{gpt.label}</span>
                                  </div>
                                  <div style={{fontSize:8,color:"#666",fontWeight:600,lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {g.title||"予約枠"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ):(
                          ghosts.map((g,gi)=>{
                            const gpt=allPostTypes[g.postType||"x_post"];
                            return(
                              <div key={"g"+gi}
                                onClick={e=>{e.stopPropagation();openNew(`${dateStr}T${slotTime(g)}`,{title:g.title||"",postType:g.postType||"x_post"});}}
                                style={{border:`1.5px dashed ${gpt.dot}`,borderLeft:`3px dashed ${gpt.dot}`,borderRadius:6,padding:"4px 6px",marginBottom:2,cursor:"pointer",opacity:0.65,transition:"all .15s",background:gpt.bg}}
                                onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.boxShadow="0 1px 6px #0000001a";}}
                                onMouseLeave={e=>{e.currentTarget.style.opacity="0.65";e.currentTarget.style.boxShadow="none";}}>
                                <div style={{...S.row,gap:3}}>
                                  <span style={{width:4,height:4,borderRadius:"50%",background:gpt.dot,flexShrink:0}}/>
                                  <span style={{fontSize:9,color:gpt.color,fontWeight:700}}>{slotTime(g)}</span>
                                </div>
                                {g.title
                                  ?<div style={{fontSize:9,fontWeight:700,color:"#666",lineHeight:1.3,marginTop:1}}>{g.title.slice(0,12)}{g.title.length>12?"…":""}</div>
                                  :<div style={{fontSize:9,color:"#999",lineHeight:1.3}}>予約枠</div>
                                }
                                <span style={{fontSize:8,color:gpt.color,fontWeight:700,background:"#fff",border:`1px solid ${gpt.border}`,padding:"0 4px",borderRadius:6,marginTop:2,display:"inline-block"}}>{gpt.label}</span>
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

      {/* ── マンスリービュー ── */}
      {view==="month"&&(
        <MonthView
          posts={filtered}
          today={today}
          slots={slots}
          openNew={openNew}
          setPreview={setPreview}
          postTypes={allPostTypes}
        />
      )}

      {/* ── リストビュー ── */}
      {view==="list"&&(
        <ListView
          filtered={filtered}
          today={today}
          activeAcc={activeAcc}
          filterStatus={filterStatus}
          setFilter={setFilter}
          filterPlatform={filterPlatform}
          setFilterPlatform={setFilterPlatform}
          setPreview={setPreview}
          setEditing={setEditing}
          handleDuplicate={handleDuplicate}
          setRepostTgt={setRepostTgt}
          openNew={openNew}
          slots={slots}
          changeStatus={changeStatus}
          postTypes={allPostTypes}
        />
      )}

      {/* ── 予約枠設定モーダル ── */}
      {showSlotSettings&&isAdmin&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
          onClick={e=>{if(e.target===e.currentTarget)setShowSlotSettings(false);}}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000030"}}>
            <div style={{padding:"14px 18px",borderBottom:BD2,display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f5f0eb"}}>
              <div>
                <div style={{fontWeight:800,fontSize:14}}>📅 予約枠設定</div>
                <div style={{fontSize:11,color:"#aaa",marginTop:2}}>カレンダーにゴーストカードで表示されます</div>
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
                ?<div style={{textAlign:"center",color:"#ccc",fontSize:13,padding:"20px 0"}}>枠がまだありません</div>
                :slots.map((s,i)=>{
                  const pt=allPostTypes[s.postType||"x_post"];
                  return(
                    <div key={s.id} style={{...S.row,gap:8,background:"#f8f5f1",border:BD2,borderRadius:9,padding:"7px 10px",marginBottom:6}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:pt.dot,flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:700,color:"#555",whiteSpace:"nowrap",flexShrink:0}}>{slotLabel(s)}</span>
                      <input
                        value={s.title||""}
                        onChange={e=>{const v=e.target.value;saveSlots(prev=>prev.map((x,j)=>j===i?{...x,title:v}:x));}}
                        placeholder="仮タイトル"
                        style={{flex:1,minWidth:0,border:"none",borderBottom:BD,borderRadius:0,padding:"2px 4px",fontSize:11,fontFamily:"inherit",color:"#1a1a1a",outline:"none",background:"transparent"}}
                        onFocus={e=>e.target.style.borderBottomColor="#f59e0b"}
                        onBlur={e=>e.target.style.borderBottomColor="#e0d8ce"}
                      />
                      <span style={{fontSize:10,color:pt.color,background:pt.bg,border:`1px solid ${pt.border}`,padding:"1px 7px",borderRadius:10,fontWeight:700,flexShrink:0}}>{pt.label}</span>
                      <button onClick={()=>saveSlots(slots.filter((_,j)=>j!==i))}
                        style={{border:"none",background:"none",color:"#fca5a5",cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0,padding:0}}>×</button>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      )}

      {/* ── 通知設定モーダル ── */}
      {showNotifySettings&&isAdmin&&notifySettings&&(
        <NotifySettingsModal
          settings={notifySettings}
          accountName={activeAcc?.name||""}
          onSave={saveNotifySettings}
          onClose={()=>setShowNotifySettings(false)}
          onTestSend={handleTestSend}
        />
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
      {preview&&<PreviewOverlay post={preview} onClose={()=>setPreview(null)}
        onEdit={async p=>{
          setPreview(null);
          if(p._unsaved){
            const {_unsaved,...postToSave}=p;
            const title=postToSave.title||"";
            const memo=postToSave.memo||"";
            const clean={...postToSave,title,memo};
            await saveToDb(clean);
            setEditing({...clean});
          } else {
            setEditing({...p});
          }
        }}
        onSaveNew={async p=>{
          const {_unsaved,...postToSave}=p;
          const clean={...postToSave,title:postToSave.title||"",memo:postToSave.memo||""};
          await saveToDb(clean);
          setPreview({...clean});
          showToast("保存しました ✅");
        }}
        onRepost={p=>{setPreview(null);setRepostTgt(p);}}
        onDuplicate={handleDuplicate}
        onDelete={p=>setDeleteConfirm(p)}
        onSaveComment={saveComment}
        onChangeStatus={changeStatus}
        onSaveMeta={saveMeta}
        onChangePostType={changePostType}
        allLabels={allLabels}
        allPostTypes={allPostTypes}
        onAddPostType={addCustomPostType}/> }

      {editing&&<EditorModal post={{postType:'x_post',body:'',memo:'',memoLinks:[],comments:[],history:[],...editing}} onSave={save} onClose={()=>setEditing(null)} allPosts={posts}/>}

      {showSearch&&<SearchModal posts={filtered} onClose={()=>setShowSearch(false)}
        onSelect={p=>{setShowSearch(false);setPreview(p);}}
        onRepost={p=>{setShowSearch(false);setRepostTgt(p);}}/>}

      {repostTgt&&<RepostModal post={repostTgt} onClose={()=>setRepostTgt(null)}
        onRepost={(dt,r)=>handleRepost(repostTgt,dt,r)}/>}

      {showAccountSettings&&isAdmin&&(
        <AccountSettings accounts={accounts} onUpdate={updateAccount} onDelete={deleteAccount} onAdd={addAccount} onCopyLink={copyShareLink} onClose={()=>setShowAccountSettings(false)}/>
      )}

      {/* 削除確認ダイアログ */}
      {deleteConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:360,padding:28,boxShadow:"0 20px 60px #00000030",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:800,fontSize:"1.05em",color:"#0f1419",marginBottom:8}}>この投稿を削除しますか？</div>
            <div style={{fontSize:"0.84em",color:"#536471",marginBottom:6,lineHeight:1.5}}>「{deleteConfirm.title||"（タイトルなし）"}」</div>
            <div style={{fontSize:"0.76em",color:"#ef4444",marginBottom:22}}>この操作は取り消せません。</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDeleteConfirm(null)} style={{flex:1,border:BD,background:"#fff",borderRadius:20,padding:"10px 0",fontWeight:600,fontSize:"0.88em",color:"#536471",cursor:"pointer"}}>キャンセル</button>
              <button onClick={()=>del(deleteConfirm.id)} style={{flex:1,background:"#ef4444",border:"none",borderRadius:20,padding:"10px 0",fontWeight:800,fontSize:"0.88em",color:"#fff",cursor:"pointer"}}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#111",color:"#fff",padding:"10px 20px",borderRadius:10,fontSize:12.5,fontWeight:600,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,.2)",whiteSpace:"nowrap",letterSpacing:"-.1px"}}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── リストビュー ──
// ════════════════════════════════════════════════════════
// マンスリービュー
// ════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════
// ローカル保存（エクスポート）モーダル
// ════════════════════════════════════════════════════════
const FS_SUPPORTED=typeof window!=="undefined"&&"showDirectoryPicker" in window;

// ════════════════════════════════════════════════════════
// 通知設定モーダル
// ════════════════════════════════════════════════════════

// ── ⑦ キーボードショートカット一覧（ヘルプ） ──
// （将来的にモーダルとして表示）
// N=新規, ←/→=週移動, C=ビュー切替, E=編集, ⌘K=検索

// ── 共通UIコンポーネント ──
const INP={width:"100%",background:"#fff",border:BD2,borderRadius:8,padding:"7px 10px",color:"#111",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border-color .12s"};
// ════════════════════════════════════════════════════════
// PortalAuthWrapper — Firebase認証 + Firestore権限チェック
// ════════════════════════════════════════════════════════
function PortalAuthWrapper({children}){
  const [state,setState]=useState("loading");
  const [uid,setUid]=useState(null);

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,async user=>{
      if(!user){setState("unauthed");return;}
      try{
        const snap=await getDoc(doc(db,"users",user.uid));
        if(!snap.exists()){setState("denied");return;}
        const d=snap.data();
        const isAdmin=d.role==="admin";
        const isPaid =d.paymentStatus==="paid"&&(d.allowedApps||[]).includes(PORTAL_APP_ID);
        if(isAdmin||isPaid){setUid(user.uid);setState("allowed");}
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
        <div style={{fontSize:22,fontWeight:900,marginBottom:12,letterSpacing:"-0.8px"}}>Content<span style={{color:"#f59e0b"}}>OS</span></div>
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
        <div style={{fontSize:22,fontWeight:900,marginBottom:4,letterSpacing:"-0.8px"}}>Content<span style={{color:"#f59e0b"}}>OS</span></div>
        <div style={{fontSize:12.5,color:"#a8a09a",marginBottom:32}}>コンテンツ管理ツール</div>
        <button
          onClick={()=>signInWithPopup(auth,googleProvider).catch(console.error)}
          style={{...S.row,gap:10,margin:"0 auto",border:BD2,borderRadius:10,padding:"11px 22px",fontSize:13.5,fontWeight:600,cursor:"pointer",background:"#fff",fontFamily:"inherit",color:"#333",boxShadow:"0 1px 4px rgba(0,0,0,.06)",transition:"all .12s"}}
          onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)";e.currentTarget.style.transform="translateY(-1px)";}}
          onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.06)";e.currentTarget.style.transform="none";}}>
          <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Googleでログイン
        </button>
        <a href={PORTAL_URL} style={{display:"block",marginTop:24,fontSize:11,color:"#c4b8ad",textDecoration:"none",letterSpacing:".2px"}}
          onMouseEnter={e=>e.currentTarget.style.color="#888"}
          onMouseLeave={e=>e.currentTarget.style.color="#c4b8ad"}>
          ポータルサイトへ戻る →
        </a>
      </div>
    </div>
  );

  if(state==="denied"){
    window.location.href=PORTAL_URL;
    return null;
  }

  return children(uid);
}

// ── ポータル認証付きエクスポート ──
export default function AppWithAuth(){
  return(
    <PortalAuthWrapper>
      {uid=><App uid={uid}/>}
    </PortalAuthWrapper>
  );
}
