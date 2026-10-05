import React, {useState,useEffect,useRef} from 'react';
import {BD,BD2,POST_TYPE} from '../constants.js';
import {dbAddTemplate,dbUpdateTemplate,dbRemoveTemplate} from '../lib/supabase.js';
import {TEMPLATE_KINDS,CURSOR_MARK} from '../lib/templates.js';

// 段 5：型の一覧。種類（本文・メモ・締め）ごとに、足す・直す・消す・並べ替える
const HINT={
  body:'編集画面の「型」から、本文のカーソルの位置に差し込みます。',
  memo:'メモ側で「型」から差し込みます。「- 」と半角スペース 2 つで 1 階層の箇条書きのまま入ります。',
  closing:'本文の末尾に足します（CTA・メンシプへの案内など）。',
};

function Field({value,onSave,multiline,placeholder,style}){
  const [v,setV]=useState(value||'');
  useEffect(()=>setV(value||''),[value]);
  const commit=()=>{if(v!==(value||''))onSave(v);};
  const common={value:v,placeholder,onChange:e=>setV(e.target.value),onBlur:commit,
    style:{width:'100%',boxSizing:'border-box',border:BD,borderRadius:8,padding:'7px 9px',fontSize:12.5,fontFamily:'inherit',color:'#1a1a1a',background:'#fff',outline:'none',...style},
    onFocus:e=>e.target.style.borderColor='#f59e0b'};
  return multiline
    ?<textarea {...common} rows={Math.min(12,Math.max(3,v.split('\n').length+1))} onBlur={e=>{e.target.style.borderColor='';commit();}} style={{...common.style,resize:'vertical',lineHeight:1.65}}/>
    :<input {...common} onBlur={e=>{e.target.style.borderColor='';commit();}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>;
}

export function TemplatesModal({uid,templates,setTemplates,postTypes=POST_TYPE,onClose,initialKind='body'}){
  const [kind,setKind]=useState(initialKind);
  const [error,setError]=useState('');
  const busy=useRef(false);
  const items=templates.filter(t=>t.kind===kind).sort((a,b)=>a.sort_order-b.sort_order);
  useEffect(()=>{
    const k=e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};
    window.addEventListener('keydown',k,true);return()=>window.removeEventListener('keydown',k,true);
  },[onClose]);

  async function run(fn){
    if(busy.current)return;busy.current=true;setError('');
    try{await fn();}catch(e){setError(e.message||String(e));}
    finally{busy.current=false;}
  }
  const put=row=>setTemplates(ts=>ts.some(t=>t.id===row.id)?ts.map(t=>t.id===row.id?row:t):[...ts,row]);
  const add=()=>run(async()=>{
    const order=items.length?Math.max(...items.map(t=>t.sort_order))+1:0;
    put(await dbAddTemplate(uid,{name:'新しい型',kind,post_type:null,content:kind==='closing'?'':CURSOR_MARK,sort_order:order}));
  });
  const update=(t,fields)=>run(async()=>put(await dbUpdateTemplate(uid,t.id,fields)));
  const remove=t=>{if(!window.confirm(`「${t.name||'（名前なし）'}」を消しますか？`))return;run(async()=>{await dbRemoveTemplate(uid,t.id);setTemplates(ts=>ts.filter(x=>x.id!==t.id));});};
  const move=(i,dir)=>{
    if(!items[i+dir])return;
    const next=[...items];[next[i],next[i+dir]]=[next[i+dir],next[i]];
    run(async()=>{
      // 種類の中を 0 から振り直す（値の重なりで並びが崩れないため）
      for(let n=0;n<next.length;n++){if(next[n].sort_order!==n)put(await dbUpdateTemplate(uid,next[n].id,{sort_order:n}));}
    });
  };

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:14}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:640,maxHeight:'calc(100vh - 28px)',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 60px #00000030'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 14px',borderBottom:BD2}}>
          <span style={{fontWeight:800,fontSize:14,color:'#111'}}>型の一覧</span>
          <div style={{display:'flex',background:'#f5f0eb',borderRadius:8,padding:2,gap:2,border:BD2,marginLeft:6}}>
            {TEMPLATE_KINDS.map(([k,l])=>(
              <button key={k} onClick={()=>setKind(k)} style={{padding:'4px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:700,background:kind===k?'#fff':'transparent',color:kind===k?'#111':'#a8a09a',boxShadow:kind===k?'0 1px 2px rgba(0,0,0,.06)':'none'}}>
                {l} <span style={{fontWeight:600,color:'#b8afa5'}}>{templates.filter(t=>t.kind===k).length}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{marginLeft:'auto',background:'none',border:BD,borderRadius:20,padding:'5px 11px',fontSize:12,fontWeight:600,color:'#888',cursor:'pointer'}}>閉じる</button>
        </div>
        <div style={{padding:'10px 14px',borderBottom:BD2,background:'#fcfaf8',fontSize:11.5,color:'#6b6560',lineHeight:1.7}}>
          {HINT[kind]}<br/>
          中に <code style={{background:'#fef3c7',color:'#b45309',borderRadius:4,padding:'0 4px'}}>{CURSOR_MARK}</code> と書いた場所に、差し込んだあとカーソルが来ます（1 つだけ。無ければ差し込んだ文の最後）。
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'10px 14px',display:'flex',flexDirection:'column',gap:10,background:'#f5f0eb'}}>
          {items.map((t,i)=>(
            <div key={t.id} style={{background:'#fff',border:BD2,borderRadius:12,padding:10,display:'flex',flexDirection:'column',gap:7}}>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <div style={{flex:1,minWidth:0}}><Field value={t.name} placeholder="型の名前" onSave={v=>update(t,{name:v})} style={{fontWeight:700}}/></div>
                <select value={t.post_type||''} onChange={e=>update(t,{post_type:e.target.value||null})}
                  style={{border:BD,borderRadius:8,padding:'6px 8px',fontSize:12,fontFamily:'inherit',color:'#555',background:'#fff',maxWidth:150}}>
                  <option value="">全部の投稿タイプ</option>
                  {t.post_type&&!postTypes[t.post_type]&&<option value={t.post_type}>{t.post_type}</option>}
                  {Object.entries(postTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <Field multiline value={t.content} placeholder={kind==='memo'?'- 主題\n  - 理由':'中身'} onSave={v=>update(t,{content:v})}/>
              <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                <button disabled={i===0} onClick={()=>move(i,-1)} style={btn(i===0)}>上へ</button>
                <button disabled={i===items.length-1} onClick={()=>move(i,1)} style={btn(i===items.length-1)}>下へ</button>
                <button onClick={()=>remove(t)} style={{...btn(false),color:'#b45353'}}>消す</button>
              </div>
            </div>
          ))}
          {!items.length&&<div style={{textAlign:'center',color:'#a8a09a',fontSize:12.5,padding:'24px 0'}}>{TEMPLATE_KINDS.find(([k])=>k===kind)[1]}の型はまだありません。</div>}
          <button onClick={add} style={{border:'1px dashed #d8d0c6',background:'#fff',borderRadius:12,padding:'10px 0',fontSize:12.5,fontWeight:700,color:'#b45309',cursor:'pointer'}}>＋ {TEMPLATE_KINDS.find(([k])=>k===kind)[1]}の型を足す</button>
        </div>
        {error&&<div style={{padding:'8px 14px',background:'#fef2f2',color:'#dc2626',fontSize:12,borderTop:'1px solid #fca5a5'}}>保存できませんでした：{error}</div>}
      </div>
    </div>
  );
}
function btn(disabled){return {border:BD,background:'#fff',borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700,color:disabled?'#d4cbbf':'#6b6560',cursor:disabled?'default':'pointer'};}
