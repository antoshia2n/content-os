import React, { useState, useRef, useEffect, useCallback } from "react";
import { POST_TYPE, STATUS, SCORE, BD, BD2, S, XFONT, SLOT_DOWS, SLOT_NTHS, SLOT_TYPES, DAYS, HOURS, fmtDate, fmtTime, slotTime, genId, nowStr } from "../constants.js";

export function MonthView({posts,today,slots,openNew,setPreview,postTypes=POST_TYPE}){
  const [monthBase,setMonthBase]=useState(()=>new Date());
  const year=monthBase.getFullYear(),month=monthBase.getMonth();

  const {weeks,fmtD}=React.useMemo(()=>{
    const firstDay=new Date(year,month,1);
    const lastDay=new Date(year,month+1,0);
    const startDow=(firstDay.getDay()+6)%7;
    const cells=[];
    for(let i=0;i<startDow;i++)cells.push(null);
    for(let d=1;d<=lastDay.getDate();d++)cells.push(new Date(year,month,d));
    while(cells.length%7!==0)cells.push(null);
    const ws=[];
    for(let i=0;i<cells.length;i+=7)ws.push(cells.slice(i,i+7));
    const fmt=d=>d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`:"";
    return{weeks:ws,fmtD:fmt};
  },[year,month]);

  const postsByDate=React.useMemo(()=>{
    const m={};
    posts.forEach(p=>{const d=p.datetime.slice(0,10);(m[d]=m[d]||[]).push(p);});
    return m;
  },[posts]);

  // 月内の全日付×slotsのマッチングをまとめて計算
  const slotsByDate=React.useMemo(()=>{
    const m={};
    weeks.flat().forEach(date=>{
      if(!date)return;
      const key=fmtD(date);
      m[key]=slots.filter(s=>slotMatchesDate(s,date));
    });
    return m;
  },[weeks,slots,fmtD]);
  return(
    <div style={{height:"calc(100vh - 100px)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* ナビ */}
      <div style={{background:"#fff",borderBottom:BD2,padding:"6px 18px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <button onClick={()=>setMonthBase(new Date(year,month-1,1))} style={{border:BD,background:"#fff",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:13}}>‹</button>
        <span style={{fontWeight:800,fontSize:14,color:"#444",minWidth:100,textAlign:"center"}}>{year}年{month+1}月</span>
        <button onClick={()=>setMonthBase(new Date(year,month+1,1))} style={{border:BD,background:"#fff",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:13}}>›</button>
        <button onClick={()=>setMonthBase(new Date())} style={{border:BD,background:"#fff",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11}}>今月</button>
      </div>
      {/* グリッド */}
      <div style={{flex:1,overflow:"auto"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",minWidth:700}}>
          {["月","火","水","木","金","土","日"].map((d,i)=>(
            <div key={d} style={{padding:"6px 0",textAlign:"center",fontSize:11,fontWeight:700,color:i>=5?"#ef4444":"#9ca3af",background:"#fff",borderBottom:BD2,borderRight:"1px solid #e6dfd6",position:"sticky",top:0,zIndex:10}}>{d}</div>
          ))}
          {weeks.map((week,wi)=>week.map((date,di)=>{
            const dateStr=fmtD(date);
            const isToday=dateStr===today;
            const isCurrentMonth=date&&date.getMonth()===month;
            const dayPosts=date?(postsByDate[dateStr]||[]):[];
            const daySlots=date?(slotsByDate[dateStr]||[]):[];
            const draftCnt=dayPosts.filter(p=>p.status==="draft").length;
            const reservedCnt=dayPosts.filter(p=>["reserved","waiting"].includes(p.status)).length;
            const publishedCnt=dayPosts.filter(p=>["published","popular"].includes(p.status)).length;
            return(
              <div key={`${wi}-${di}`}
                style={{minHeight:100,borderRight:"1px solid #e6dfd6",borderBottom:BD2,padding:"4px 5px",background:isToday?"#fffcf5":!isCurrentMonth?"#f5f0eb":"#fff",verticalAlign:"top",cursor:date?"pointer":"default"}}
                onClick={date?()=>openNew(`${dateStr}T09:00`):undefined}>
                {date&&(
                  <>
                    {/* 日付 */}
                    <div style={{...S.row,gap:4,marginBottom:3}}>
                      <span style={{width:22,height:22,borderRadius:"50%",background:isToday?"#f59e0b":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:isToday?"#fff":!isCurrentMonth?"#ccc":di>=5?"#ef4444":"#1a1a1a",flexShrink:0}}>{date.getDate()}</span>
                      <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                        {draftCnt>0&&<span style={{fontSize:8,background:"#f3f4f6",color:"#6b7280",borderRadius:4,padding:"0 3px",fontWeight:700}}>下{draftCnt}</span>}
                        {reservedCnt>0&&<span style={{fontSize:8,background:"#ede9fe",color:"#7c3aed",borderRadius:4,padding:"0 3px",fontWeight:700}}>予{reservedCnt}</span>}
                        {publishedCnt>0&&<span style={{fontSize:8,background:"#d1fae5",color:"#059669",borderRadius:4,padding:"0 3px",fontWeight:700}}>済{publishedCnt}</span>}
                        {daySlots.length>0&&<span style={{fontSize:8,background:"#fef3c7",color:"#d97706",borderRadius:4,padding:"0 3px",fontWeight:700}}>枠{daySlots.length}</span>}
                      </div>
                    </div>
                    {/* 投稿チップ（最大3件） */}
                    {dayPosts.slice(0,3).map(p=>{
                      const pt=postTypes[p.postType||"x_post"];
                      return(
                        <div key={p.id} onClick={e=>{e.stopPropagation();setPreview(p);}}
                          style={{...S.row,gap:3,background:pt.bg,border:`1px solid ${pt.border}`,borderLeft:`3px solid ${pt.dot}`,borderRadius:4,padding:"2px 5px",marginBottom:2,cursor:"pointer",overflow:"hidden"}}
                          onMouseEnter={e=>e.currentTarget.style.opacity="0.8"}
                          onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                          <span style={{fontSize:8,color:pt.color,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{p.title||"（無題）"}</span>
                          {p.score&&<span style={{fontSize:7,fontWeight:800,color:SCORE[p.score]?.color,background:SCORE[p.score]?.bg,borderRadius:3,padding:"0 3px",flexShrink:0}}>{p.score}</span>}
                        </div>
                      );
                    })}
                    {dayPosts.length>3&&<div style={{fontSize:8,color:"#aaa",textAlign:"right"}}>+{dayPosts.length-3}件</div>}
                    {/* 予約枠チップ */}
                    {daySlots.slice(0,2).map((s,si)=>{
                      const gpt=postTypes[s.postType||"x_post"];
                      return(
                        <div key={"s"+si} onClick={e=>{e.stopPropagation();openNew(`${dateStr}T${slotTime(s)}`,{title:s.title||"",postType:s.postType||"x_post"});}}
                          style={{...S.row,gap:3,border:`1px dashed ${gpt.dot}`,borderLeft:`2px dashed ${gpt.dot}`,borderRadius:4,padding:"2px 5px",marginBottom:2,cursor:"pointer",background:gpt.bg,opacity:0.7}}
                          onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                          onMouseLeave={e=>e.currentTarget.style.opacity="0.7"}>
                          <span style={{fontSize:8,color:gpt.color,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title||`${slotTime(s)} 予約枠`}</span>
                        </div>
                      );
                    })}
                    {daySlots.length>2&&<div style={{fontSize:8,color:"#d97706",textAlign:"right"}}>+{daySlots.length-2}枠</div>}
                  </>
                )}
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
}

export function ListView({filtered,today,activeAcc,filterStatus,setFilter,filterPlatform,setFilterPlatform,setPreview,setEditing,handleDuplicate,setRepostTgt,openNew,slots,changeStatus,postTypes=POST_TYPE}){
  const [showSlots,setShowSlots]=useState(true);
  const [weekBase,setWeekBase]=useState(()=>{
    // 今週の月曜日を起点に
    const d=new Date();const day=d.getDay();
    d.setDate(d.getDate()+(day===0?-6:1-day));
    d.setHours(0,0,0,0);return d;
  });

  // 週の月〜日を計算
  const weekDates=React.useMemo(()=>{
    return Array.from({length:7},(_,i)=>{
      const d=new Date(weekBase);d.setDate(weekBase.getDate()+i);
      return fmtDate(d);
    });
  },[weekBase]);

  const weekLabel=React.useMemo(()=>{
    const from=weekDates[0],to=weekDates[6];
    const fd=new Date(from),td=new Date(to);
    return `${fd.getMonth()+1}/${fd.getDate()} 〜 ${td.getMonth()+1}/${td.getDate()}`;
  },[weekDates]);

  const goWeek=delta=>{
    setWeekBase(prev=>{const d=new Date(prev);d.setDate(d.getDate()+delta*7);return d;});
  };
  const goToday=()=>{
    const d=new Date();const day=d.getDay();
    d.setDate(d.getDate()+(day===0?-6:1-day));d.setHours(0,0,0,0);
    setWeekBase(new Date(d));
  };

  const byDate=React.useMemo(()=>{
    const m={};
    filtered.forEach(p=>{
      const d=p.datetime.slice(0,10);
      (m[d]=m[d]||[]).push(p);
    });
    return m;
  },[filtered]);

  // 表示対象：週内の日付 + 予約枠がある日付
  const dates=React.useMemo(()=>{
    const dateSet=new Set(weekDates);
    // 週内に投稿がある日はすでに含まれる
    // 予約枠のある日も追加
    if(showSlots&&slots?.length>0){
      weekDates.forEach(ds=>{
        const d=new Date(ds+"T00:00:00");
        if(slots.some(s=>slotMatchesDate(s,d)))dateSet.add(ds);
      });
    }
    return [...dateSet].sort();
  },[weekDates,slots,showSlots]);

  const scrollRef=useRef(null);
  const todayColRef=useRef(null);
  useEffect(()=>{
    if(!scrollRef.current)return;
    scrollRef.current.scrollTo({left:0,behavior:"smooth"});
  },[weekBase]);

  return(
    <div style={{...S.col,height:"calc(100vh - 52px)",overflow:"hidden"}}>
      <div style={{...S.row,gap:8,padding:"10px 18px",borderBottom:BD2,background:"#fff",flexShrink:0}}>
        {activeAcc&&<span style={{width:8,height:8,borderRadius:"50%",background:activeAcc.color,display:"inline-block"}}/>}
        <span style={{fontWeight:800,fontSize:14}}>{activeAcc?.name} の投稿</span>
        <span style={{fontSize:12,color:"#aaa"}}>{filtered.length}件</span>

        {/* 週ナビ */}
        <div style={{...S.row,gap:4,marginLeft:8}}>
          <button onClick={()=>goWeek(-1)}
            style={{border:BD2,background:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:14,color:"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <span style={{fontSize:12,fontWeight:600,color:"#444",minWidth:120,textAlign:"center"}}>{weekLabel}</span>
          <button onClick={()=>goWeek(1)}
            style={{border:BD2,background:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:14,color:"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
          <button onClick={goToday}
            style={{border:BD2,background:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#555"}}>今週</button>
        </div>

        {/* 予約枠トグル */}
        <button onClick={()=>setShowSlots(v=>!v)}
          style={{...S.row,gap:5,border:`1.5px solid ${showSlots?"#f59e0b":"#e0d8ce"}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",background:showSlots?"#fef3c7":"#fff",color:showSlots?"#d97706":"#aaa",fontFamily:"inherit",transition:"all .15s"}}>
          <span style={{fontSize:13}}>📅</span>
          予約枠{showSlots?"表示中":"非表示"}
        </button>
        <select value={filterStatus} onChange={e=>setFilter(e.target.value)}
          style={{marginLeft:"auto",background:"#f8f4ef",border:BD,borderRadius:7,padding:"5px 9px",fontSize:12,color:"#666",outline:"none",cursor:"pointer"}}>
          <option value="all">すべてのステータス</option>
          {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterPlatform||"all"} onChange={e=>setFilterPlatform&&setFilterPlatform(e.target.value)}
          style={{background:"#f8f4ef",border:BD,borderRadius:7,padding:"5px 9px",fontSize:12,color:"#666",outline:"none",cursor:"pointer"}}>
          <option value="all">全プラットフォーム</option>
          {Object.entries(postTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div ref={scrollRef} style={{flex:1,overflowX:"auto",overflowY:"hidden",display:"flex",padding:"16px 18px",gap:14,alignItems:"flex-start"}}>
        {dates.length===0&&<div style={{color:"#ccc",fontSize:13,margin:"auto"}}>投稿がありません</div>}
        {dates.map(date=>{
          const isToday=date===today;
          const dayPosts=(byDate[date]||[]).sort((a,b)=>a.datetime.localeCompare(b.datetime));
          const d=new Date(date+"T00:00:00");
          const dayLabel=["日","月","火","水","木","金","土"][d.getDay()];
          // この日に該当する予約枠を時刻順で取得
          const daySlots=showSlots&&slots?.length>0
            ?slots.filter(s=>slotMatchesDate(s,d)).sort((a,b)=>slotTime(a).localeCompare(slotTime(b)))
            :[];
          // 予約枠のうち実投稿が埋まっていない枠だけゴースト表示
          const filledTimes=new Set(dayPosts.map(p=>p.datetime.slice(11,16)));
          const ghostSlots=daySlots.filter(s=>!filledTimes.has(slotTime(s)));
          // 実投稿とゴーストをまとめて時刻順に並べる
          const allItems=[
            ...dayPosts.map(p=>({type:"post",data:p,sortKey:p.datetime.slice(11,13)})),
            ...ghostSlots.map(s=>({type:"ghost",data:s,sortKey:slotTime(s)})),
          ].sort((a,b)=>a.sortKey.localeCompare(b.sortKey));

          return(
            <div key={date} ref={isToday?todayColRef:null} style={{flexShrink:0,width:200}}>
              <div style={{...S.row,gap:6,marginBottom:8,paddingBottom:7,borderBottom:`2px solid ${isToday?"#f59e0b":"#e6dfd6"}`}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:isToday?"#f59e0b":"#f5f0eb",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:isToday?"#fff":"#555",flexShrink:0}}>
                  {d.getDate()}
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:isToday?"#f59e0b":"#aaa"}}>{dayLabel}曜日</div>
                  <div style={{fontSize:10,color:"#bbb"}}>{d.getMonth()+1}月</div>
                </div>
                <span style={{marginLeft:"auto",fontSize:10,color:"#ccc"}}>{dayPosts.length}件</span>
              </div>
              <div style={{...S.col,gap:7}}>
                {allItems.map((item,idx)=>{
                  if(item.type==="post"){
                    const p=item.data;
                    const pt2=postTypes[p.postType||"x_post"];
                    const st2=STATUS[p.status];
                    return(
                      <div key={p.id} onClick={()=>setPreview(p)}
                        style={{background:"#fff",border:`1.5px solid ${pt2.border}`,borderLeft:`3px solid ${pt2.dot}`,borderRadius:9,padding:"9px 10px",cursor:"pointer",transition:"box-shadow .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.boxShadow="0 3px 12px #0000001a"}
                        onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                        <div style={{...S.row,gap:4,marginBottom:4}}>
                          <span style={{fontSize:10,color:"#888"}}>{p.datetime.slice(11,16)}</span>
                          <span style={{fontSize:9,color:pt2.color,fontWeight:700,background:pt2.bg,border:`1px solid ${pt2.border}`,padding:"0 5px",borderRadius:6,marginLeft:2}}>{pt2.label}</span>
                          {p.score&&<span style={{fontSize:9,fontWeight:800,color:SCORE[p.score]?.color,background:SCORE[p.score]?.bg,borderRadius:4,padding:"0 5px"}}>{p.score}</span>}
                          <select value={p.status} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();changeStatus(p.id,e.target.value,p.score);}}
                            style={{marginLeft:"auto",border:`1px solid ${st2?.border}`,borderRadius:6,padding:"1px 4px",fontSize:9,fontWeight:600,color:st2?.text,background:st2?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                        <div style={{fontSize:12,fontWeight:800,color:"#0f1419",lineHeight:1.35,marginBottom:4}}>{(p.title||"（タイトルなし）").slice(0,22)}{(p.title||"").length>22?"…":""}</div>
                        {p.memo&&<div style={{fontSize:10,color:"#b45309",background:"#fffbeb",borderRadius:4,padding:"2px 6px",marginBottom:5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.memo}</div>}
                        <div style={{display:"flex",gap:4,marginTop:4}}>
                          <button onClick={e=>{e.stopPropagation();setEditing({...p});}}
                            style={{background:"#f59e0b",border:"none",borderRadius:5,padding:"3px 8px",fontSize:9,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>編集</button>
                          <button onClick={e=>{e.stopPropagation();handleDuplicate(p);}}
                            style={{background:"none",border:BD,borderRadius:5,padding:"3px 6px",fontSize:9,color:"#536471",cursor:"pointer",fontFamily:"inherit"}}
                            onMouseEnter={e=>e.currentTarget.style.background="#f3f4f6"} onMouseLeave={e=>e.currentTarget.style.background="none"}>📋</button>
                          <button onClick={e=>{e.stopPropagation();setRepostTgt(p);}}
                            style={{background:"none",border:BD,borderRadius:5,padding:"3px 6px",fontSize:9,color:"#536471",cursor:"pointer",fontFamily:"inherit"}}
                            onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="#f59e0b";}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";e.currentTarget.style.borderColor="#e0d8ce";}}>🔁</button>
                        </div>
                      </div>
                    );
                  }
                  // ゴースト枠
                  const s=item.data;
                  const gpt=postTypes[s.postType||"x_post"];
                  return(
                    <div key={"g"+idx}
                      onClick={()=>openNew(`${date}T${slotTime(s)}`,{title:s.title||"",postType:s.postType||"x_post"})}
                      style={{border:`1.5px dashed ${gpt.dot}`,borderLeft:`3px dashed ${gpt.dot}`,borderRadius:9,padding:"8px 10px",cursor:"pointer",opacity:0.7,transition:"all .15s",background:gpt.bg}}
                      onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.boxShadow="0 2px 8px #0000001a";}}
                      onMouseLeave={e=>{e.currentTarget.style.opacity="0.7";e.currentTarget.style.boxShadow="none";}}>
                      <div style={{...S.row,gap:5,marginBottom:3}}>
                        <span style={{width:5,height:5,borderRadius:"50%",background:gpt.dot,flexShrink:0}}/>
                        <span style={{fontSize:10,color:gpt.color,fontWeight:700}}>{slotTime(s)}</span>
                        <span style={{fontSize:9,color:gpt.color,background:"#fff",border:`1px solid ${gpt.border}`,padding:"0 5px",borderRadius:6,fontWeight:700,marginLeft:"auto"}}>{gpt.label}</span>
                      </div>
                      {s.title
                        ?<div style={{fontSize:11,fontWeight:700,color:"#555",lineHeight:1.35,marginBottom:2}}>{s.title.slice(0,20)}{s.title.length>20?"…":""}</div>
                        :<div style={{fontSize:10,color:"#999",fontWeight:600}}>予約枠 — クリックで作成</div>
                      }
                    </div>
                  );
                })}
                <button onClick={()=>openNew(`${date}T09:00`)}
                  style={{width:"100%",border:"1.5px dashed #e0d8ce",background:"transparent",borderRadius:9,padding:"8px 0",fontSize:10,color:"#ccc",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0d8ce";e.currentTarget.style.color="#ccc";}}>
                  ＋ 追加
                </button>
              </div>
            </div>
          );
        })}
        <div style={{flexShrink:0,width:200}}>
          <button onClick={()=>openNew()}
            style={{width:"100%",border:"2px dashed #e0d8ce",background:"transparent",borderRadius:9,padding:"14px 0",fontSize:11,color:"#ccc",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0d8ce";e.currentTarget.style.color="#ccc";}}>
            ＋ 新規作成
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 予約枠：スロットのラベル生成ヘルパー ──
// type: "weekly"=毎週特定曜日, "daily"=毎日, "nth_weekday"=第N曜日（月次）
export function slotLabel(s){
  const DOWL=["","月","火","水","木","金","土","日"];
  const NTH=["","第1","第2","第3","第4","第5"];
  // 後方互換：hourのみある古いデータはHH:00に変換
  const t=s.time||(s.hour!=null?String(s.hour).padStart(2,"0")+":00":"00:00");
  if(s.type==="daily") return `毎日 ${t}`;
  if(s.type==="nth_weekday") return `毎月${NTH[s.nth]||""}${DOWL[s.dow]||""}曜 ${t}`;
  return `毎週${DOWL[s.dow]||""}曜 ${t}`;
}

// ── 日付がスロット条件に一致するか判定 ──
export function slotMatchesDate(s,date){
  const dow=date.getDay()===0?7:date.getDay(); // 1=月〜7=日
  if(s.type==="daily") return true;
  if(s.type==="weekly") return s.dow===dow;
  if(s.type==="nth_weekday"){
    if(s.dow!==dow)return false;
    // 何番目の該当曜日かを計算
    const d=date.getDate();
    const nth=Math.ceil(d/7);
    return s.nth===nth;
  }
  // 後方互換：typeなし→weekly扱い
  return s.dow===dow;
}

// ── 予約枠追加フォーム ──
export function SlotAddForm({onAdd,postTypes=POST_TYPE}){
  const [type,setType]=useState("weekly");
  const [dow,setDow]=useState(1);
  const [nth,setNth]=useState(1);
  const [time,setTime]=useState("09:00");
  const [postType,setPostType]=useState("x_post");
  const pt=postTypes[postType];

  const preview=React.useMemo(()=>{
    if(type==="daily") return `毎日 ${time}`;
    if(type==="nth_weekday") return `毎月第${nth}${["","月","火","水","木","金","土","日"][dow]}曜 ${time}`;
    return `毎週${["","月","火","水","木","金","土","日"][dow]}曜 ${time}`;
  },[type,dow,nth,time]);

  return(
    <div style={{background:"#fffbeb",border:"1.5px dashed #fcd34d",borderRadius:10,padding:"14px 14px 12px",marginTop:8}}>
      <div style={{fontSize:11,fontWeight:700,color:"#92400e",marginBottom:10}}>＋ 新しい予約枠</div>

      {/* 繰り返しタイプ */}
      <div style={{marginBottom:10}}>
        <label style={{fontSize:10,color:"#888",fontWeight:700,display:"block",marginBottom:4}}>繰り返し</label>
        <div style={{display:"flex",gap:4}}>
          {SLOT_TYPES.map(([v,l])=>(
            <button key={v} onClick={()=>setType(v)}
              style={{padding:"4px 12px",borderRadius:6,border:type===v?"2px solid #f59e0b":"1px solid #e0d8ce",background:type===v?"#fef3c7":"#fff",fontSize:11,fontWeight:type===v?700:500,color:type===v?"#d97706":"#555",cursor:"pointer",fontFamily:"inherit"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
        {/* 第N */}
        {type==="nth_weekday"&&(
          <div>
            <label style={{fontSize:10,color:"#888",fontWeight:700,display:"block",marginBottom:4}}>第N</label>
            <div style={{display:"flex",gap:4}}>
              {SLOT_NTHS.map(([v,l])=>(
                <button key={v} onClick={()=>setNth(v)}
                  style={{padding:"4px 8px",borderRadius:6,border:nth===v?"2px solid #f59e0b":"1px solid #e0d8ce",background:nth===v?"#fef3c7":"#fff",fontSize:11,fontWeight:nth===v?700:500,color:nth===v?"#d97706":"#555",cursor:"pointer",fontFamily:"inherit"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 曜日 */}
        {type!=="daily"&&(
          <div style={{flex:1,minWidth:120}}>
            <label style={{fontSize:10,color:"#888",fontWeight:700,display:"block",marginBottom:4}}>曜日</label>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {SLOT_DOWS.map(([v,l])=>(
                <button key={v} onClick={()=>setDow(v)}
                  style={{padding:"4px 9px",borderRadius:6,border:dow===v?"2px solid #f59e0b":"1px solid #e0d8ce",background:dow===v?"#fef3c7":"#fff",fontSize:11,fontWeight:dow===v?700:500,color:dow===v?"#d97706":"#555",cursor:"pointer",fontFamily:"inherit"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 時刻（分単位） */}
        <div style={{minWidth:100}}>
          <label style={{fontSize:10,color:"#888",fontWeight:700,display:"block",marginBottom:4}}>時刻</label>
          <input type="time" value={time} onChange={e=>setTime(e.target.value)}
            style={{border:BD,borderRadius:7,padding:"5px 8px",fontSize:12,color:"#555",outline:"none",background:"#fff",cursor:"pointer"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"}
            onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
        </div>
      </div>

      {/* 投稿種類 */}
      <div style={{marginBottom:10}}>
        <label style={{fontSize:10,color:"#888",fontWeight:700,display:"block",marginBottom:4}}>投稿種類</label>
        <select value={postType} onChange={e=>setPostType(e.target.value)}
          style={{border:`1.5px solid ${pt.border}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:pt.color,background:pt.bg,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
          {Object.entries(postTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div style={{background:"#fff",border:"1px solid #fcd34d",borderRadius:7,padding:"6px 10px",fontSize:11,color:"#92400e",marginBottom:10,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
        <span>📅 {preview}</span>
        <span style={{color:pt.color,background:pt.bg,border:`1px solid ${pt.border}`,borderRadius:10,padding:"0 7px",fontSize:10,fontWeight:700}}>{pt.label}</span>
      </div>

      <button onClick={()=>onAdd({type,dow,nth,time,postType,title:""})}
        style={{width:"100%",background:"#f59e0b",border:"none",borderRadius:20,padding:"8px 0",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
        この枠を追加
      </button>
    </div>
  );
}
