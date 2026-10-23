import React, { useState } from "react";
import { BD, S, REPOST_REPEATS, fmtDate } from "../constants.js";

export function RepostModal({post,onClose,onRepost}){
  const today=fmtDate(new Date());
  const [dt,setDt]=useState(`${today}T09:00`);
  const [repeat,setRepeat]=useState("none");
  // REPOST_REPEATS はモジュールレベルで定義済み
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:380,padding:24,boxShadow:"0 20px 60px #00000025"}}>
        <div style={{fontWeight:800,fontSize:"1.05em",color:"#0f1419",marginBottom:4}}>🔁 再投稿</div>
        <div style={{fontSize:"0.8em",color:"#536471",marginBottom:18,lineHeight:1.5}}>「{post.title||"（タイトルなし）"}」を再投稿します</div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:"0.73em",fontWeight:700,color:"#888",display:"block",marginBottom:4}}>投稿日時</label>
          <input type="datetime-local" value={dt} onChange={e=>setDt(e.target.value)}
            style={{width:"100%",border:BD,borderRadius:8,padding:"8px 10px",fontSize:"0.84em",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{fontSize:"0.73em",fontWeight:700,color:"#888",display:"block",marginBottom:6}}>定期繰り返し</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
            {REPOST_REPEATS.map(([v,l])=>(
              <button key={v} onClick={()=>setRepeat(v)}
                style={{border:`1.5px solid ${repeat===v?"#f59e0b":"#e0d8ce"}`,background:repeat===v?"#fef3c7":"#fff",color:repeat===v?"#d97706":"#888",borderRadius:8,padding:"7px 0",fontSize:"0.73em",fontWeight:repeat===v?700:400,cursor:"pointer",fontFamily:"inherit"}}>
                {l}
              </button>
            ))}
          </div>
          {repeat!=="none"&&<div style={{marginTop:8,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:7,padding:"7px 10px",fontSize:"0.73em",color:"#92400e"}}>{REPOST_REPEATS.find(([v])=>v===repeat)?.[1]}に自動作成されます</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onRepost(dt,repeat)} style={{flex:1,background:"#f59e0b",border:"none",borderRadius:20,padding:"10px 0",fontWeight:800,fontSize:"0.85em",color:"#fff",cursor:"pointer"}}>再投稿を作成</button>
          <button onClick={onClose} style={{border:BD,background:"none",borderRadius:20,padding:"10px 14px",fontWeight:600,fontSize:"0.85em",color:"#888",cursor:"pointer"}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// 検索モーダル
// ════════════════════════════════════════════════════════
// 2026-10-23 5便：⌘K は FindView の FindModal に替わったので、古い検索の窓（SearchModal）を消した
