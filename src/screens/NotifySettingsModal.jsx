import React, { useState, useRef, useEffect, useCallback } from "react";
import { BD, BD2, S } from "../constants.js";

export function NotifySettingsModal({settings,accountName,onSave,onClose,onTestSend}){
  const [draft,setDraft]=useState({...settings});
  const [sending,setSending]=useState(false);
  const changed=JSON.stringify(draft)!==JSON.stringify(settings);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000030"}}>
        {/* ヘッダー */}
        <div style={{padding:"14px 18px",borderBottom:BD2,display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f5f0eb"}}>
          <div>
            <div style={{fontWeight:800,fontSize:14}}>🔔 メール通知設定</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{accountName} — Vercel Cronで毎日自動送信</div>
          </div>
          <Btn onClick={onClose}>閉じる</Btn>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:14}}>
          {/* 有効/無効トグル */}
          <div style={{...S.rowB,background:draft.enabled?"#f0fdf4":"#f9fafb",border:`1.5px solid ${draft.enabled?"#86efac":"#e0d8ce"}`,borderRadius:10,padding:"12px 14px"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:draft.enabled?"#15803d":"#555"}}>通知を{draft.enabled?"有効":"無効"}</div>
              <div style={{fontSize:11,color:"#888",marginTop:2}}>オンにするとメールが届きます</div>
            </div>
            <button onClick={()=>setDraft(d=>({...d,enabled:!d.enabled}))}
              style={{width:44,height:24,borderRadius:12,border:"none",background:draft.enabled?"#22c55e":"#d1d5db",cursor:"pointer",position:"relative",transition:"background .2s"}}>
              <span style={{position:"absolute",top:2,left:draft.enabled?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px #0003",transition:"left .2s",display:"block"}}/>
            </button>
          </div>
          {/* メールアドレス */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#888",display:"block",marginBottom:5}}>送信先メールアドレス</label>
            <input value={draft.email||""} onChange={e=>setDraft(d=>({...d,email:e.target.value}))}
              placeholder="your@email.com" type="email"
              style={{...INP,fontSize:13}}
              onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
          </div>
          {/* 送信時刻 */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#888",display:"block",marginBottom:5}}>送信時刻</label>
            <select value={draft.send_hour} onChange={e=>setDraft(d=>({...d,send_hour:Number(e.target.value)}))}
              style={{border:BD,borderRadius:8,padding:"7px 10px",fontSize:13,color:"#555",outline:"none",cursor:"pointer",background:"#fff",fontFamily:"inherit"}}>
              {HOURS.map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}
            </select>
            <span style={{fontSize:11,color:"#aaa",marginLeft:8}}>（JST）毎日この時刻に送信</span>
          </div>
          {/* 通知種別 */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#888",display:"block",marginBottom:8}}>通知内容</label>
            <div style={{...S.col,gap:8}}>
              {[
                ["notify_overdue","⚠️ 未投稿アラート","予約済みのまま期限が過ぎた投稿を通知"],
                ["notify_today","📅 本日の予定","当日の予約済み投稿一覧を朝に通知"],
                ["notify_daily","📊 日次ダイジェスト","全ステータスの進捗サマリーを通知"],
              ].map(([key,label,desc])=>(
                <label key={key} style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",background:"#f8f5f1",border:`1.5px solid ${draft[key]?"#f59e0b":"#e0d8ce"}`,borderRadius:9,padding:"10px 12px"}}>
                  <input type="checkbox" checked={!!draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.checked}))} style={{marginTop:2,accentColor:"#f59e0b",width:15,height:15}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#0f1419"}}>{label}</div>
                    <div style={{fontSize:10,color:"#888",marginTop:2}}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {/* セットアップ案内 */}
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 12px",fontSize:11,color:"#92400e",lineHeight:1.7}}>
            <div style={{fontWeight:700,marginBottom:4}}>📋 セットアップ手順</div>
            <div>1. <strong>Resend</strong>（resend.com）でAPIキーを取得</div>
            <div>2. Vercel環境変数に <code style={{background:"#fef3c7",padding:"0 4px",borderRadius:3}}>RESEND_API_KEY</code> を追加</div>
            <div>3. <code style={{background:"#fef3c7",padding:"0 4px",borderRadius:3}}>vercel.json</code> でCronを設定（下記ファイル参照）</div>
          </div>
        </div>
        {/* フッター */}
        <div style={{padding:"12px 18px",borderTop:BD2,display:"flex",gap:8,background:"#f5f0eb"}}>
          <button onClick={async()=>{setSending(true);await onTestSend(draft.email);setSending(false);}}
            disabled={!draft.email||sending}
            style={{border:BD,background:"#fff",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:draft.email?"#555":"#bbb",cursor:draft.email?"pointer":"default",fontFamily:"inherit"}}>
            {sending?"送信中…":"📨 テスト送信"}
          </button>
          <div style={{flex:1}}/>
          <Btn onClick={onClose}>キャンセル</Btn>
          <Btn primary onClick={()=>onSave(draft)} style={{opacity:changed?1:0.5,cursor:changed?"pointer":"default"}}>保存</Btn>
        </div>
      </div>
    </div>
  );
}
