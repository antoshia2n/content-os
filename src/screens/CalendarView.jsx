import React, { useState } from "react";
import { POST_TYPE, getPostTypeStyle, BD, S, SLOT_DOWS, SLOT_NTHS, SLOT_TYPES } from "../constants.js";

// 2026-10-23 5便：使っていなかった月表示（MonthView）と古いリスト（ListView）を消した。カレンダーは App.jsx の週と PlanView.jsx のリスト

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
  const pt=getPostTypeStyle(postType,postTypes);

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
