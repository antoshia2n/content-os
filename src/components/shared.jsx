import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { BD, BD2, S, COLORS, isUrl } from "../constants.js";
import { indentLines, handleEnter, handleBackspace, handlePaste, insertBullet as insertBulletText, isComposingKey } from "../lib/memoList.js";

export function TagSelector({
  // 表示用
  label,          // セクションラベル（例："メディア"）
  badge,          // トリガーに表示するReact要素
  // 選択肢
  options,        // [{value, label, color, bg, border}]
  selected,       // 現在選択中のvalue（単一）or value[]（複数）
  multi=false,    // 複数選択か
  // コールバック
  onChange,       // (value or value[]) => void
  onClear,        // クリアボタン用（optional）
  // ラベル新規追加
  allowNew=false, // 新規入力を許可するか
  onAdd,          // (newValue) => void
  disabled=false,
}){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const [newVal,setNewVal]=useState("");
  const ref=useRef(null);
  const inputRef=useRef(null);
  const composing=useRef(false);

  useEffect(()=>{
    if(!open){setQ("");return;}
    setTimeout(()=>inputRef.current?.focus(),50);
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    window.addEventListener("click",h);
    return()=>window.removeEventListener("click",h);
  },[open]);

  const filtered=options.filter(o=>
    !q||o.label.toLowerCase().includes(q.toLowerCase())||String(o.value).toLowerCase().includes(q.toLowerCase())
  );

  const isSelected=v=>Array.isArray(selected)?selected.includes(v):selected===v;

  const toggle=v=>{
    if(multi){
      const arr=Array.isArray(selected)?selected:[];
      onChange(arr.includes(v)?arr.filter(x=>x!==v):[...arr,v]);
    } else {
      onChange(isSelected(v)?null:v);
      setOpen(false);
    }
  };

  const handleAdd=()=>{
    const v=newVal.trim();
    if(!v)return;
    onAdd?.(v);
    setNewVal("");
    if(!multi)setOpen(false);
  };

  return(
    <div ref={ref} style={{position:"relative",display:"inline-block"}}>
      {/* トリガーバッジ */}
      <div onClick={()=>!disabled&&setOpen(v=>!v)}
        style={{cursor:disabled?"default":"pointer",userSelect:"none",opacity:disabled?0.5:1}}>
        {badge}
      </div>

      {/* ドロップダウン */}
      {open&&(
        <div style={{
          position:"absolute",top:"calc(100% + 5px)",left:0,zIndex:500,
          background:"#fff",border:BD,borderRadius:12,
          width:220,boxShadow:"0 8px 28px rgba(0,0,0,.12)",
          display:"flex",flexDirection:"column",overflow:"hidden",
        }}>
          {/* ヘッダー */}
          <div style={{padding:"8px 10px 6px",borderBottom:"1px solid #f0ebe4"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#a8a09a",marginBottom:5,letterSpacing:".4px"}}>{label}</div>
            <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)}
              placeholder="検索…"
              style={{width:"100%",border:BD,borderRadius:6,padding:"4px 8px",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",color:"#333"}}
              onFocus={e=>e.target.style.borderColor="#f59e0b"}
              onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
          </div>

          {/* 選択肢リスト */}
          <div style={{maxHeight:200,overflowY:"auto"}}>
            {onClear&&(Array.isArray(selected)?selected.length>0:selected)&&(
              <button onClick={()=>{onClear?.();if(!multi)setOpen(false);}}
                style={{width:"100%",border:"none",background:"none",padding:"7px 11px",fontSize:11.5,color:"#ef4444",cursor:"pointer",textAlign:"left",fontFamily:"inherit",fontWeight:600}}>
                × クリア
              </button>
            )}
            {filtered.length===0&&<div style={{padding:"12px 11px",fontSize:12,color:"#ccc"}}>該当なし</div>}
            {filtered.map(o=>{
              const sel=isSelected(o.value);
              return(
                <button key={o.value} onClick={()=>toggle(o.value)}
                  style={{
                    width:"100%",border:"none",background:sel?(o.bg||"#f5f0eb"):"none",
                    padding:"7px 11px",fontSize:12,cursor:"pointer",textAlign:"left",
                    fontFamily:"inherit",display:"flex",alignItems:"center",gap:7,
                    color:sel?(o.color||"#111"):"#333",fontWeight:sel?700:500,
                    transition:"background .1s",
                  }}
                  onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="#f8f4f0";}}
                  onMouseLeave={e=>{if(!sel)e.currentTarget.style.background="none";}}>
                  {o.dot&&<span style={{width:7,height:7,borderRadius:"50%",background:o.dot,flexShrink:0}}/>}
                  {o.swatch&&<span style={{width:14,height:14,borderRadius:3,background:o.swatch,flexShrink:0,border:"1px solid rgba(0,0,0,.08)"}}/>}
                  <span style={{flex:1}}>{o.label}</span>
                  {sel&&<span style={{fontSize:11,color:o.color||"#f59e0b",fontWeight:800}}>✓</span>}
                </button>
              );
            })}
          </div>

          {/* 新規追加 */}
          {allowNew&&(
            <div style={{borderTop:"1px solid #f0ebe4",padding:"7px 8px",display:"flex",gap:5}}>
              <input value={newVal} onChange={e=>setNewVal(e.target.value)}
                onCompositionStart={()=>{composing.current=true;}}
                onCompositionEnd={e=>{composing.current=false;setNewVal(e.target.value);}}
                onKeyDown={e=>{if(!composing.current&&e.key==="Enter"){e.preventDefault();handleAdd();}}}
                placeholder="新規追加…"
                style={{flex:1,border:BD,borderRadius:6,padding:"4px 8px",fontSize:11.5,fontFamily:"inherit",outline:"none",color:"#333",minWidth:0}}
                onFocus={e=>e.target.style.borderColor="#f59e0b"}
                onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
              <button onClick={handleAdd} disabled={!newVal.trim()}
                style={{background:newVal.trim()?"#111":"#e0d8ce",border:"none",borderRadius:6,padding:"4px 9px",fontSize:11,fontWeight:700,color:"#fff",cursor:newVal.trim()?"pointer":"default",flexShrink:0}}>
                追加
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ラベルエディタ
// ════════════════════════════════════════════════════════
// URL コピーボタン（フィードバック付き）
export function CopyBtn({url,size="sm"}){
  const [copied,setCopied]=useState(false);
  const copy=()=>{
    navigator.clipboard.writeText(url).then(()=>{
      setCopied(true);setTimeout(()=>setCopied(false),2000);
    });
  };
  const sm=size==="sm";
  return(
    <button onClick={copy}
      style={{border:"none",background:copied?"#10b981":"#e0f2fe",color:copied?"#fff":"#0369a1",borderRadius:5,padding:sm?"2px 6px":"3px 9px",fontSize:sm?"0.68em":"0.75em",fontWeight:700,cursor:"pointer",flexShrink:0,transition:"all .15s",whiteSpace:"nowrap"}}>
      {copied?"✓":"コピー"}
    </button>
  );
}

export function LabelEditor({labels,onChange}){
  const [input,setInput]=useState("");
  const composing=useRef(false);
  const add=()=>{
    const v=input.trim();
    if(!v||labels.includes(v))return;
    onChange([...labels,v]);
    setInput("");
  };
  return(
    <div style={{...S.col,gap:6}}>
      {labels.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {labels.map((l,i)=>(
            <span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,background:"#f5f0eb",border:BD,borderRadius:99,padding:"2px 8px",fontSize:"0.72em",fontWeight:600,color:"#555"}}>
              {l}
              <button onClick={()=>onChange(labels.filter((_,j)=>j!==i))}
                style={{border:"none",background:"none",color:"#aaa",cursor:"pointer",fontSize:"0.9em",padding:0,lineHeight:1}}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:5}}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          onCompositionStart={()=>{composing.current=true;}}
          onCompositionEnd={()=>{composing.current=false;}}
          onKeyDown={e=>{if(!composing.current&&e.key==="Enter"){e.preventDefault();add();}}}
          placeholder="ラベルを入力 → Enter"
          style={{flex:1,border:BD,borderRadius:7,padding:"5px 9px",fontSize:"0.77em",fontFamily:"inherit",color:"#333",outline:"none",boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor="#f59e0b"}
          onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
        <button onClick={add} disabled={!input.trim()}
          style={{background:input.trim()?"#555":"#e0d8ce",border:"none",borderRadius:7,padding:"5px 9px",fontSize:"0.77em",fontWeight:700,color:"#fff",cursor:input.trim()?"pointer":"default"}}>
          追加
        </button>
      </div>
    </div>
  );
}

// メモ欄の入力欄（Notion と同じ手つきの箇条書き）。MemoEditor と PreviewOverlay の両方で使う
export const MEMO_PLACEHOLDER="Tab で下げる・Shift+Tab で上げる・Enter で続ける";
export function MemoTextarea({value,onChange,onPasteUrl,textareaRef,autoFocus=false,style}){
  const innerRef=useRef(null);
  const ref=textareaRef||innerRef;
  const composing=useRef(false);
  const pendingSel=useRef(null);
  const text=value||"";

  // 中身に合わせて伸ばす（最小 8 行・最大は画面の高さの 6 割）
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    const lh=parseFloat(getComputedStyle(el).lineHeight)||20;
    const pad=parseFloat(getComputedStyle(el).paddingTop)+parseFloat(getComputedStyle(el).paddingBottom)+2;
    const min=lh*8+pad, max=window.innerHeight*0.6;
    el.style.height="auto";
    const h=Math.max(min,Math.min(el.scrollHeight+2,max));
    el.style.height=h+"px";
    el.style.overflowY=el.scrollHeight+2>max?"auto":"hidden";
    if(pendingSel.current){const {start,end}=pendingSel.current;pendingSel.current=null;el.setSelectionRange(start,end);}
  },[text]);

  useEffect(()=>{
    if(!autoFocus)return;
    const el=ref.current;if(!el)return;
    const t=setTimeout(()=>{el.focus();const n=el.value.length;el.setSelectionRange(n,n);},0);
    return()=>clearTimeout(t);
  },[autoFocus]);

  const apply=r=>{
    if(!r)return false;
    pendingSel.current={start:r.start,end:r.end};
    if(r.text===text){const el=ref.current;if(el){el.setSelectionRange(r.start,r.end);}pendingSel.current=null;}
    else onChange(r.text);
    return true;
  };

  return(
    <textarea ref={ref} value={text} rows={8}
      onChange={e=>onChange(e.target.value)}
      onCompositionStart={()=>{composing.current=true;}}
      onCompositionEnd={()=>{composing.current=false;}}
      onKeyDown={e=>{
        if(isComposingKey(e,composing))return;
        const el=e.currentTarget;
        const s=el.selectionStart,en=el.selectionEnd;
        if(e.key==="Tab"){
          e.preventDefault();
          apply(indentLines(text,s,en,e.shiftKey));
          return;
        }
        if(e.key==="Enter"&&!e.shiftKey&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
          const r=handleEnter(text,s,en);
          if(r){e.preventDefault();apply(r);}
          return;
        }
        if(e.key==="Backspace"&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
          const r=handleBackspace(text,s,en);
          if(r){e.preventDefault();apply(r);}
        }
      }}
      onPaste={e=>{
        const raw=e.clipboardData?.getData("text/plain")||"";
        // URL だけの 1 行は本文に入れず、メモのリンクの一覧へ回す
        const one=raw.trim();
        if(onPasteUrl&&one&&!/\s/.test(one)&&isUrl(one)){e.preventDefault();onPasteUrl(one);return;}
        const el=e.currentTarget;
        const r=handlePaste(text,el.selectionStart,el.selectionEnd,raw);
        if(r){e.preventDefault();apply(r);}
      }}
      placeholder={MEMO_PLACEHOLDER}
      style={{width:"100%",background:"#fff",border:BD,borderRadius:8,padding:"8px 10px",color:"#1a1a1a",fontSize:"0.8em",outline:"none",boxSizing:"border-box",fontFamily:"inherit",resize:"none",lineHeight:1.7,...style}}
      onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
  );
}

export function MemoEditor({memo,memoLinks,onChange,autoFocus=false,textareaRef:outerRef}){
  const [linkInput,setLinkInput]=useState("");
  const [labelInput,setLabelInput]=useState("");
  const ownRef=useRef(null);
  const textareaRef=outerRef||ownRef;
  const composing=useRef(false);
  const links=(memoLinks||[]).map(l=>typeof l==="string"?{label:"",url:l}:l);

  const addLink=()=>{
    const url=linkInput.trim();
    if(!isUrl(url))return;
    onChange({memo,memoLinks:[...links,{label:labelInput.trim(),url}]});
    setLinkInput("");setLabelInput("");
  };

  const insertBullet=()=>{
    const el=textareaRef.current;if(!el)return;
    const r=insertBulletText(memo||"",el.selectionStart,el.selectionEnd);
    onChange({memo:r.text,memoLinks:links});
    setTimeout(()=>{el.focus();el.setSelectionRange(r.start,r.end);},0);
  };

  return(
    <div style={{...S.col,gap:7}}>
      <div style={{...S.rowB,marginBottom:2}}>
        <span style={{fontSize:"0.7em",fontWeight:700,color:"#888"}}>メモ</span>
        <button onClick={insertBullet}
          style={{border:BD,background:"#fff",borderRadius:5,padding:"2px 7px",fontSize:"0.68em",fontWeight:700,color:"#555",cursor:"pointer"}}>
          ・ 箇条書き
        </button>
      </div>
      <MemoTextarea value={memo} textareaRef={textareaRef} autoFocus={autoFocus}
        onChange={v=>onChange({memo:v,memoLinks:links})}
        onPasteUrl={url=>{if(!links.some(l=>l.url===url))onChange({memo,memoLinks:[...links,{label:"",url}]});}}/>
      {links.length>0&&(
        <div style={{...S.col,gap:3,maxHeight:180,overflowY:"auto"}}>
          {links.map((l,i)=>(
            <div key={i} style={{...S.row,gap:6,background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:7,padding:"5px 8px"}}>
              <span style={{fontSize:"0.7em",flexShrink:0}}>🔗</span>
              <div style={{flex:1,minWidth:0}}>
                {l.label&&<div style={{fontSize:"0.7em",fontWeight:700,color:"#0369a1",marginBottom:1}}>{l.label}</div>}
                <a href={l.url} target="_blank" rel="noreferrer" style={{fontSize:"0.7em",color:"#0369a1",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{l.url}</a>
              </div>
              <CopyBtn url={l.url}/>
              <button onClick={()=>onChange({memo,memoLinks:links.filter((_,j)=>j!==i)})} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:"0.8em",flexShrink:0}}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{...S.col,gap:4}}>
        <input value={labelInput} onChange={e=>setLabelInput(e.target.value)}
          placeholder="ラベル（任意）"
          style={{width:"100%",border:BD,borderRadius:8,padding:"5px 10px",fontSize:"0.77em",fontFamily:"inherit",color:"#1a1a1a",outline:"none",boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
        <div style={{display:"flex",gap:4}}>
          <input value={linkInput} onChange={e=>setLinkInput(e.target.value)}
            placeholder="URLをペースト → 追加"
            onKeyDown={e=>{if(!composing.current&&e.key==="Enter")addLink();}}
            onPaste={e=>{const v=e.clipboardData.getData("text").trim();if(isUrl(v)){e.preventDefault();setLinkInput(v);}}}
            style={{flex:1,border:BD,borderRadius:8,padding:"5px 10px",fontSize:"0.77em",fontFamily:"inherit",color:"#1a1a1a",outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
          <button onClick={addLink} disabled={!isUrl(linkInput.trim())}
            style={{background:isUrl(linkInput.trim())?"#0369a1":"#e0d8ce",border:"none",borderRadius:8,padding:"5px 10px",fontSize:"0.77em",fontWeight:700,color:"#fff",cursor:isUrl(linkInput.trim())?"pointer":"default",whiteSpace:"nowrap",transition:"background .15s"}}>
            ＋追加
          </button>
        </div>
      </div>
    </div>
  );
}


export function Btn({children,onClick,primary,danger,style}){
  const base={border:"1px solid",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .12s",fontFamily:"inherit"};
  const t=primary
    ?{background:"#f59e0b",borderColor:"#f59e0b",color:"#fff"}
    :danger
    ?{background:"#fff",borderColor:"#fca5a5",color:"#ef4444"}
    :{background:"#fff",borderColor:"#e6dfd6",color:"#555"};
  return<button onClick={onClick} style={{...base,...t,...style}}
    onMouseEnter={e=>e.currentTarget.style.opacity=".78"}
    onMouseLeave={e=>e.currentTarget.style.opacity="1"}>{children}</button>;
}
