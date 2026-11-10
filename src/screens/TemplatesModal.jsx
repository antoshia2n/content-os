import React, {useState,useEffect,useRef} from 'react';
import {BD,BD2,POST_TYPE} from '../constants.js';
import {dbAddTemplate,dbUpdateTemplate,dbRemoveTemplate} from '../lib/supabase.js';
import {TEMPLATE_KINDS,CURSOR_MARK,PROMPT_VARS} from '../lib/templates.js';
import {useDialogFocus} from '../lib/useDialogFocus.js';

// 型の管理（2026-11-10 Naoki「型のところは別途管理画面があるとよさそう」→ デモに OK 11:36）
// 左＝種類（本文・締め・メモ・プロンプト）、真ん中＝一覧（名前で探す・並べ替え）、右＝中身。書く画面の右の「型」タブは、ここで作ったものを使う場所
const HINT={
  body:'書く画面の右の「型」から、本文のカーソルの位置に差し込みます。',
  closing:'本文の末尾に足します（CTA・メンシプへの案内など）。',
  memo:'メモに差し込みます。「- 」と半角スペース 2 つで 1 階層の箇条書きのまま入ります。',
  prompt:'AI に渡す文。{タイトル}{本文}{メモ}{種類} を、書いている中身に置き換えてコピーします。',
};

function Field({value,onSave,multiline,placeholder,style,inputRef,label}){
  const [v,setV]=useState(value||'');
  const timer=useRef(null);
  useEffect(()=>setV(value||''),[value]);
  const commit=(x=v)=>{clearTimeout(timer.current);if(x!==(value||''))onSave(x);};
  // 打つ手を止めて 3 秒で保存（書く画面と同じ間）。外へ出たときもすぐ保存
  const change=e=>{const x=e.target.value;setV(x);clearTimeout(timer.current);timer.current=setTimeout(()=>commit(x),3000);};
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const common={value:v,placeholder,onChange:change,'aria-label':label,
    style:{width:'100%',boxSizing:'border-box',border:'1px solid #a39a90',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',color:'#1a1a1a',background:'#fff',outline:'none',...style},
    onFocus:e=>e.target.style.borderColor='#f59e0b'};
  return multiline
    ?<textarea ref={inputRef} {...common} onBlur={e=>{e.target.style.borderColor='';commit();}} style={{...common.style,resize:'vertical',lineHeight:1.7,minHeight:260}}/>
    :<input ref={inputRef} {...common} onBlur={e=>{e.target.style.borderColor='';commit();}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>;
}

export function TemplatesModal({uid,templates,setTemplates,postTypes=POST_TYPE,onClose,initialKind='body',initialId=null}){
  const first=initialId&&templates.find(t=>t.id===initialId);
  const [kind,setKind]=useState(first?first.kind:initialKind);
  const [selId,setSelId]=useState(first?first.id:null);
  const [q,setQ]=useState('');
  const [error,setError]=useState('');
  const [saved,setSaved]=useState('');
  const busy=useRef(false),area=useRef(null);
  const all=templates.filter(t=>t.kind===kind).sort((a,b)=>a.sort_order-b.sort_order);
  const items=q.trim()?all.filter(t=>(t.name+'\n'+t.content).toLowerCase().includes(q.trim().toLowerCase())):all;
  const cur=items.find(t=>t.id===selId)||items[0]||null;
  // Esc は窓の決まり（いちばん上の窓だけが閉じる）に任せる。後ろの編集画面は閉じない
  const box=useRef(null);
  useDialogFocus(box,{onClose});

  async function run(fn){
    if(busy.current)return;busy.current=true;setError('');
    try{await fn();}catch(e){const m=e.message||String(e);setError(/check constraint|violates/i.test(m)?'プロンプトの置き場はまだ準備中です（表の準備が済むと使えます）':m);}
    finally{busy.current=false;}
  }
  const put=row=>setTemplates(ts=>ts.some(t=>t.id===row.id)?ts.map(t=>t.id===row.id?row:t):[...ts,row]);
  const add=()=>run(async()=>{
    const order=all.length?Math.max(...all.map(t=>t.sort_order))+1:0;
    const row=await dbAddTemplate(uid,{name:'新しい'+(TEMPLATE_KINDS.find(([k])=>k===kind)||[,''])[1],kind,post_type:null,content:kind==='closing'||kind==='prompt'?'':CURSOR_MARK,sort_order:order});
    put(row);setSelId(row.id);setQ('');
  });
  const update=(t,fields)=>run(async()=>{put(await dbUpdateTemplate(uid,t.id,fields));const d=new Date();setSaved(`保存しました ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`);});
  // 確かめの窓（window.confirm）はやめ、2 回押しで消す（1 回目でボタンの字が変わる）
  const [armed,setArmed]=useState(null);
  const remove=t=>{if(armed!==t.id){setArmed(t.id);setTimeout(()=>setArmed(x=>x===t.id?null:x),4000);return;}setArmed(null);run(async()=>{await dbRemoveTemplate(uid,t.id);setTemplates(ts=>ts.filter(x=>x.id!==t.id));setSelId(null);});};
  const duplicate=t=>run(async()=>{const row=await dbAddTemplate(uid,{name:(t.name||'')+'（コピー）',kind:t.kind,post_type:t.post_type,content:t.content,sort_order:Math.max(...all.map(x=>x.sort_order))+1});put(row);setSelId(row.id);});
  const move=(i,dir)=>{
    if(!all[i+dir])return;
    const next=[...all];[next[i],next[i+dir]]=[next[i+dir],next[i]];
    run(async()=>{for(let n=0;n<next.length;n++){if(next[n].sort_order!==n)put(await dbUpdateTemplate(uid,next[n].id,{sort_order:n}));}});
  };
  // 差し込める言葉を、中身の欄のカーソルの位置へ入れる
  const putVar=w=>{const el=area.current;if(!el||!cur)return;const s=el.selectionStart??el.value.length,e=el.selectionEnd??s;const v=el.value.slice(0,s)+w+el.value.slice(e);update(cur,{content:v});setTimeout(()=>{el.focus();el.setSelectionRange(s+w.length,s+w.length);},0);};
  const ix=cur?all.findIndex(t=>t.id===cur.id):-1;
  const sb={border:'1px solid #e6dfd6',background:'#fff',borderRadius:8,padding:'6px 10px',fontSize:12,fontWeight:700,color:'#1a1a1a',cursor:'pointer',fontFamily:'inherit',minHeight:30};

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:14}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="templates-modal-title" style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:1080,height:'min(760px, calc(100vh - 28px))',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 60px #00000030'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:BD2}}>
          <span id="templates-modal-title" style={{fontWeight:800,fontSize:16,color:'#111'}}>型の管理</span>
          <span role="status" style={{fontSize:12,color:'#736a62'}}>{saved}</span>
          <button onClick={onClose} style={{marginLeft:'auto',background:'none',border:BD,borderRadius:20,padding:'5px 12px',fontSize:12,fontWeight:700,color:'#6b6259',cursor:'pointer'}}>閉じる</button>
        </div>
        <div style={{flex:1,minHeight:0,display:'grid',gridTemplateColumns:'190px 300px minmax(0,1fr)'}}>
          <div role="tablist" aria-label="型の種類" style={{background:'#f7f3ee',borderRight:BD2,padding:'10px 0',overflowY:'auto'}}>
            <div style={{fontSize:12,fontWeight:800,color:'#736a62',padding:'4px 14px 6px'}}>種類</div>
            {TEMPLATE_KINDS.map(([k,l])=>(
              <button key={k} role="tab" aria-selected={kind===k} onClick={()=>{setKind(k);setSelId(null);setQ('');}}
                style={{display:'flex',alignItems:'center',width:'100%',textAlign:'left',border:'none',padding:'9px 14px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',background:kind===k?'#fef3c7':'transparent',color:kind===k?'#b45309':'#6b6259'}}>
                {l}<span style={{marginLeft:'auto',fontWeight:600,color:'#736a62',fontSize:12}}>{templates.filter(t=>t.kind===k).length}</span>
              </button>
            ))}
            <div style={{fontSize:12,color:'#736a62',lineHeight:1.7,padding:'14px'}}>{HINT[kind]}</div>
          </div>
          <div style={{borderRight:BD2,display:'flex',flexDirection:'column',minHeight:0}}>
            <div style={{display:'flex',gap:6,padding:'10px 12px',borderBottom:BD2}}>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="名前・中身で探す" aria-label="型を探す" style={{flex:1,minWidth:0,border:'1px solid #a39a90',borderRadius:8,padding:'6px 9px',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
              <button onClick={add} style={{border:'1px solid #b45309',background:'#b45309',color:'#fff',borderRadius:8,padding:'6px 10px',fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>＋ 追加</button>
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              {items.map(t=>(
                <button key={t.id} onClick={()=>setSelId(t.id)} aria-current={cur&&cur.id===t.id?'true':undefined}
                  style={{display:'flex',flexDirection:'column',gap:3,width:'100%',textAlign:'left',border:'none',borderBottom:'1px solid #f1ebe4',padding:'10px 12px',cursor:'pointer',fontFamily:'inherit',background:cur&&cur.id===t.id?'#fffaf0':'#fff',boxShadow:cur&&cur.id===t.id?'inset 3px 0 0 #f59e0b':'none'}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#1a1a1a'}}>{t.name||'（名前なし）'}</span>
                  <span style={{fontSize:12,color:'#736a62',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.post_type?(postTypes[t.post_type]?.label||t.post_type):'すべての種類'} · {(t.content||'').replace(/\n/g,' ')}</span>
                </button>
              ))}
              {!items.length&&<div style={{color:'#736a62',fontSize:12.5,padding:'20px 14px',lineHeight:1.7}}>{q?'当てはまる型はありません':`${(TEMPLATE_KINDS.find(([k])=>k===kind)||[,''])[1]}の型はまだありません。上の「＋ 追加」で作れます`}</div>}
            </div>
          </div>
          <div style={{padding:16,display:'flex',flexDirection:'column',gap:10,overflowY:'auto',minWidth:0}}>
            {cur?<>
              <label style={{fontSize:12,fontWeight:700,color:'#6b6259'}}>名前</label>
              <Field key={cur.id+'n'} value={cur.name} label="型の名前" placeholder="型の名前" onSave={v=>update(cur,{name:v})} style={{fontWeight:700}}/>
              <label style={{fontSize:12,fontWeight:700,color:'#6b6259'}}>使う投稿の種類</label>
              <select value={cur.post_type||''} onChange={e=>update(cur,{post_type:e.target.value||null})} style={{border:'1px solid #a39a90',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',background:'#fff',maxWidth:260}}>
                <option value="">すべての種類</option>
                {cur.post_type&&!postTypes[cur.post_type]&&<option value={cur.post_type}>{cur.post_type}</option>}
                {Object.entries(postTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              <label style={{fontSize:12,fontWeight:700,color:'#6b6259'}}>中身</label>
              <Field key={cur.id+'c'} multiline inputRef={area} value={cur.content} label="型の中身" placeholder={kind==='memo'?'- 主題\n  - 理由':kind==='prompt'?'例：次の記事の冒頭を 3 案出して。\nタイトル：{タイトル}\n本文：{本文}':'中身'} onSave={v=>update(cur,{content:v})}/>
              {kind==='prompt'
                ?<div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}><span style={{fontSize:12,color:'#736a62'}}>差し込める言葉：</span>{PROMPT_VARS.map(w=><button key={w} onMouseDown={e=>e.preventDefault()} onClick={()=>putVar(w)} style={{...sb,borderRadius:99}}>{w}</button>)}</div>
                :kind!=='closing'&&<div style={{fontSize:12,color:'#736a62'}}><code style={{background:'#fef3c7',color:'#b45309',borderRadius:4,padding:'0 4px'}}>{CURSOR_MARK}</code> と書いた所に、差し込んだあとカーソルが来ます（1 つだけ）</div>}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
                <button disabled={ix<=0} onClick={()=>move(ix,-1)} aria-label="上へ" style={{...sb,opacity:ix<=0?.45:1}}>▲ 上へ</button>
                <button disabled={ix<0||ix>=all.length-1} onClick={()=>move(ix,1)} aria-label="下へ" style={{...sb,opacity:ix<0||ix>=all.length-1?.45:1}}>▼ 下へ</button>
                <button onClick={()=>duplicate(cur)} style={sb}>複製</button>
                <button onClick={()=>remove(cur)} style={{...sb,color:'#b91c1c',fontWeight:800}} aria-live="polite">{armed===cur.id?'もう一度押すと削除':'削除'}</button>
              </div>
              <div style={{fontSize:12,color:'#736a62'}}>打つ手を止めて 3 秒で自動保存</div>
            </>:<div style={{color:'#736a62',fontSize:13,lineHeight:1.7}}>左の一覧から型を選ぶと、ここで編集できます。</div>}
          </div>
        </div>
        {error&&<div role="alert" style={{padding:'8px 14px',background:'#fef2f2',color:'#b91c1c',fontSize:12,borderTop:'1px solid #fca5a5'}}>保存できませんでした：{error}</div>}
      </div>
    </div>
  );
}
