import React, { useState, useRef, useEffect, useCallback } from "react";
import { POST_TYPE, STATUS, SCORE, BD, BD2, S, XFONT, REPOST_REPEATS, fmtDate, fmtTime, nowStr, stripHtml, genId, isUrl, nextDaySameTime } from "../constants.js";

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
export function SearchModal({posts,onClose,onSelect,onRepost}){
  const [q,setQ]=useState("");
  const [filterPt,setFilterPt]=useState([]);
  const [filterScore,setFilterScore]=useState([]);
  const [filterLabel,setFilterLabel]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [showFilters,setShowFilters]=useState(false);
  const inputRef=useRef(null);
  const composing=useRef(false);

  useEffect(()=>{inputRef.current?.focus();},[]);
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  // 全投稿からラベル一覧を生成
  const allLabels=React.useMemo(()=>{
    const s=new Set();
    posts.forEach(p=>(p.labels||[]).forEach(l=>s.add(l)));
    return [...s].sort();
  },[posts]);

  const hasFilter=filterPt.length>0||filterScore.length>0||filterLabel||dateFrom||dateTo;

  const results=React.useMemo(()=>posts.filter(p=>{
    if(q){
      const qq=q.toLowerCase();
      const hit=p.title.toLowerCase().includes(qq)
        ||stripHtml(p.body).toLowerCase().includes(qq)
        ||(p.memo||"").toLowerCase().includes(qq)
        ||(p.labels||[]).some(l=>l.toLowerCase().includes(qq));
      if(!hit)return false;
    }
    if(filterPt.length>0&&!filterPt.includes(p.postType||"x_post"))return false;
    if(filterScore.length>0&&!filterScore.includes(p.score))return false;
    if(filterLabel&&!(p.labels||[]).includes(filterLabel))return false;
    if(dateFrom&&p.datetime.slice(0,10)<dateFrom)return false;
    if(dateTo&&p.datetime.slice(0,10)>dateTo)return false;
    return true;
  }).sort((a,b)=>b.datetime.localeCompare(a.datetime)),[posts,q,filterPt,filterScore,filterLabel,dateFrom,dateTo]);

  const toggle=(arr,setArr,v)=>setArr(prev=>prev.includes(v)?prev.filter(x=>x!==v):[...prev,v]);
  const chipBtn=(label,active,onClick,color)=>(
    <button onClick={onClick}
      style={{padding:"2px 9px",borderRadius:99,border:`1.5px solid ${active?(color||"#111"):"#e0d8ce"}`,background:active?(color||"#111"):"#fff",color:active?"#fff":"#555",fontSize:10.5,fontWeight:active?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all .12s",whiteSpace:"nowrap"}}>
      {label}
    </button>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:700,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"48px 20px 20px"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:680,maxHeight:"80vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.18)",border:BD2}}>

        {/* 検索バー */}
        <div style={{padding:"14px 16px",borderBottom:BD2,display:"flex",gap:8,alignItems:"center"}}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#aaa" strokeWidth="2"><circle cx="6.5" cy="6.5" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
          <input ref={inputRef} value={q}
            onChange={e=>setQ(e.target.value)}
            onCompositionStart={()=>{composing.current=true;}}
            onCompositionEnd={e=>{composing.current=false;setQ(e.target.value);}}
            placeholder="タイトル・本文・メモ・ラベルで検索…"
            style={{flex:1,border:"none",outline:"none",fontSize:14,fontFamily:"inherit",color:"#111"}}/>
          {q&&<button onClick={()=>setQ("")} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer",fontSize:16}}>×</button>}
          <button onClick={()=>setShowFilters(v=>!v)}
            style={{...S.row,gap:4,border:`1px solid ${hasFilter?"#111":"#e0d8ce"}`,borderRadius:8,padding:"4px 9px",fontSize:11.5,fontWeight:600,color:hasFilter?"#111":"#888",background:hasFilter?"#f5f0eb":"#fff",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
            絞り込み{hasFilter&&<span style={{background:"#111",color:"#fff",borderRadius:99,width:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,marginLeft:2}}>{[filterPt.length,filterScore.length,filterLabel?1:0,dateFrom||dateTo?1:0].reduce((a,b)=>a+b,0)}</span>}
          </button>
        </div>

        {/* フィルターパネル */}
        {showFilters&&(
          <div style={{padding:"12px 16px",borderBottom:BD2,background:"#faf7f3",display:"flex",flexDirection:"column",gap:10}}>
            {/* メディア */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#a8a09a",marginBottom:5,letterSpacing:".4px"}}>メディア</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {Object.entries(POST_TYPE).map(([k,v])=>chipBtn(v.label,filterPt.includes(k),()=>toggle(filterPt,setFilterPt,k),v.color))}
              </div>
            </div>
            {/* スコア */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#a8a09a",marginBottom:5,letterSpacing:".4px"}}>スコア</div>
              <div style={{display:"flex",gap:4}}>
                {Object.entries(SCORE).map(([k,v])=>chipBtn(k,filterScore.includes(k),()=>toggle(filterScore,setFilterScore,k),v.bg))}
              </div>
            </div>
            {/* ラベル */}
            {allLabels.length>0&&(
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#a8a09a",marginBottom:5,letterSpacing:".4px"}}>ラベル</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {allLabels.map(l=>chipBtn(l,filterLabel===l,()=>setFilterLabel(v=>v===l?"":l)))}
                </div>
              </div>
            )}
            {/* 日付 */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#a8a09a",marginBottom:5,letterSpacing:".4px"}}>日付</div>
              <div style={{...S.row,gap:6}}>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  style={{border:BD,borderRadius:6,padding:"4px 7px",fontSize:11,fontFamily:"inherit",outline:"none",color:"#333"}}/>
                <span style={{fontSize:11,color:"#aaa"}}>〜</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  style={{border:BD,borderRadius:6,padding:"4px 7px",fontSize:11,fontFamily:"inherit",outline:"none",color:"#333"}}/>
                {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");}}
                  style={{border:"none",background:"none",color:"#aaa",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>クリア</button>}
              </div>
            </div>
            {hasFilter&&<button onClick={()=>{setFilterPt([]);setFilterScore([]);setFilterLabel("");setDateFrom("");setDateTo("");}}
              style={{alignSelf:"flex-start",border:"none",background:"none",color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",padding:0}}>
              すべてクリア
            </button>}
          </div>
        )}

        {/* 結果一覧 */}
        <div style={{flex:1,overflowY:"auto"}}>
          {results.length===0
            ?<div style={{padding:"48px 0",textAlign:"center",color:"#ccc",fontSize:13}}>該当なし</div>
            :results.map(p=>{
              const pt2=POST_TYPE[p.postType||"x_post"],st=STATUS[p.status];
              const sc=SCORE[p.score];
              return(
                <div key={p.id}
                  style={{padding:"11px 16px",borderBottom:"1px solid #f5f0eb",display:"flex",gap:10,alignItems:"flex-start"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8f5f1"}
                  onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:pt2.dot,flexShrink:0,marginTop:6}}/>
                  <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>onSelect(p)}>
                    <div style={{fontWeight:700,fontSize:13,color:"#111",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title||"（タイトルなし）"}</div>
                    <div style={{fontSize:11.5,color:"#8b98a5",lineHeight:1.4,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{stripHtml(p.body).slice(0,60)||"（本文なし）"}</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontSize:10,color:pt2.color,fontWeight:600,background:pt2.bg,border:`1px solid ${pt2.border}`,padding:"1px 6px",borderRadius:99}}>{pt2.label}</span>
                      {st&&<span style={{fontSize:10,color:st.text,background:st.chip,border:`1px solid ${st.border}`,padding:"1px 6px",borderRadius:99,fontWeight:600}}>{st.label}</span>}
                      {sc&&<span style={{fontSize:10,fontWeight:800,color:sc.color,background:sc.bg,padding:"1px 6px",borderRadius:99}}>{p.score}</span>}
                      {(p.labels||[]).map(l=><span key={l} style={{fontSize:10,color:"#555",background:"#f5f0eb",border:BD,padding:"1px 6px",borderRadius:99}}>{l}</span>)}
                      <span style={{fontSize:10,color:"#bbb",marginLeft:"auto"}}>{p.datetime.slice(0,10)}</span>
                    </div>
                  </div>
                  <button onClick={()=>onRepost(p)}
                    style={{border:BD,background:"none",color:"#888",borderRadius:7,padding:"4px 9px",fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}
                    onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="#f59e0b";}}
                    onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#888";e.currentTarget.style.borderColor="#e0d8ce";}}>
                    再投稿
                  </button>
                </div>
              );
            })}
        </div>

        {/* フッター */}
        <div style={{padding:"9px 16px",borderTop:BD2,fontSize:11.5,color:"#aaa",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>{results.length}件</span>
          <button onClick={onClose} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer",fontSize:11.5}}>閉じる (Esc)</button>
        </div>
      </div>
    </div>
  );
}
