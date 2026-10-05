import React, {useState,useRef,useEffect} from 'react';
import {BD,BD2} from '../constants.js';
import {templatesFor,insertIntoText,insertIntoBody,TEMPLATE_KINDS} from '../lib/templates.js';

// 段 5：編集画面の「型」ボタン。いま開いている側（本文かメモ）と投稿タイプに合う型だけを出す。
// 型を自動で入れることはしない（Naoki 確定）。押して選んだときだけ差し込む
const KIND_LABEL=Object.fromEntries(TEMPLATE_KINDS);

export function TemplatePicker({templates,side,postType,postTypes,bodyRef,memoRef,draft,setDraft,onManage,compact=false}){
  const [open,setOpen]=useState(false);
  const range=useRef(null),box=useRef(null);
  const list=templatesFor(templates,side,postType);
  useEffect(()=>{
    if(!open)return;
    const h=e=>{if(box.current&&!box.current.contains(e.target))setOpen(false);};
    const k=e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}};
    document.addEventListener('mousedown',h);window.addEventListener('keydown',k,true);
    return()=>{document.removeEventListener('mousedown',h);window.removeEventListener('keydown',k,true);};
  },[open]);

  function remember(e){
    e.preventDefault(); // 本文のカーソル位置を失わないため
    const sel=window.getSelection();
    range.current=null;
    if(sel&&sel.rangeCount>0){const r=sel.getRangeAt(0);if(bodyRef.current?.contains(r.commonAncestorContainer))range.current=r.cloneRange();}
    setOpen(o=>!o);
  }
  function use(t){
    setOpen(false);
    if(t.kind==='memo'){
      const el=memoRef.current,text=draft.memo||'';
      const s=el?el.selectionStart:text.length,e=el?el.selectionEnd:text.length;
      const r=insertIntoText(text,s,e,t.content);
      setDraft(d=>({...d,memo:r.text}));
      setTimeout(()=>{const x=memoRef.current;if(x){x.focus();x.setSelectionRange(r.pos,r.pos);}},0);
      return;
    }
    const html=insertIntoBody(bodyRef.current,range.current,t.content,t.kind==='closing');
    if(html!=null)setDraft(d=>({...d,body:html}));
  }

  const groups=side==='memo'?['memo']:['body','closing'];
  return(
    <div ref={box} style={{position:'relative',flexShrink:0}}>
      <button onMouseDown={remember} title={side==='memo'?'メモの型を差し込む':'本文・締めの型を差し込む'}
        style={{background:open?'#fef3c7':'#fff',border:open?'1px solid #fcd34d':BD,borderRadius:compact?20:10,padding:compact?'5px 12px':'7px 13px',fontSize:12,fontWeight:700,color:open?'#b45309':'#4b4540',cursor:'pointer',whiteSpace:'nowrap',fontFamily:'inherit'}}>
        型
      </button>
      {open&&(
        <div style={{position:'absolute',right:compact?'auto':0,left:compact?0:'auto',top:'calc(100% + 6px)',zIndex:300,background:'#fff',border:BD2,borderRadius:12,boxShadow:'0 8px 24px rgba(0,0,0,.12)',width:compact?'min(300px, calc(100vw - 20px))':280,maxHeight:360,overflowY:'auto',padding:6}}>
          <div style={{fontSize:10.5,fontWeight:700,color:'#a8a09a',padding:'4px 8px 6px'}}>
            {side==='memo'?'メモに差し込む':'本文に差し込む（締めは末尾に足す）'}・{postTypes[postType]?.label||postType}
          </div>
          {groups.map(k=>{
            const items=list.filter(t=>t.kind===k);
            if(!items.length)return null;
            return(
              <div key={k} style={{marginBottom:4}}>
                {groups.length>1&&<div style={{fontSize:10,fontWeight:800,color:'#b8afa5',padding:'4px 8px 2px'}}>{KIND_LABEL[k]}</div>}
                {items.map(t=>(
                  <button key={t.id} onMouseDown={e=>e.preventDefault()} onClick={()=>use(t)}
                    style={{display:'block',width:'100%',textAlign:'left',border:'none',background:'none',borderRadius:8,padding:'7px 9px',cursor:'pointer',fontFamily:'inherit'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f5f0eb'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                    <div style={{fontSize:12.5,fontWeight:700,color:'#111'}}>{t.name||'（名前なし）'}</div>
                    <div style={{fontSize:11,color:'#a8a09a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(t.content||'').replace(/\n/g,' ／ ')}</div>
                  </button>
                ))}
              </div>
            );
          })}
          {!list.length&&<div style={{fontSize:12,color:'#a8a09a',padding:'10px 9px',lineHeight:1.6}}>この投稿タイプで使える{side==='memo'?'メモ':'本文・締め'}の型はまだありません。</div>}
          {onManage&&<button onMouseDown={e=>e.preventDefault()} onClick={()=>{setOpen(false);onManage();}} style={{display:'block',width:'100%',textAlign:'center',border:'none',borderTop:BD2,background:'none',padding:'8px 0 4px',marginTop:2,fontSize:11.5,fontWeight:700,color:'#6b6560',cursor:'pointer'}}>型の一覧を開く</button>}
        </div>
      )}
    </div>
  );
}
