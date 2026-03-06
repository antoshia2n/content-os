import React, { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";

// ── 定数 ──────────────────────────────────────────────
const POST_TYPE = {
  x_post:    { label:"Xポスト",  color:"#1d9bf0", bg:"#e8f5fe", border:"#93d3fc", dot:"#1d9bf0" },
  x_quote:   { label:"X引用",   color:"#0ea5e9", bg:"#e0f2fe", border:"#7dd3fc", dot:"#0ea5e9" },
  x_article: { label:"X記事",   color:"#2563eb", bg:"#dbeafe", border:"#93c5fd", dot:"#2563eb" },
  note:      { label:"note",   color:"#41c9b4", bg:"#d1faf5", border:"#6ee7da", dot:"#41c9b4" },
  membership:{ label:"メンシプ", color:"#8b5cf6", bg:"#ede9fe", border:"#c4b5fd", dot:"#8b5cf6" },
  paid:      { label:"有料",    color:"#f59e0b", bg:"#fef3c7", border:"#fcd34d", dot:"#f59e0b" },
  other:     { label:"その他",  color:"#6b7280", bg:"#f3f4f6", border:"#d1d5db", dot:"#9ca3af" },
};
const STATUS = {
  draft:     { label:"下書き",      chip:"#f3f4f6", text:"#6b7280", border:"#d1d5db" },
  review:    { label:"レビュー待ち", chip:"#fef3c7", text:"#d97706", border:"#fcd34d" },
  waiting:   { label:"予約待ち",    chip:"#dbeafe", text:"#2563eb", border:"#93c5fd" },
  reserved:  { label:"予約済み",    chip:"#ede9fe", text:"#7c3aed", border:"#c4b5fd" },
  published: { label:"公開済",      chip:"#d1fae5", text:"#059669", border:"#6ee7b7" },
  popular:   { label:"好評",        chip:"#ffedd5", text:"#ea580c", border:"#fdba74" },
  flop:      { label:"不評",        chip:"#fee2e2", text:"#dc2626", border:"#fca5a5" },
};
const DAYS   = ["月","火","水","木","金","土","日"];
const HOURS  = Array.from({length:24},(_,i)=>i);
const COLORS = ["#f59e0b","#3b82f6","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
const XFONT  = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function fmtDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function fmtTime(s){return s?s.slice(11,16):"";}
function genId(){return typeof crypto!=="undefined"&&crypto.randomUUID?parseInt(crypto.randomUUID().replace(/-/g,"").slice(0,15),16):Date.now()+Math.floor(Math.random()*10000);}
function nowStr(){return new Date().toISOString();}
function stripHtml(h){return (h||"").replace(/<[^>]+>/g,"");}
function isUrl(s){try{new URL(s);return s.startsWith("http");}catch{return false;}}
function nextDaySameTime(dt){
  const d=new Date(dt.length===16?dt+":00":dt);
  d.setDate(d.getDate()+1);
  return fmtDate(d)+"T"+dt.slice(11,16);
}
function getWeekDates(base){
  const d=new Date(base),day=d.getDay(),mon=new Date(d);
  mon.setDate(d.getDate()+(day===0?-6:1-day));
  return Array.from({length:7},(_,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return x;});
}
function getUrlParams(){
  if(typeof window==="undefined")return{isClient:false,accountId:null};
  const p=new URLSearchParams(window.location.search);
  const accId=p.get("account");
  return{isClient:!!accId,accountId:accId};
}

// ════════════════════════════════════════════════════════
// WYSIWYG
// ════════════════════════════════════════════════════════
function BodyEditor({value,onChange,editorRef}){
  const isComposing=useRef(false),internal=useRef(false);
  useEffect(()=>{
    if(!editorRef.current||internal.current){internal.current=false;return;}
    if(editorRef.current.innerHTML!==(value||""))editorRef.current.innerHTML=value||"";
  },[value]);
  const emit=()=>{if(!editorRef.current)return;internal.current=true;onChange(editorRef.current.innerHTML);};

  // ブラウザがdivでなくpタグで段落を生成するよう強制
  useEffect(()=>{
    document.execCommand("defaultParagraphSeparator",false,"p");
  },[]);

  const handleKeyDown=e=>{
    if(e.isComposing||isComposing.current)return;
    if(e.key!=="Enter")return;
    e.preventDefault();
    if(e.shiftKey){
      // Shift+Enter: 同形式内で改行（br挿入）
      document.execCommand("insertLineBreak");
    } else {
      // Enter: 新段落 + 形式をpにリセット
      document.execCommand("insertParagraph");
      const sel=window.getSelection();
      if(sel&&sel.rangeCount>0){
        const node=sel.getRangeAt(0).commonAncestorContainer;
        const block=node.nodeType===3?node.parentElement:node;
        const tag=block?.closest("h1,h2,blockquote")?.tagName?.toLowerCase();
        if(tag)document.execCommand("formatBlock",false,"p");
      }
    }
    emit();
  };

  return(
    <div ref={editorRef} contentEditable suppressContentEditableWarning
      className="xb" data-ph="本文を入力…"
      onCompositionStart={()=>{isComposing.current=true;}}
      onCompositionEnd={()=>{isComposing.current=false;emit();}}
      onInput={()=>{if(!isComposing.current)emit();}}
      onPaste={e=>{e.preventDefault();document.execCommand("insertText",false,e.clipboardData.getData("text/plain"));}}
      onKeyDown={handleKeyDown}
      style={{minHeight:360,fontSize:17,lineHeight:1.75,color:"#0f1419",fontFamily:XFONT,wordBreak:"break-word",caretColor:"#1d9bf0",outline:"none"}}
    />
  );
}

function Toolbar({onInsertOpen}){
  const exec=React.useCallback((cmd,val)=>document.execCommand(cmd,false,val??null),[]);
  // アクティブ状態トラッキング
  const [fmt,setFmt]=useState({bold:false,italic:false,strike:false,block:"p"});
  useEffect(()=>{
    const update=()=>{
      try{
        const sel=window.getSelection();
        if(!sel||sel.rangeCount===0)return;
        const node=sel.getRangeAt(0).commonAncestorContainer;
        const el=node.nodeType===3?node.parentElement:node;
        const block=el?.closest("h1,h2,blockquote,p,li")||el;
        setFmt({
          bold:document.queryCommandState("bold"),
          italic:document.queryCommandState("italic"),
          strike:document.queryCommandState("strikeThrough"),
          block:block?.tagName?.toLowerCase()||"p",
        });
      }catch(e){}
    };
    document.addEventListener("selectionchange",update);
    return()=>document.removeEventListener("selectionchange",update);
  },[]);

  const B=({title,onClick,active,ch})=>(
    <button title={title} onMouseDown={e=>{e.preventDefault();onClick();}}
      style={{border:active?"1.5px solid #1d9bf0":"1px solid transparent",background:active?"#e8f5fe":"none",color:active?"#1d9bf0":"#536471",borderRadius:5,padding:"4px 6px",cursor:"pointer",fontSize:"0.82em",fontWeight:active?800:600,display:"flex",alignItems:"center",justifyContent:"center",height:28,minWidth:26,fontFamily:"inherit",transition:"all .1s"}}
      onMouseEnter={e=>{if(!active){e.currentTarget.style.background="#eff3f4";e.currentTarget.style.color="#0f1419";}}}
      onMouseLeave={e=>{if(!active){e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";}}}>
      {ch}
    </button>
  );
  const Sp=()=><div style={{width:1,height:16,background:"#e8e0d6",margin:"0 2px"}}/>;

  // ブロックラベル
  const blockLabels={"p":"本文","h1":"見出し","h2":"小見出し","blockquote":"引用","li":"リスト"};
  const blockLabel=blockLabels[fmt.block]||"本文";

  return(
    <div style={{display:"flex",alignItems:"center",gap:1,padding:"5px 14px",borderBottom:"1px solid #e8e0d6",background:"#fff",flexWrap:"wrap",flexShrink:0}}>
      {/* 形式セレクト（現在の形式を表示） */}
      <select value={["p","h1","h2","blockquote"].includes(fmt.block)?fmt.block:"p"}
        onChange={e=>{exec("formatBlock",e.target.value);}}
        style={{border:"1px solid #e8e0d6",borderRadius:5,padding:"2px 7px",fontSize:"0.77em",color:"#1a1a1a",background:"#fff",cursor:"pointer",fontFamily:"inherit",height:28,fontWeight:600}}>
        <option value="p">本文</option>
        <option value="h1">見出し</option>
        <option value="h2">小見出し</option>
        <option value="blockquote">引用</option>
      </select>
      <Sp/>
      <B title="太字 (Ctrl+B)" onClick={()=>exec("bold")} active={fmt.bold} ch={<strong>B</strong>}/>
      <B title="斜体 (Ctrl+I)" onClick={()=>exec("italic")} active={fmt.italic} ch={<em>I</em>}/>
      <B title="取り消し線" onClick={()=>exec("strikeThrough")} active={fmt.strike} ch={<s>S</s>}/>
      <Sp/>
      <B title="箇条書き" onClick={()=>exec("insertUnorderedList")} active={fmt.block==="li"} ch={
        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="1.5" cy="3" r="1.5"/><rect x="4" y="2" width="10" height="2" rx="1"/>
          <circle cx="1.5" cy="7" r="1.5"/><rect x="4" y="6" width="10" height="2" rx="1"/>
          <circle cx="1.5" cy="11" r="1.5"/><rect x="4" y="10" width="10" height="2" rx="1"/>
        </svg>}/>
      <B title="番号リスト" onClick={()=>exec("insertOrderedList")} active={false} ch="1≡"/>
      <Sp/>
      <B title="リンク" onClick={()=>{const u=prompt("URL:");if(u)exec("createLink",u);}} active={false} ch="🔗"/>
      <B title="区切り線" onClick={()=>exec("insertHorizontalRule")} active={false} ch="—"/>
      <button onMouseDown={e=>e.preventDefault()} onClick={onInsertOpen}
        style={{border:"1px solid #e8e0d6",background:"none",color:"#536471",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:"0.73em",fontWeight:600,height:28,display:"flex",alignItems:"center",gap:2,fontFamily:"inherit",marginLeft:3}}
        onMouseEnter={e=>{e.currentTarget.style.background="#eff3f4";e.currentTarget.style.color="#0f1419";}}
        onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";}}>
        ＋挿入
      </button>
      <B title="書式クリア" onClick={()=>exec("removeFormat")} active={false} ch="✕"/>
      {/* 現在の形式バッジ */}
      <div style={{marginLeft:6,fontSize:"0.68em",color:"#1d9bf0",background:"#e8f5fe",border:"1px solid #93d3fc",borderRadius:10,padding:"1px 7px",fontWeight:700}}>{blockLabel}</div>
      <div style={{marginLeft:"auto",fontSize:"0.6em",color:"#bbb"}}>Enter=新段落　⇧Enter=同形式改行</div>
    </div>
  );
}

function InsertModal({onClose,savedRange,bodyRef}){
  const [tab,setTab]=useState("image"),[url,setUrl]=useState("");
  const fileRef=useRef(null);
  const insertAt=html=>{
    bodyRef.current?.focus();
    const sel=window.getSelection();
    if(savedRange){sel.removeAllRanges();sel.addRange(savedRange);}
    document.execCommand("insertHTML",false,html);
  };
  const handleImage=e=>{
    const file=e.target.files?.[0];if(!file)return;
    const r=new FileReader();
    r.onload=ev=>{insertAt(`<p><img src="${ev.target.result}" alt="${file.name}" style="max-width:100%;border-radius:8px;display:block;"/></p>`);onClose();};
    r.readAsDataURL(file);
  };
  const handlePost=()=>{
    if(!url.trim())return;
    const isNote=/note\.com/.test(url);
    const icon=isNote?"📄":"𝕏";
    insertAt(`<div style="border:1.5px solid #e8e0d6;border-radius:10px;padding:10px 14px;margin:.6em 0;background:#f7f9f9;display:flex;align-items:center;gap:10px;" contenteditable="false"><span>${icon}</span><a href="${url}" target="_blank" style="color:#1d9bf0;text-decoration:none;font-size:13px;word-break:break-all;">${url}</a></div><p><br></p>`);
    onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",border:"1.5px solid #e8e0d6",borderRadius:14,width:"100%",maxWidth:360,overflow:"hidden",boxShadow:"0 20px 60px #00000025"}}>
        <div style={{display:"flex",borderBottom:"1px solid #e8e0d6"}}>
          {[["image","🖼 画像"],["post","リンク挿入"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,border:"none",background:"none",padding:"11px 0",fontWeight:tab===t?700:500,color:tab===t?"#f59e0b":"#999",borderBottom:tab===t?"2px solid #f59e0b":"2px solid transparent",cursor:"pointer",fontSize:"0.82em",fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>
        <div style={{padding:"14px 16px 8px"}}>
          {tab==="image"&&(<><input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImage}/>
            <button onClick={()=>fileRef.current?.click()} style={{width:"100%",border:"2px dashed #e8e0d6",background:"#f7f9f9",borderRadius:9,padding:"24px 0",cursor:"pointer",color:"#aaa",fontSize:"0.83em",fontWeight:600,fontFamily:"inherit"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#e8e0d6";e.currentTarget.style.color="#aaa";}}>📁 クリックして画像を選択</button></>)}
          {tab==="post"&&(<><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."
            style={{width:"100%",border:"1.5px solid #e8e0d6",borderRadius:8,padding:"9px 11px",fontSize:"0.82em",fontFamily:"inherit",color:"#1a1a1a",marginBottom:10,outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e8e0d6"}
            onKeyDown={e=>{if(e.key==="Enter")handlePost();}}/>
          <button onClick={handlePost} disabled={!url.trim()} style={{width:"100%",background:url.trim()?"#f59e0b":"#eff3f4",color:url.trim()?"#fff":"#aaa",border:"none",borderRadius:20,padding:"9px 0",fontWeight:700,fontSize:"0.82em",cursor:url.trim()?"pointer":"default",fontFamily:"inherit"}}>挿入</button></>)}
        </div>
        <div style={{padding:"8px 16px 14px"}}><button onClick={onClose} style={{width:"100%",border:"1px solid #e8e0d6",background:"none",color:"#536471",borderRadius:7,padding:"7px",fontWeight:500,fontSize:"0.8em",cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button></div>
      </div>
    </div>
  );
}

// ── copy helpers ──
// HTMLを読みやすいプレーンテキストに変換
function htmlToPlain(html){
  const div=document.createElement("div");
  div.innerHTML=html;
  function walk(node){
    if(node.nodeType===3)return node.textContent;
    const tag=node.tagName?.toLowerCase();
    const children=Array.from(node.childNodes).map(walk).join("");
    if(tag==="br")return "\n";
    if(tag==="p")return children+"\n\n";
    if(tag==="h1"||tag==="h2")return children+"\n\n";
    if(tag==="blockquote")return children.split("\n").map(l=>"　"+l).join("\n")+"\n\n";
    if(tag==="li")return "・"+children+"\n";
    if(tag==="ul"||tag==="ol")return children+"\n";
    if(tag==="hr")return "───────────\n\n";
    if(tag==="div"&&node.getAttribute("contenteditable")==="false")return "[リンク]\n";
    return children;
  }
  return walk(div).replace(/\n{3,}/g,"\n\n").trim();
}
function copyRichText(html,_plain,onDone){
  const plain=htmlToPlain(html);
  try{navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([html],{type:"text/html"}),"text/plain":new Blob([plain],{type:"text/plain"})})]).then(onDone).catch(()=>fallbackCopy(plain,onDone));}
  catch(e){fallbackCopy(plain,onDone);}
}
function fallbackCopy(plain,onDone){
  const ta=document.createElement("textarea");ta.value=plain;ta.style.cssText="position:fixed;left:-9999px;top:0";
  document.body.appendChild(ta);ta.select();
  try{document.execCommand("copy");}catch(e){}document.body.removeChild(ta);onDone?.();
}

// ════════════════════════════════════════════════════════
// 概要メモ（リンク対応）
// ════════════════════════════════════════════════════════
function MemoEditor({memo,memoLinks,onChange}){
  const [linkInput,setLinkInput]=useState("");
  return(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      <textarea value={memo} onChange={e=>onChange({memo:e.target.value,memoLinks})} placeholder="執筆の意図・注意点など" rows={5}
        style={{width:"100%",background:"#fff",border:"1.5px solid #e0d8ce",borderRadius:8,padding:"8px 10px",color:"#1a1a1a",fontSize:"0.8em",outline:"none",boxSizing:"border-box",fontFamily:"inherit",resize:"vertical",lineHeight:1.7}}
        onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
      {(memoLinks||[]).length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {memoLinks.map((l,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:7,padding:"5px 8px"}}>
              <span style={{fontSize:"0.7em"}}>🔗</span>
              <a href={l} target="_blank" rel="noreferrer" style={{flex:1,fontSize:"0.73em",color:"#0369a1",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l}</a>
              <button onClick={()=>onChange({memo,memoLinks:memoLinks.filter((_,j)=>j!==i)})} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:"0.8em"}}>×</button>
            </div>
          ))}
        </div>
      )}
      <input value={linkInput} onChange={e=>setLinkInput(e.target.value)}
        placeholder="URLをペースト → Enter で追加"
        onKeyDown={e=>{
          if(e.key==="Enter"&&!e.isComposing){
            const v=linkInput.trim();
            if(isUrl(v)){onChange({memo,memoLinks:[...(memoLinks||[]),v]});setLinkInput("");}
          }
        }}
        onPaste={e=>{
          const v=e.clipboardData.getData("text").trim();
          if(isUrl(v)){e.preventDefault();onChange({memo,memoLinks:[...(memoLinks||[]),v]});setLinkInput("");}
        }}
        style={{width:"100%",border:"1.5px solid #e0d8ce",borderRadius:8,padding:"6px 10px",fontSize:"0.77em",fontFamily:"inherit",color:"#1a1a1a",outline:"none",boxSizing:"border-box"}}
        onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// 再投稿モーダル
// ════════════════════════════════════════════════════════
function RepostModal({post,onClose,onRepost}){
  const today=fmtDate(new Date());
  const [dt,setDt]=useState(`${today}T09:00`);
  const [repeat,setRepeat]=useState("none");
  const REPEATS=[["none","繰り返しなし"],["weekly","毎週"],["biweekly","隔週"],["monthly","毎月"],["bimonthly","2ヶ月ごと"],["quarterly","3ヶ月ごと"]];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:380,padding:24,boxShadow:"0 20px 60px #00000025"}}>
        <div style={{fontWeight:800,fontSize:"1.05em",color:"#0f1419",marginBottom:4}}>🔁 再投稿</div>
        <div style={{fontSize:"0.8em",color:"#536471",marginBottom:18,lineHeight:1.5}}>「{post.title||"（タイトルなし）"}」を再投稿します</div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:"0.73em",fontWeight:700,color:"#888",display:"block",marginBottom:4}}>投稿日時</label>
          <input type="datetime-local" value={dt} onChange={e=>setDt(e.target.value)}
            style={{width:"100%",border:"1.5px solid #e0d8ce",borderRadius:8,padding:"8px 10px",fontSize:"0.84em",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{fontSize:"0.73em",fontWeight:700,color:"#888",display:"block",marginBottom:6}}>定期繰り返し</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
            {REPEATS.map(([v,l])=>(
              <button key={v} onClick={()=>setRepeat(v)}
                style={{border:`1.5px solid ${repeat===v?"#f59e0b":"#e0d8ce"}`,background:repeat===v?"#fef3c7":"#fff",color:repeat===v?"#d97706":"#888",borderRadius:8,padding:"7px 0",fontSize:"0.73em",fontWeight:repeat===v?700:400,cursor:"pointer",fontFamily:"inherit"}}>
                {l}
              </button>
            ))}
          </div>
          {repeat!=="none"&&<div style={{marginTop:8,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:7,padding:"7px 10px",fontSize:"0.73em",color:"#92400e"}}>{REPEATS.find(([v])=>v===repeat)?.[1]}に自動作成されます</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onRepost(dt,repeat)} style={{flex:1,background:"#f59e0b",border:"none",borderRadius:20,padding:"10px 0",fontWeight:800,fontSize:"0.85em",color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>再投稿を作成</button>
          <button onClick={onClose} style={{border:"1.5px solid #e0d8ce",background:"none",borderRadius:20,padding:"10px 14px",fontWeight:600,fontSize:"0.85em",color:"#888",cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// 検索モーダル
// ════════════════════════════════════════════════════════
function SearchModal({posts,onClose,onSelect,onRepost}){
  const [q,setQ]=useState(""),[pt,setPt]=useState("all");
  const inputRef=useRef(null);
  useEffect(()=>{inputRef.current?.focus();},[]);
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);
  const results=posts.filter(p=>{
    const mq=!q||p.title.includes(q)||stripHtml(p.body).includes(q)||(p.memo||"").includes(q);
    const mp=pt==="all"||(p.postType||"x_post")===pt;
    return mq&&mp;
  }).sort((a,b)=>b.datetime.localeCompare(a.datetime));
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:700,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"56px 20px 20px"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"72vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000030"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #e8e0d6",display:"flex",gap:8,alignItems:"center"}}>
          <span style={{color:"#aaa"}}>🔍</span>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="タイトル・本文・メモで検索…"
            style={{flex:1,border:"none",outline:"none",fontSize:"0.95em",fontFamily:"inherit",color:"#0f1419"}}/>
          {q&&<button onClick={()=>setQ("")} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer"}}>×</button>}
          <select value={pt} onChange={e=>setPt(e.target.value)}
            style={{border:"1px solid #e0d8ce",borderRadius:8,padding:"4px 8px",fontSize:"0.76em",fontFamily:"inherit",outline:"none",color:"#555"}}>
            <option value="all">全種類</option>
            {Object.entries(POST_TYPE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {results.length===0?<div style={{padding:"40px 0",textAlign:"center",color:"#ccc",fontSize:"0.85em"}}>該当なし</div>
          :results.map(p=>{
            const pt2=POST_TYPE[p.postType||"x_post"],st=STATUS[p.status];
            return(
              <div key={p.id} style={{padding:"11px 16px",borderBottom:"1px solid #f3f4f6",display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background="#f7f9f9"}
                onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                <span style={{width:8,height:8,borderRadius:"50%",background:pt2.dot,flexShrink:0,marginTop:5}}/>
                <div style={{flex:1}} onClick={()=>onSelect(p)}>
                  <div style={{fontWeight:700,fontSize:"0.88em",color:"#0f1419",marginBottom:2}}>{p.title||"（タイトルなし）"}</div>
                  <div style={{fontSize:"0.75em",color:"#8b98a5",lineHeight:1.4,marginBottom:3}}>{stripHtml(p.body).slice(0,55)}…</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    <span style={{fontSize:"0.69em",color:pt2.color,fontWeight:600,background:pt2.bg,border:`1px solid ${pt2.border}`,padding:"0 6px",borderRadius:10}}>{pt2.label}</span>
                    {st&&<span style={{fontSize:"0.69em",color:st.text,background:st.chip,border:`1px solid ${st.border}`,padding:"0 6px",borderRadius:10,fontWeight:600}}>{st.label}</span>}
                    <span style={{fontSize:"0.68em",color:"#aaa"}}>{p.datetime.slice(0,10)}</span>
                  </div>
                </div>
                <button onClick={()=>onRepost(p)}
                  style={{border:"1px solid #e0d8ce",background:"none",color:"#536471",borderRadius:7,padding:"4px 9px",fontSize:"0.71em",fontWeight:600,cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="#f59e0b";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";e.currentTarget.style.borderColor="#e0d8ce";}}>
                  🔁再投稿
                </button>
              </div>
            );
          })}
        </div>
        <div style={{padding:"9px 16px",borderTop:"1px solid #e8e0d6",fontSize:"0.72em",color:"#aaa",display:"flex",justifyContent:"space-between"}}>
          <span>{results.length}件</span>
          <button onClick={onClose} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer",fontFamily:"inherit"}}>閉じる (Esc)</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// エディタモーダル
// ════════════════════════════════════════════════════════
function EditorModal({post,onSave,onClose}){
  const [draft,setDraft]=useState({...post,memoLinks:post.memoLinks||[],history:post.history||[]});
  const [copyX,setCopyX]=useState(false),[copyNote,setCopyNote]=useState(false);
  const [notionState,setNotionState]=useState("idle"); // idle | saving | done | error
  const [insertOpen,setInsertOpen]=useState(false),[savedRange,setSavedRange]=useState(null);
  const [sidePanel,setSidePanel]=useState(null);
  const bodyEditorRef=useRef(null),articleAreaRef=useRef(null);

  useEffect(()=>{
    const h=e=>{if(e.key==="Escape"&&!insertOpen)onClose();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[insertOpen]);

  const openInsert=()=>{
    const sel=window.getSelection();
    if(sel?.rangeCount>0){const r=sel.getRangeAt(0);setSavedRange(bodyEditorRef.current?.contains(r.commonAncestorContainer)?r.cloneRange():null);}
    else setSavedRange(null);
    setInsertOpen(true);
  };
  const handleSave=()=>onSave({...draft,history:[...(draft.history||[]),{at:nowStr(),note:"編集・保存"}]});
  const doCopy=target=>{
    const html=draft.body||"",plain=articleAreaRef.current?.innerText||"";
    copyRichText(html,plain,()=>{
      if(target==="x"){setCopyX(true);setTimeout(()=>setCopyX(false),3500);}
      else{setCopyNote(true);setTimeout(()=>setCopyNote(false),3500);}
    });
  };

  const saveToNotion=async()=>{
    setNotionState("saving");
    try{
      const res=await fetch("/api/notion",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          title:draft.title,
          body:draft.body,
          status:draft.status,
          postType:draft.postType,
          datetime:draft.datetime,
          memo:draft.memo,
        }),
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"エラー");
      setNotionState("done");
      setTimeout(()=>setNotionState("idle"),4000);
      // Notion URLを新しいタブで開く
      if(data.url)window.open(data.url,"_blank");
    }catch(e){
      setNotionState("error");
      setTimeout(()=>setNotionState("idle"),4000);
      console.error(e);
    }
  };

  const pt=POST_TYPE[draft.postType]||POST_TYPE.x_post;
  const st=STATUS[draft.status];

  const SideIcon=({id,icon,label})=>{
    const active=sidePanel===id;
    return(
      <button onClick={()=>setSidePanel(active?null:id)} title={label}
        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"10px 0",border:"none",background:active?"#fef3c7":"none",color:active?"#d97706":"#bbb",cursor:"pointer",width:"100%",borderLeft:active?"3px solid #f59e0b":"3px solid transparent",transition:"all .1s",fontFamily:"inherit"}}
        onMouseEnter={e=>{if(!active){e.currentTarget.style.background="#faf7f3";e.currentTarget.style.color="#666";}}}
        onMouseLeave={e=>{if(!active){e.currentTarget.style.background="none";e.currentTarget.style.color="#bbb";}}}>
        <span style={{fontSize:"1.1em"}}>{icon}</span>
        <span style={{fontSize:"0.52em",fontWeight:600}}>{label}</span>
      </button>
    );
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:14}}>
      {insertOpen&&<InsertModal onClose={()=>setInsertOpen(false)} savedRange={savedRange} bodyRef={bodyEditorRef}/>}
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:1100,height:"calc(100vh - 28px)",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px #00000030"}}>

        {/* ヘッダー */}
        <div style={{display:"flex",alignItems:"center",padding:"0 14px",borderBottom:"1px solid #e8e0d6",background:"#fff",height:50,gap:7,flexShrink:0}}>
          <select value={draft.postType} onChange={e=>setDraft(d=>({...d,postType:e.target.value}))}
            style={{border:`1.5px solid ${pt.border}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:pt.color,background:pt.bg,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
            {Object.entries(POST_TYPE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))}
            style={{border:`1.5px solid ${st?.border}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:st?.text,background:st?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="datetime-local" value={draft.datetime} onChange={e=>setDraft(d=>({...d,datetime:e.target.value}))}
            style={{border:"1.5px solid #e0d8ce",borderRadius:8,padding:"4px 8px",fontSize:11,color:"#555",fontFamily:"inherit",outline:"none"}}/>
          <div style={{flex:1}}/>
          <button onClick={saveToNotion} disabled={notionState==="saving"}
            style={{
              background:notionState==="done"?"#00ba7c":notionState==="error"?"#ef4444":notionState==="saving"?"#9ca3af":"#000",
              color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,
              cursor:notionState==="saving"?"default":"pointer",fontFamily:"inherit",whiteSpace:"nowrap",
              transition:"background .2s",display:"flex",alignItems:"center",gap:5,
            }}>
            {notionState==="saving"?"⏳ 保存中…":notionState==="done"?"✅ Notion保存完了":notionState==="error"?"❌ 保存失敗":<>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/></svg>
              Notionに保存
            </>}
          </button>
          <button onClick={()=>doCopy("note")} style={{background:copyNote?"#00ba7c":"#41c9b4",color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"background .2s"}}>{copyNote?"✅ 完了":"note にコピー"}</button>
          <button onClick={()=>doCopy("x")} style={{background:copyX?"#00ba7c":"#1d9bf0",color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"background .2s"}}>{copyX?"✅ 完了":"𝕏 にコピー"}</button>
          <div style={{width:1,height:20,background:"#e8e0d6"}}/>
          <button onClick={handleSave} style={{background:"#f59e0b",border:"none",borderRadius:20,padding:"6px 16px",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>保存</button>
          <button onClick={onClose} style={{background:"none",border:"1.5px solid #e0d8ce",borderRadius:20,padding:"6px 11px",fontSize:12,fontWeight:600,color:"#888",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
        </div>

        {/* 本体 */}
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* 記事エリア */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <Toolbar onInsertOpen={openInsert}/>
            <div style={{flex:1,overflowY:"auto"}}>
              <div ref={articleAreaRef} style={{padding:"28px 32px 100px"}}>
                <input type="text" value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}
                  placeholder="タイトルを入力..."
                  style={{width:"100%",border:"none",outline:"none",fontSize:28,fontWeight:800,lineHeight:1.25,color:"#0f1419",fontFamily:XFONT,marginBottom:18,paddingBottom:18,borderBottom:"1px solid #e8e0d6",background:"transparent",display:"block",boxSizing:"border-box"}}/>
                <BodyEditor value={draft.body} onChange={body=>setDraft(d=>({...d,body}))} editorRef={bodyEditorRef}/>
              </div>
            </div>
            <div style={{padding:"4px 50px",borderTop:"1px solid #e8e0d6",background:"#faf7f3",fontSize:"0.67em",color:"#aaa",flexShrink:0}}>
              {((draft.title||"")+(draft.body||"").replace(/<[^>]+>/g,"")).length.toLocaleString()} 文字
            </div>
          </div>

          {/* アイコン列 */}
          <div style={{width:50,borderLeft:"1px solid #e8e0d6",background:"#fafafa",display:"flex",flexDirection:"column",flexShrink:0}}>
            <SideIcon id="meta" icon="⚙️" label="設定"/>
            <SideIcon id="history" icon="📋" label="履歴"/>
            <SideIcon id="share" icon="🔗" label="共有"/>
          </div>

          {/* サイドパネル展開 */}
          {sidePanel&&(
            <div style={{width:248,borderLeft:"1px solid #e8e0d6",background:"#fafafa",display:"flex",flexDirection:"column",flexShrink:0}}>
              <div style={{padding:"11px 13px 9px",borderBottom:"1px solid #e8e0d6",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff"}}>
                <span style={{fontWeight:700,fontSize:"0.84em",color:"#0f1419"}}>{sidePanel==="meta"?"設定":sidePanel==="history"?"編集履歴":"共有"}</span>
                <button onClick={()=>setSidePanel(null)} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer"}}>✕</button>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:13}}>
                {sidePanel==="meta"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    <div>
                      <label style={{fontSize:"0.7em",fontWeight:700,color:"#888",display:"block",marginBottom:5}}>概要メモ・リンク</label>
                      <MemoEditor memo={draft.memo} memoLinks={draft.memoLinks} onChange={({memo,memoLinks})=>setDraft(d=>({...d,memo,memoLinks}))}/>
                    </div>
                    {(draft.comments||[]).length>0&&(
                      <div>
                        <label style={{fontSize:"0.7em",fontWeight:700,color:"#888",display:"block",marginBottom:5}}>コメント ({draft.comments.length})</label>
                        {draft.comments.map((c,i)=>(
                          <div key={i} style={{background:"#fff",border:"1px solid #e8e0d6",borderRadius:7,padding:"6px 9px",fontSize:"0.77em",color:"#444",lineHeight:1.6,marginBottom:4}}>{typeof c==="string"?c:c.text}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {sidePanel==="history"&&(
                  <div>
                    <div style={{fontSize:"0.71em",color:"#aaa",marginBottom:11,lineHeight:1.5}}>保存のたびに自動記録</div>
                    {[...(draft.history||[])].reverse().map((h,i,arr)=>(
                      <div key={i} style={{display:"flex",gap:9,marginBottom:11}}>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,paddingTop:3}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:i===0?"#f59e0b":"#d1d5db"}}/>
                          {i<arr.length-1&&<div style={{width:1,height:20,background:"#e8e0d6",margin:"3px 0"}}/>}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:"0.77em",fontWeight:i===0?700:400,color:i===0?"#0f1419":"#536471"}}>{h.note}</div>
                          <div style={{fontSize:"0.69em",color:"#aaa",marginTop:1}}>{new Date(h.at).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                        </div>
                      </div>
                    ))}
                    {(draft.history||[]).length===0&&<div style={{fontSize:"0.8em",color:"#ccc",textAlign:"center",paddingTop:16}}>履歴なし</div>}
                  </div>
                )}
                {sidePanel==="share"&&(
                  <div style={{fontSize:"0.8em",color:"#aaa",textAlign:"center",paddingTop:24,lineHeight:1.7}}>
                    共有機能は<br/>準備中です
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// プレビューオーバーレイ
// ════════════════════════════════════════════════════════
function PreviewOverlay({post,onClose,onEdit,onRepost,onDuplicate,onDelete,onSaveComment}){
  const [cmt,setCmt]=useState("");
  const [localComments,setLocalComments]=useState(post.comments||[]);
  const pt=POST_TYPE[post.postType||"x_post"]||POST_TYPE.x_post;
  const st=STATUS[post.status];

  useEffect(()=>{setLocalComments(post.comments||[]);},[post]);
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  const addComment=()=>{
    if(!cmt.trim())return;
    const c={text:cmt.trim(),at:nowStr()};
    const next=[...localComments,c];
    setLocalComments(next);
    onSaveComment(post.id,next);
    setCmt("");
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:820,maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px #00000035"}}>

        {/* ヘッダー */}
        <div style={{padding:"12px 18px",borderBottom:"1px solid #e8e0d6",background:pt.bg,display:"flex",alignItems:"flex-start",gap:10,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:pt.color,fontWeight:700,background:pt.bg,border:`1px solid ${pt.border}`,padding:"1px 8px",borderRadius:10}}>{pt.label}</span>
              {st&&<span style={{fontSize:11,color:st.text,fontWeight:700,background:st.chip,border:`1px solid ${st.border}`,padding:"1px 8px",borderRadius:10}}>{st.label}</span>}
              <span style={{fontSize:11,color:"#888"}}>{post.datetime.replace("T"," ")}</span>
            </div>
            <div style={{fontSize:20,fontWeight:800,color:"#0f1419",lineHeight:1.3}}>{post.title||"（タイトルなし）"}</div>
          </div>
          <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
            <button onClick={()=>onEdit(post)} style={{background:"#f59e0b",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>✏️ 編集</button>
            <button onClick={()=>onDuplicate(post)} style={{background:"none",border:"1.5px solid #e0d8ce",borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:600,color:"#536471",cursor:"pointer",fontFamily:"inherit"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f3f4f6"} onMouseLeave={e=>e.currentTarget.style.background="none"}>📋 複製</button>
            <button onClick={()=>onRepost(post)} style={{background:"none",border:"1.5px solid #e0d8ce",borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:600,color:"#536471",cursor:"pointer",fontFamily:"inherit"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="#f59e0b";}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";e.currentTarget.style.borderColor="#e0d8ce";}}>🔁 再投稿</button>
            <button onClick={()=>onDelete(post)} style={{background:"none",border:"1.5px solid #fca5a5",borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:600,color:"#ef4444",cursor:"pointer",fontFamily:"inherit"}}
              onMouseEnter={e=>e.currentTarget.style.background="#fef2f2"} onMouseLeave={e=>e.currentTarget.style.background="none"}>🗑️ 削除</button>
            <button onClick={onClose} style={{background:"none",border:"1.5px solid #e0d8ce",borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:600,color:"#888",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
          </div>
        </div>

        {/* コンテンツ */}
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* 本文 */}
          <div style={{flex:1,overflowY:"auto",padding:"24px 32px"}}>
            {(post.memoLinks||[]).length>0&&(
              <div style={{marginBottom:14,display:"flex",flexDirection:"column",gap:4}}>
                {post.memoLinks.map((l,i)=>(
                  <a key={i} href={l} target="_blank" rel="noreferrer"
                    style={{display:"flex",alignItems:"center",gap:5,background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:7,padding:"5px 10px",fontSize:"0.78em",color:"#0369a1",textDecoration:"none"}}>
                    <span>🔗</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l}</span>
                  </a>
                ))}
              </div>
            )}
            {post.memo&&<div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",fontSize:"0.8em",color:"#92400e",lineHeight:1.6,marginBottom:16}}>{post.memo}</div>}
            {/* ⚠️ XSS: 信頼済みユーザーのみ。不特定多数が使う場合はDOMPurifyでサニタイズ */}
            <div className="xb" dangerouslySetInnerHTML={{__html:post.body||"<p style='color:#aaa'>本文はまだありません</p>"}}/>
          </div>

          {/* コメント */}
          <div style={{width:260,borderLeft:"1px solid #e8e0d6",display:"flex",flexDirection:"column",flexShrink:0,background:"#fafafa"}}>
            <div style={{padding:"12px 13px 9px",borderBottom:"1px solid #e8e0d6",fontWeight:700,fontSize:"0.8em",color:"#0f1419"}}>コメント ({localComments.length})</div>
            <div style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
              {localComments.length===0&&<div style={{fontSize:"0.78em",color:"#ccc",textAlign:"center",paddingTop:20}}>コメントなし</div>}
              {localComments.map((c,i)=>(
                <div key={i} style={{background:"#fff",border:"1px solid #e8e0d6",borderRadius:8,padding:"7px 10px",marginBottom:7}}>
                  <div style={{fontSize:"0.8em",color:"#444",lineHeight:1.5}}>{typeof c==="string"?c:c.text}</div>
                  {c.at&&<div style={{fontSize:"0.68em",color:"#aaa",marginTop:3}}>{new Date(c.at).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>}
                </div>
              ))}
            </div>
            <div style={{padding:"10px 12px",borderTop:"1px solid #e8e0d6",flexShrink:0}}>
              <div style={{display:"flex",gap:5}}>
                <input value={cmt} onChange={e=>setCmt(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.isComposing)addComment();}}
                  placeholder="コメントを追加…"
                  style={{flex:1,background:"#fff",border:"1.5px solid #e0d8ce",borderRadius:8,padding:"7px 9px",fontSize:"0.78em",outline:"none",fontFamily:"inherit"}}
                  onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
                <button onClick={addComment} style={{background:"#f59e0b",border:"none",borderRadius:8,padding:"7px 10px",fontSize:"0.78em",fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>追加</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// アカウント設定
// ════════════════════════════════════════════════════════
function AccountSettings({accounts,onUpdate,onDelete,onAdd,onCopyLink,onClose}){
  const [editingId,setEditingId]=useState(null),[draft,setDraft]=useState({});
  function startEdit(acc){setEditingId(acc.id);setDraft({name:acc.name,handle:acc.handle,color:acc.color});}
  function commitEdit(){onUpdate(editingId,draft);setEditingId(null);}
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",border:"2px solid #e8e0d6",borderRadius:17,width:"100%",maxWidth:520,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000025"}}>
        <div style={{padding:"15px 20px",borderBottom:"1px solid #e8e0d6",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#faf7f3"}}>
          <div>
            <div style={{fontSize:15,fontWeight:900}}>クライアント管理</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:2}}>名前・カラーを編集できます</div>
          </div>
          <Btn onClick={onClose}>閉じる</Btn>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          {accounts.map(acc=>(
            <div key={acc.id} style={{background:"#faf7f3",border:"1.5px solid #e8e0d6",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
              {editingId===acc.id?(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
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
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:acc.color,display:"inline-block"}}/>
                    <span style={{fontWeight:800,fontSize:14}}>{acc.name}</span>
                    <span style={{fontSize:12,color:"#bbb"}}>{acc.handle}</span>
                  </div>
                  <div style={{background:"#fff",border:"1px solid #e8e0d6",borderRadius:7,padding:"6px 10px",fontSize:11,color:"#bbb",fontFamily:"monospace",marginBottom:10,wordBreak:"break-all"}}>
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

// ════════════════════════════════════════════════════════
// メインアプリ
// ════════════════════════════════════════════════════════
export default function App(){
  const {isClient,accountId:urlAccountId}=getUrlParams();
  const isAdmin=!isClient;

  const [accounts,           setAccounts]          = useState([]);
  const [allPosts,           setAllPosts]           = useState({});
  const [activeAccId,        setActiveAccId]        = useState(urlAccountId||null);
  const [view,               setView]               = useState("calendar");
  const [week,               setWeek]               = useState(new Date());
  const [preview,            setPreview]            = useState(null);
  const [editing,            setEditing]            = useState(null);
  const [filterStatus,       setFilter]             = useState("all");
  const [showShare,          setShowShare]          = useState(false);
  const [showAccountSettings,setShowAccountSettings]= useState(false);
  const [toast,              setToast]              = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [showSearch,         setShowSearch]         = useState(false);
  const [repostTgt,          setRepostTgt]          = useState(null);
  const [deleteConfirm,      setDeleteConfirm]      = useState(null);

  const today    =React.useMemo(()=>fmtDate(new Date()),[]);
  const weekDates=getWeekDates(week);
  const activeAcc=accounts.find(a=>a.id===activeAccId);
  const posts    =allPosts[activeAccId]||[];
  const filtered =filterStatus==="all"?posts:posts.filter(p=>p.status===filterStatus);

  // ── ロード ──
  useEffect(()=>{
    async function load(){
      setLoading(true);
      const{data:accs}=await supabase.from("accounts").select("*").order("created_at");
      if(accs&&accs.length>0){
        setAccounts(accs);
        const firstId=urlAccountId||accs[0].id;
        setActiveAccId(firstId);
        const targetIds=isClient?[firstId]:accs.map(a=>a.id);
        const{data:ps}=await supabase.from("posts").select("*").in("account_id",targetIds);
        if(ps){
          const grouped={};
          ps.forEach(p=>{
            if(!grouped[p.account_id])grouped[p.account_id]=[];
            grouped[p.account_id].push(dbToPost(p));
          });
          setAllPosts(grouped);
        }
      }
      setLoading(false);
    }
    load();
  },[]);

  function dbToPost(p){
    return{...p,
      postType:p.post_type||"x_post",
      comments:p.comments||[],
      body:p.body||"",
      memo:p.memo||"",
      memoLinks:p.memo_links||[],
      history:p.history||[],
    };
  }

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(null),2500);}

  // ── DB保存（内部共通） ──
  async function saveToDb(p){
    const record={
      id:p.id,account_id:activeAccId,
      title:p.title,status:p.status,
      post_type:p.postType||"x_post",
      datetime:p.datetime,
      body:p.body||"",
      memo:p.memo||"",
      memo_links:p.memoLinks||[],
      comments:p.comments||[],
      history:p.history||[],
    };
    const{error}=await supabase.from("posts").upsert(record);
    if(error){showToast("保存に失敗しました");return false;}
    setAllPosts(prev=>{
      const cur=prev[activeAccId]||[];
      const exists=cur.find(x=>x.id===p.id);
      return{...prev,[activeAccId]:exists?cur.map(x=>x.id===p.id?p:x):[...cur,p]};
    });
    return true;
  }

  // ── エディタ保存（保存→エディタ閉じる→プレビュー表示） ──
  async function save(p){
    const ok=await saveToDb(p);
    if(!ok)return;
    setEditing(null);setPreview(p);
    showToast("保存しました ✅");
  }

  // ── 削除 ──
  async function del(id){
    const{error}=await supabase.from("posts").delete().eq("id",id);
    if(error){showToast("削除に失敗しました");return;}
    setAllPosts(prev=>({...prev,[activeAccId]:(prev[activeAccId]||[]).filter(p=>p.id!==id)}));
    setPreview(null);setDeleteConfirm(null);
    showToast("削除しました 🗑️");
  }

  // ── ステータス変更 ──
  async function changeStatus(id,s){
    const{error}=await supabase.from("posts").update({status:s}).eq("id",id);
    if(error){showToast("更新に失敗しました");return;}
    setAllPosts(prev=>({...prev,[activeAccId]:(prev[activeAccId]||[]).map(p=>p.id===id?{...p,status:s}:p)}));
    setPreview(prev=>prev&&prev.id===id?{...prev,status:s}:prev);
  }

  // ── コメント ──
  async function saveComment(id,comments){
    const{error}=await supabase.from("posts").update({comments}).eq("id",id);
    if(error){showToast("コメントの保存に失敗しました");return;}
    setAllPosts(prev=>({...prev,[activeAccId]:(prev[activeAccId]||[]).map(p=>p.id===id?{...p,comments}:p)}));
    setPreview(prev=>prev&&prev.id===id?{...prev,comments}:prev);
  }

  // ── 再投稿 ──
  async function handleRepost(p,dt,repeat){
    const newPost={
      ...p,id:genId(),datetime:dt,status:"draft",
      title:repeat!=="none"?`【再】${p.title}`:p.title,
      history:[{at:nowStr(),note:`「${p.title}」から再投稿${repeat!=="none"?` (${repeat})`:""}`}],
      comments:[],
    };
    const ok=await saveToDb(newPost);
    if(!ok)return;
    setRepostTgt(null);
    showToast("再投稿を作成しました ✅");
  }

  // ── 複製 ──
  async function handleDuplicate(p){
    const newPost={
      ...p,id:genId(),
      datetime:nextDaySameTime(p.datetime),
      status:"draft",
      title:`【複製】${p.title}`,
      history:[{at:nowStr(),note:`「${p.title}」を複製`}],
      comments:[],
    };
    const ok=await saveToDb(newPost);
    if(!ok)return;
    setPreview(null);
    showToast("翌日同時刻に複製しました ✅");
  }

  // ── アカウント管理 ──
  async function addAccount(){
    const id="acc_"+Date.now();
    const acc={id,name:"新規クライアント",handle:"@handle",color:"#6b7280"};
    const{error}=await supabase.from("accounts").insert(acc);
    if(error){showToast("追加に失敗しました");return;}
    setAccounts(prev=>[...prev,acc]);
    setAllPosts(prev=>({...prev,[id]:[]}));
    setActiveAccId(id);setShowAccountSettings(true);
  }
  async function updateAccount(id,fields){
    const{error}=await supabase.from("accounts").update(fields).eq("id",id);
    if(error){showToast("更新に失敗しました");return;}
    setAccounts(prev=>prev.map(a=>a.id===id?{...a,...fields}:a));
  }
  async function deleteAccount(id){
    if(accounts.length<=1){showToast("最後のアカウントは削除できません");return;}
    const{error}=await supabase.from("accounts").delete().eq("id",id);
    if(error){showToast("削除に失敗しました");return;}
    const remaining=accounts.filter(a=>a.id!==id);
    setAccounts(remaining);
    setAllPosts(prev=>{const n={...prev};delete n[id];return n;});
    // remaining が確実に存在する（length<=1チェック済み）
    if(activeAccId===id) setActiveAccId(remaining[0].id);
  }
  function copyShareLink(accId){
    const base=window.location.href.split("?")[0];
    const url=`${base}?account=${accId}`;
    navigator.clipboard.writeText(url).then(()=>showToast("共有リンクをコピーしました")).catch(()=>showToast("コピー完了"));
  }
  function openNew(datetime){
    setEditing({id:genId(),title:"",status:"draft",postType:"x_post",datetime:datetime||`${today}T07:00`,body:"",memo:"",memoLinks:[],comments:[],history:[]});
  }

  // ⌘K
  useEffect(()=>{
    const h=e=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setShowSearch(true);}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  const postsBySlot={};
  filtered.forEach(p=>{
    const key=`${p.datetime.slice(0,10)}_${p.datetime.slice(11,13)}`;
    (postsBySlot[key]=postsBySlot[key]||[]).push(p);
  });

  if(loading)return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f2ede6",fontFamily:"'Hiragino Sans', sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:20,fontWeight:900,color:"#1a1a1a",marginBottom:8}}>Content<span style={{color:"#f59e0b"}}>OS</span></div>
        <div style={{fontSize:13,color:"#aaa"}}>読み込み中…</div>
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:`'Hiragino Sans','Noto Sans JP',${XFONT}`,background:"#f2ede6",minHeight:"100vh",color:"#1a1a1a"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px;}
        .xb{outline:none;}
        .xb:empty:before,.xb[data-ph]:empty:before{content:attr(data-ph);color:#8b98a5;pointer-events:none;}
        .xb p,.xb div{font-size:17px;line-height:1.75;color:#0f1419;margin:0 0 1.3em;}
        .xb p:last-child,.xb div:last-child{margin-bottom:0;}
        .xb br{display:block;height:0;}
        .xb h1{font-size:28px;font-weight:800;line-height:1.3;margin:1.2em 0 .5em;color:#0f1419;}
        .xb h2{font-size:20px;font-weight:700;line-height:1.4;margin:1em 0 .4em;color:#0f1419;}
        .xb ul{list-style:disc;padding-left:1.5em;margin:.6em 0 1.2em;}
        .xb ol{list-style:decimal;padding-left:1.5em;margin:.6em 0 1.2em;}
        .xb li{font-size:17px;line-height:1.75;color:#0f1419;margin:.15em 0;}
        .xb blockquote{border-left:3px solid #cfd9de;padding:4px 0 4px 16px;margin:.8em 0 1.2em;color:#536471;font-style:italic;font-size:17px;line-height:1.75;}
        .xb a{color:#1d9bf0;text-decoration:underline;}
        .xb hr{border:none;border-top:1px solid #eff3f4;margin:1.5em 0;}
        .xb strong,.xb b{font-weight:700;}
        .xb em,.xb i{font-style:italic;}
        .xb s{text-decoration:line-through;}
        .xb img{max-width:100%;border-radius:8px;margin:.6em 0;display:block;}
      `}</style>

      {/* ── ヘッダー ── */}
      <div style={{background:"#fff",borderBottom:"2px solid #e8e0d6",padding:"0 14px",display:"flex",alignItems:"center",gap:8,height:52,boxShadow:"0 1px 4px #0000000a",flexShrink:0,overflow:"hidden"}}>
        <span style={{fontWeight:900,fontSize:17,letterSpacing:"-0.5px",flexShrink:0}}>Content<span style={{color:"#f59e0b"}}>OS</span></span>

        {/* 管理者：アカウントタブ */}
        {isAdmin&&(
          <div style={{display:"flex",gap:3,background:"#f2ede6",borderRadius:10,padding:3,maxWidth:420,overflow:"auto",flexShrink:0}}>
            {accounts.map(acc=>(
              <button key={acc.id} onClick={()=>{setActiveAccId(acc.id);setPreview(null);}}
                style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:activeAccId===acc.id?"#fff":"transparent",color:activeAccId===acc.id?"#1a1a1a":"#aaa",boxShadow:activeAccId===acc.id?"0 1px 4px #0000001a":"none",whiteSpace:"nowrap",fontFamily:"inherit"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:activeAccId===acc.id?acc.color:"#ddd",display:"inline-block"}}/>
                {acc.name}
              </button>
            ))}
            <button onClick={addAccount}
              style={{padding:"5px 9px",borderRadius:7,border:"1px dashed #ccc",cursor:"pointer",fontSize:12,background:"transparent",color:"#bbb",whiteSpace:"nowrap",fontFamily:"inherit"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#ccc";e.currentTarget.style.color="#bbb";}}>
              + 追加
            </button>
          </div>
        )}

        {/* 共有リンクバッジ */}
        {isClient&&(
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:activeAcc?.color,display:"inline-block"}}/>
            <span style={{fontWeight:700,fontSize:14}}>{activeAcc?.name}</span>
            <span style={{fontSize:11,color:"#3ea8ff",background:"#e8f4ff",border:"1px solid #93c9fc",padding:"2px 8px",borderRadius:10}}>共有リンク</span>
          </div>
        )}

        {/* 種類凡例（ドットのみ） */}
        <div style={{display:"flex",alignItems:"center",gap:5,marginLeft:4,background:"#f7f9f9",border:"1px solid #e8e0d6",borderRadius:20,padding:"5px 10px",flexShrink:0}}>
          {Object.entries(POST_TYPE).map(([k,v])=>(
            <span key={k} title={v.label} style={{width:9,height:9,borderRadius:"50%",background:v.dot,cursor:"default",display:"block",flexShrink:0}}/>
          ))}
        </div>

        {/* 右側コントロール */}
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          <button onClick={()=>setShowSearch(true)}
            style={{display:"flex",alignItems:"center",gap:4,border:"1.5px solid #e0d8ce",background:"#f7f9f9",borderRadius:20,padding:"5px 11px",fontSize:12,color:"#888",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            🔍 検索<span style={{fontSize:10,color:"#ccc",background:"#fff",border:"1px solid #e0d8ce",borderRadius:4,padding:"1px 5px",marginLeft:2}}>⌘K</span>
          </button>
          <div style={{display:"flex",background:"#f2ede6",borderRadius:9,padding:3,gap:2,flexShrink:0}}>
            {[["calendar","カレンダー"],["list","リスト"]].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"5px 11px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:view===v?"#fff":"transparent",color:view===v?"#1a1a1a":"#aaa",boxShadow:view===v?"0 1px 4px #0000001a":"none",whiteSpace:"nowrap",fontFamily:"inherit"}}>{l}</button>
            ))}
          </div>
          {isAdmin&&(
            <>
              <Btn onClick={()=>setShowAccountSettings(true)}>設定</Btn>
              <div style={{position:"relative"}}>
                <Btn onClick={()=>setShowShare(s=>!s)}>共有</Btn>
                {showShare&&(
                  <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",background:"#fff",border:"1.5px solid #e8e0d6",borderRadius:12,padding:16,zIndex:100,width:300,boxShadow:"0 8px 24px #0000001a"}}>
                    <div style={{fontSize:13,fontWeight:800,marginBottom:6}}>クライアント共有リンク</div>
                    <div style={{fontSize:12,color:"#888",marginBottom:12,lineHeight:1.6}}>リンクを送ると編集・コメント・投稿が可能です。</div>
                    {accounts.map(acc=>(
                      <div key={acc.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"8px 10px",background:"#faf7f3",borderRadius:8,border:"1px solid #e8e0d6"}}>
                        <span style={{width:7,height:7,borderRadius:"50%",background:acc.color,flexShrink:0}}/>
                        <span style={{fontSize:13,fontWeight:700,flex:1}}>{acc.name}</span>
                        <button onClick={()=>copyShareLink(acc.id)} style={{background:"#f59e0b",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer"}}>コピー</button>
                      </div>
                    ))}
                    <Btn onClick={()=>setShowShare(false)} style={{width:"100%",marginTop:4}}>閉じる</Btn>
                  </div>
                )}
              </div>
            </>
          )}
          <button onClick={()=>openNew()} style={{background:"#f59e0b",border:"none",borderRadius:20,padding:"7px 15px",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",flexShrink:0}}>＋ 新規作成</button>
        </div>
      </div>

      {/* ── カレンダーナビ ── */}
      {view==="calendar"&&(
        <div style={{background:"#fff",borderBottom:"1px solid #e8e0d6",padding:"6px 18px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {activeAcc&&<span style={{width:8,height:8,borderRadius:"50%",background:activeAcc.color,display:"inline-block"}}/>}
          <span style={{fontWeight:800,fontSize:13,color:"#444"}}>{activeAcc?.name}</span>
          <Btn onClick={()=>{const d=new Date(week);d.setDate(d.getDate()-7);setWeek(d);}}>‹</Btn>
          <span style={{fontWeight:700,fontSize:13,minWidth:175,textAlign:"center",color:"#555"}}>
            {weekDates[0].getMonth()+1}月{weekDates[0].getDate()}日 〜 {weekDates[6].getMonth()+1}月{weekDates[6].getDate()}日
          </span>
          <Btn onClick={()=>{const d=new Date(week);d.setDate(d.getDate()+7);setWeek(d);}}>›</Btn>
          <Btn onClick={()=>setWeek(new Date())}>今週</Btn>
          <select value={filterStatus} onChange={e=>setFilter(e.target.value)}
            style={{background:"#f8f4ef",border:"1.5px solid #e0d8ce",borderRadius:7,padding:"4px 8px",fontSize:11,color:"#666",outline:"none",cursor:"pointer",marginLeft:"auto"}}>
            <option value="all">すべて</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      )}

      {/* ── カレンダービュー ── */}
      {view==="calendar"&&(
        <div style={{height:"calc(100vh - 100px)",overflow:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"48px repeat(7, 1fr)",minWidth:860}}>
            <div style={{background:"#fff",position:"sticky",top:0,zIndex:20,borderRight:"1px solid #e8e0d6",borderBottom:"2px solid #e8e0d6"}}/>
            {weekDates.map((date,i)=>{
              const isToday=fmtDate(date)===today;
              const cnt=filtered.filter(p=>p.datetime.startsWith(fmtDate(date))).length;
              return(
                <div key={i} style={{background:"#fff",padding:"7px 5px 5px",textAlign:"center",borderBottom:"2px solid #e8e0d6",borderRight:"1px solid #e8e0d6",position:"sticky",top:0,zIndex:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:isToday?"#f59e0b":i>=5?"#ef4444":"#9ca3af"}}>{DAYS[i]}</div>
                  <div style={{width:29,height:29,borderRadius:"50%",background:isToday?"#f59e0b":"transparent",display:"flex",alignItems:"center",justifyContent:"center",margin:"2px auto",fontSize:14,fontWeight:800,color:isToday?"#fff":"#1a1a1a"}}>{date.getDate()}</div>
                  {cnt>0&&<div style={{fontSize:10,color:"#f59e0b",fontWeight:700}}>{cnt}件</div>}
                </div>
              );
            })}
            {HOURS.map(hour=>(
              <React.Fragment key={hour}>
                <div style={{borderTop:"1px solid #ede8e0",padding:"3px 5px 0",fontSize:10,color:"#c8bfb4",textAlign:"right",background:"#faf7f3",borderRight:"1px solid #e8e0d6"}}>{hour}:00</div>
                {weekDates.map((date,di)=>{
                  const key=fmtDate(date)+"_"+String(hour).padStart(2,"0");
                  const sp=postsBySlot[key]||[];
                  const dateStr=fmtDate(date),isEmpty=sp.length===0;
                  return(
                    <div key={hour+"-"+di}
                      onClick={isEmpty?()=>openNew(`${dateStr}T${String(hour).padStart(2,"0")}:00`):undefined}
                      style={{borderTop:"1px solid #ede8e0",borderRight:"1px solid #e8e0d6",padding:"3px",minHeight:42,background:dateStr===today?"#fffcf5":"#fff",cursor:isEmpty?"pointer":"default",transition:"background .1s"}}
                      onMouseEnter={isEmpty?e=>{e.currentTarget.style.background=dateStr===today?"#fff8e8":"#faf7f3";}:undefined}
                      onMouseLeave={isEmpty?e=>{e.currentTarget.style.background=dateStr===today?"#fffcf5":"#fff";}:undefined}>
                      {sp.map(p=>{
                        const pt2=POST_TYPE[p.postType||"x_post"],st2=STATUS[p.status];
                        return(
                          <div key={p.id} onClick={e=>{e.stopPropagation();setPreview(p);}}
                            style={{background:"#fff",border:`1.5px solid ${pt2.border}`,borderLeft:`3px solid ${pt2.dot}`,borderRadius:6,padding:"3px 5px",marginBottom:2,cursor:"pointer",transition:"all .1s"}}
                            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 2px 8px #0000001a";e.currentTarget.style.borderColor=pt2.color;}}
                            onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor=pt2.border;}}>
                            <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:1}}>
                              <span style={{width:5,height:5,borderRadius:"50%",background:pt2.dot,flexShrink:0}}/>
                              <span style={{fontSize:9,color:"#888"}}>{fmtTime(p.datetime)}</span>
                            </div>
                            <div style={{fontSize:10,fontWeight:700,color:"#0f1419",lineHeight:1.3}}>{(p.title||"（タイトルなし）").slice(0,12)}{(p.title||"").length>12?"…":""}</div>
                            <div style={{display:"flex",gap:3,marginTop:1,flexWrap:"wrap"}}>
                              <span style={{fontSize:8,color:pt2.color,fontWeight:700,background:pt2.bg,padding:"0 4px",borderRadius:6}}>{pt2.label}</span>
                              {st2&&<span style={{fontSize:8,color:st2.text,background:st2.chip,border:`1px solid ${st2.border}`,padding:"0 4px",borderRadius:6,fontWeight:600}}>{st2.label}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* ── リストビュー ── */}
      {view==="list"&&(
        <div style={{padding:20,overflowY:"auto",maxHeight:"calc(100vh - 52px)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            {activeAcc&&<span style={{width:8,height:8,borderRadius:"50%",background:activeAcc.color,display:"inline-block"}}/>}
            <span style={{fontWeight:800,fontSize:14}}>{activeAcc?.name} の投稿</span>
            <span style={{fontSize:12,color:"#aaa"}}>{filtered.length}件</span>
            <select value={filterStatus} onChange={e=>setFilter(e.target.value)}
              style={{marginLeft:"auto",background:"#f8f4ef",border:"1.5px solid #e0d8ce",borderRadius:7,padding:"5px 9px",fontSize:12,color:"#666",outline:"none",cursor:"pointer"}}>
              <option value="all">すべてのステータス</option>
              {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {Object.entries(STATUS).map(([sk,sv])=>{
            const grp=filtered.filter(p=>p.status===sk);
            if(!grp.length)return null;
            return(
              <div key={sk} style={{marginBottom:24}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:11,fontWeight:700,color:sv.text,background:sv.chip,border:`1px solid ${sv.border}`,padding:"2px 10px",borderRadius:20}}>{sv.label}</span>
                  <span style={{fontSize:11,color:"#ccc"}}>{grp.length}件</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:9}}>
                  {grp.sort((a,b)=>a.datetime.localeCompare(b.datetime)).map(p=>{
                    const pt2=POST_TYPE[p.postType||"x_post"];
                    return(
                      <div key={p.id} onClick={()=>setPreview(p)}
                        style={{background:"#fff",border:`1.5px solid ${pt2.border}`,borderTop:`3px solid ${pt2.dot}`,borderRadius:10,padding:"11px 13px",cursor:"pointer",transition:"box-shadow .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 14px #0000001a"}
                        onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                          <span style={{width:7,height:7,borderRadius:"50%",background:pt2.dot}}/>
                          <span style={{fontSize:10,color:pt2.color,fontWeight:700,background:pt2.bg,border:`1px solid ${pt2.border}`,padding:"0 6px",borderRadius:10}}>{pt2.label}</span>
                          <span style={{fontSize:10,color:"#aaa",marginLeft:"auto"}}>{p.datetime.slice(0,10)}</span>
                        </div>
                        <div style={{fontSize:13,fontWeight:800,marginBottom:5,color:"#0f1419",lineHeight:1.3}}>{p.title||"（タイトルなし）"}</div>
                        {p.memo&&<div style={{fontSize:10,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:5,padding:"2px 7px",marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.memo}</div>}
                        <div style={{display:"flex",gap:5,marginTop:4}}>
                          <button onClick={e=>{e.stopPropagation();setEditing({...p});}}
                            style={{background:"#f59e0b",border:"none",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>編集</button>
                          <button onClick={e=>{e.stopPropagation();handleDuplicate(p);}}
                            style={{background:"none",border:"1.5px solid #e0d8ce",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:600,color:"#536471",cursor:"pointer",fontFamily:"inherit"}}
                            onMouseEnter={e=>e.currentTarget.style.background="#f3f4f6"} onMouseLeave={e=>e.currentTarget.style.background="none"}>📋</button>
                          <button onClick={e=>{e.stopPropagation();setRepostTgt(p);}}
                            style={{background:"none",border:"1.5px solid #e0d8ce",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:600,color:"#536471",cursor:"pointer",fontFamily:"inherit"}}
                            onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="#f59e0b";}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";e.currentTarget.style.borderColor="#e0d8ce";}}>🔁</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length===0&&<div style={{textAlign:"center",color:"#ccc",padding:60,fontSize:13}}>投稿がありません</div>}
        </div>
      )}

      {/* ── モーダル群 ── */}
      {preview&&<PreviewOverlay post={preview} onClose={()=>setPreview(null)}
        onEdit={p=>{setPreview(null);setEditing({...p});}}
        onRepost={p=>{setPreview(null);setRepostTgt(p);}}
        onDuplicate={handleDuplicate}
        onDelete={p=>setDeleteConfirm(p)}
        onSaveComment={saveComment}/>}

      {editing&&<EditorModal post={{postType:'x_post',body:'',memo:'',memoLinks:[],comments:[],history:[],...editing}} onSave={save} onClose={()=>setEditing(null)}/>}

      {showSearch&&<SearchModal posts={posts} onClose={()=>setShowSearch(false)}
        onSelect={p=>{setShowSearch(false);setPreview(p);}}
        onRepost={p=>{setShowSearch(false);setRepostTgt(p);}}/>}

      {repostTgt&&<RepostModal post={repostTgt} onClose={()=>setRepostTgt(null)}
        onRepost={(dt,r)=>handleRepost(repostTgt,dt,r)}/>}

      {showAccountSettings&&isAdmin&&(
        <AccountSettings accounts={accounts} onUpdate={updateAccount} onDelete={deleteAccount} onAdd={addAccount} onCopyLink={copyShareLink} onClose={()=>setShowAccountSettings(false)}/>
      )}

      {/* 削除確認ダイアログ */}
      {deleteConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:360,padding:28,boxShadow:"0 20px 60px #00000030",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:800,fontSize:"1.05em",color:"#0f1419",marginBottom:8}}>この投稿を削除しますか？</div>
            <div style={{fontSize:"0.84em",color:"#536471",marginBottom:6,lineHeight:1.5}}>「{deleteConfirm.title||"（タイトルなし）"}」</div>
            <div style={{fontSize:"0.76em",color:"#ef4444",marginBottom:22}}>この操作は取り消せません。</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDeleteConfirm(null)} style={{flex:1,border:"1.5px solid #e0d8ce",background:"#fff",borderRadius:20,padding:"10px 0",fontWeight:600,fontSize:"0.88em",color:"#536471",cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button>
              <button onClick={()=>del(deleteConfirm.id)} style={{flex:1,background:"#ef4444",border:"none",borderRadius:20,padding:"10px 0",fontWeight:800,fontSize:"0.88em",color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {toast&&(
        <div style={{position:"fixed",bottom:22,left:"50%",transform:"translateX(-50%)",background:"#1a1a1a",color:"#fff",padding:"9px 20px",borderRadius:24,fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 4px 16px #00000033",whiteSpace:"nowrap"}}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── 共通UIコンポーネント ──
function Btn({children,onClick,primary,danger,style}){
  const t=primary?{background:"#f59e0b",borderColor:"#f59e0b",color:"#fff"}:danger?{background:"#fff",borderColor:"#fca5a5",color:"#ef4444"}:{background:"#fff",borderColor:"#e0d8ce",color:"#555"};
  return<button onClick={onClick} style={{border:"1.5px solid",borderRadius:8,padding:"6px 13px",cursor:"pointer",fontSize:12,fontWeight:700,transition:"opacity 0.1s",...t,...style,fontFamily:"inherit"}} onMouseEnter={e=>e.currentTarget.style.opacity=".82"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>{children}</button>;
}
const INP={width:"100%",background:"#fff",border:"1.5px solid #e0d8ce",borderRadius:8,padding:"7px 10px",color:"#1a1a1a",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
