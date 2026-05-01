import React, { useState, useRef, useEffect, useCallback } from "react";
import { COLORS, BD, BD2, S } from "../constants.js";
import { Btn } from "../components/shared.jsx";

export function AccountSettings({accounts,onUpdate,onDelete,onAdd,onCopyLink,onClose}){
  const [editingId,setEditingId]=useState(null),[draft,setDraft]=useState({});
  function startEdit(acc){setEditingId(acc.id);setDraft({name:acc.name,handle:acc.handle,color:acc.color});}
  function commitEdit(){onUpdate(editingId,draft);setEditingId(null);}
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",border:BD2,borderRadius:17,width:"100%",maxWidth:520,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000025"}}>
        <div style={{padding:"15px 20px",borderBottom:BD2,display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f5f0eb"}}>
          <div>
            <div style={{fontSize:15,fontWeight:900}}>クライアント管理</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:2}}>名前・カラーを編集できます</div>
          </div>
          <Btn onClick={onClose}>閉じる</Btn>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          {accounts.map(acc=>(
            <div key={acc.id} style={{background:"#f5f0eb",border:BD2,borderRadius:12,padding:"14px 16px",marginBottom:10}}>
              {editingId===acc.id?(
                <div style={{...S.col,gap:10}}>
                  <div style={{display:"flex",gap:8}}>
                    <div style={{flex:1}}><label style={{fontSize:11,color:"#999",fontWeight:700,display:"block",marginBottom:4}}>クライアント名</label><input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} style={INP}/></div>
                    <div style={{flex:1}}><label style={{fontSize:11,color:"#999",fontWeight:700,display:"block",marginBottom:4}}>ハンドル</label><input value={draft.handle} onChange={e=>setDraft(d=>({...d,handle:e.target.value}))} style={INP} placeholder="@handle"/></div>
                  </div>
                  <div>
                    <label style={{fontSize:11,color:"#999",fontWeight:700,display:"block",marginBottom:6}}>カラー</label>
                    <div style={{display:"flex",gap:6}}>
                      {COLORS.map(c=><button key={c} onClick={()=>setDraft(d=>({...d,color:c}))} style={{width:26,height:26,borderRadius:"50%",background:c,border:draft.color===c?"3px solid #1a1a1a":"3px solid transparent",cursor:"pointer"}}/>)}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:7}}><Btn primary onClick={commitEdit} style={{flex:1}}>保存</Btn><Btn onClick={()=>setEditingId(null)}>キャンセル</Btn></div>
                </div>
              ):(
                <div>
                  <div style={{...S.row,gap:8,marginBottom:10}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:acc.color,display:"inline-block"}}/>
                    <span style={{fontWeight:800,fontSize:14}}>{acc.name}</span>
                    <span style={{fontSize:12,color:"#bbb"}}>{acc.handle}</span>
                  </div>
                  <div style={{background:"#fff",border:BD2,borderRadius:7,padding:"6px 10px",fontSize:11,color:"#bbb",fontFamily:"monospace",marginBottom:10,wordBreak:"break-all"}}>
                    {typeof window!=="undefined"?window.location.href.split("?")[0]:"https://your-app.vercel.app/"}?account={acc.id}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <Btn onClick={()=>startEdit(acc)} style={{flex:1}}>編集</Btn>
                    <button onClick={()=>onCopyLink(acc.id)} style={{flex:1,background:"#f59e0b",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer"}}>リンクをコピー</button>
                    {accounts.length>1&&<Btn danger onClick={()=>onDelete(acc.id)}>削除</Btn>}
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={onAdd}
            style={{width:"100%",background:"#fff",border:"2px dashed #e0d8ce",borderRadius:10,padding:"11px",color:"#bbb",cursor:"pointer",fontSize:13,transition:"all 0.15s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0d8ce";e.currentTarget.style.color="#bbb";}}>
            + クライアントを追加
          </button>
        </div>
      </div>
    </div>
  );
}
