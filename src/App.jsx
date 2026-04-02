import React, { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";
import { auth, db, googleProvider } from "./firebase.js";
import { onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// ── ポータル連携設定 ──────────────────────────────────
const PORTAL_APP_ID  = "content-os";
const PORTAL_URL     = "https://portal.shia2n.jp";

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
const SCORE={
  S:{label:"S",color:"#fff",bg:"#7c3aed",border:"#7c3aed"},
  A:{label:"A",color:"#fff",bg:"#2563eb",border:"#2563eb"},
  B:{label:"B",color:"#fff",bg:"#059669",border:"#059669"},
  C:{label:"C",color:"#fff",bg:"#d97706",border:"#d97706"},
  D:{label:"D",color:"#fff",bg:"#dc2626",border:"#dc2626"},
};
const DAYS   = ["月","火","水","木","金","土","日"];
const HOURS  = Array.from({length:24},(_,i)=>i);
const COLORS = ["#f59e0b","#3b82f6","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
const XFONT  = "'Geist','Hiragino Sans','Noto Sans JP',sans-serif";
const STORAGE_BUCKET = "contentos"; // Supabase Storageバケット名
// 通知対象：予約済みのまま過ぎた投稿を検出するステータス
const OVERDUE_STATUS = "reserved";

// ⑦ レンダー内で再生成されないようモジュールレベルで定義
const IMG_SIZES_OPTS=[["small","小 (25%)"],["medium","中 (50%)"],["large","大 (75%)"],["full","全幅"]];
const IMG_ALIGNS_OPTS=[["left","左"],["center","中央"],["right","右"]];
const REPOST_REPEATS=[["none","繰り返しなし"],["weekly","毎週"],["biweekly","隔週"],["monthly","毎月"],["bimonthly","2ヶ月ごと"],["quarterly","3ヶ月ごと"]];
const SLOT_DOWS=[[1,"月"],[2,"火"],[3,"水"],[4,"木"],[5,"金"],[6,"土"],[7,"日"]];
const SLOT_NTHS=[[1,"第1"],[2,"第2"],[3,"第3"],[4,"第4"]];
const SLOT_TYPES=[["weekly","毎週"],["daily","毎日"],["nth_weekday","第N曜日"]];
const TOOLBAR_BLOCK_LABELS={"p":"本文","h1":"見出し","h2":"小見出し","blockquote":"引用","li":"リスト"};

function fmtDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function fmtTime(s){return s?s.slice(11,16):"";}

// 予約枠のtime取得（後方互換：hourのみの旧データはHH:00に変換）
function slotTime(s){return s.time||(s.hour!=null?String(s.hour).padStart(2,"0")+":00":"00:00");}
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
function dbToPost(p){
  const rawLinks=p.memo_links||[];
  return{...p,
    postType:p.post_type||"x_post",
    comments:p.comments||[],
    body:p.body||"",
    memo:p.memo||"",
    memoLinks:rawLinks.map(l=>typeof l==="string"?{label:"",url:l}:l),
    history:p.history||[],
    score:p.score||null,
    labels:p.labels||[],
  };
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

    // Tab: 箇条書きのインデント／アウトデント
    if(e.key==="Tab"){
      e.preventDefault();
      const sel=window.getSelection();
      if(sel&&sel.rangeCount>0){
        const node=sel.getRangeAt(0).commonAncestorContainer;
        const block=node.nodeType===3?node.parentElement:node;
        const inList=block?.closest("li");
        if(inList){
          // リスト内のみインデント操作
          document.execCommand(e.shiftKey?"outdent":"indent");
          emit();
          return;
        }
      }
      // リスト外ではタブを無視（フォーカス移動させない）
      return;
    }

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
      onPaste={e=>{
        e.preventDefault();
        const text=e.clipboardData.getData("text/plain");
        if(!text)return;
        // 段落（2連続改行）と行内改行を区別して変換
        const paras=text.split(/\n{2,}/);
        if(paras.length<=1){
          // 単一段落 — 改行をbrに
          document.execCommand("insertHTML",false,text.replace(/\n/g,"<br>"));
        }else{
          // 複数段落 — pタグで囲む
          const html=paras.filter(p=>p.trim()).map(p=>`<p>${p.replace(/\n/g,"<br>").trim()}</p>`).join("");
          document.execCommand("insertHTML",false,html);
        }
      }}
      onKeyDown={handleKeyDown}
      style={{minHeight:360,fontSize:17,lineHeight:1.75,color:"#0f1419",fontFamily:XFONT,wordBreak:"break-word",caretColor:"#1d9bf0",outline:"none"}}
    />
  );
}

// ── ツールバー用ボタン（Toolbar外で定義することで毎レンダー再生成を防ぐ） ──
function ToolbarBtn({title,onClick,active,ch}){
  return(
    <button title={title} onMouseDown={e=>{e.preventDefault();onClick();}}
      style={{border:active?"1.5px solid #1d9bf0":"1px solid transparent",background:active?"#e8f5fe":"none",color:active?"#1d9bf0":"#536471",borderRadius:5,padding:"4px 6px",cursor:"pointer",fontSize:"0.82em",fontWeight:active?800:600,display:"flex",alignItems:"center",justifyContent:"center",height:28,minWidth:26,fontFamily:"inherit",transition:"all .1s"}}
      onMouseEnter={e=>{if(!active){e.currentTarget.style.background="#eff3f4";e.currentTarget.style.color="#0f1419";}}}
      onMouseLeave={e=>{if(!active){e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";}}}>
      {ch}
    </button>
  );
}
function ToolbarSep(){return <div style={{width:1,height:16,background:"#e6dfd6",margin:"0 2px"}}/>;}

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

  // B・Sp はファイル上部で定義済み

  // ブロックラベル
  const blockLabel=TOOLBAR_BLOCK_LABELS[fmt.block]||"本文";

  return(
    <div style={{display:"flex",alignItems:"center",gap:1,padding:"5px 14px",borderBottom:"1px solid #e6dfd6",background:"#fff",flexWrap:"wrap",flexShrink:0}}>
      {/* 形式セレクト（現在の形式を表示） */}
      <select value={["p","h1","h2","blockquote"].includes(fmt.block)?fmt.block:"p"}
        onChange={e=>{exec("formatBlock",e.target.value);}}
        style={{border:"1px solid #e6dfd6",borderRadius:5,padding:"2px 7px",fontSize:"0.77em",color:"#1a1a1a",background:"#fff",cursor:"pointer",fontFamily:"inherit",height:28,fontWeight:600}}>
        <option value="p">本文</option>
        <option value="h1">見出し</option>
        <option value="h2">小見出し</option>
        <option value="blockquote">引用</option>
      </select>
      <ToolbarSep/>
      <ToolbarBtn title="太字 (Ctrl+B)" onClick={()=>exec("bold")} active={fmt.bold} ch={<strong>B</strong>}/>
      <ToolbarBtn title="斜体 (Ctrl+I)" onClick={()=>exec("italic")} active={fmt.italic} ch={<em>I</em>}/>
      <ToolbarBtn title="取り消し線" onClick={()=>exec("strikeThrough")} active={fmt.strike} ch={<s>S</s>}/>
      <ToolbarSep/>
      <ToolbarBtn title="箇条書き" onClick={()=>exec("insertUnorderedList")} active={fmt.block==="li"} ch={
        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="1.5" cy="3" r="1.5"/><rect x="4" y="2" width="10" height="2" rx="1"/>
          <circle cx="1.5" cy="7" r="1.5"/><rect x="4" y="6" width="10" height="2" rx="1"/>
          <circle cx="1.5" cy="11" r="1.5"/><rect x="4" y="10" width="10" height="2" rx="1"/>
        </svg>}/>
      <ToolbarBtn title="番号リスト" onClick={()=>exec("insertOrderedList")} active={false} ch="1≡"/>
      <ToolbarSep/>
      <ToolbarBtn title="リンク" onClick={()=>{const u=prompt("URL:");if(u)exec("createLink",u);}} active={false} ch="🔗"/>
      <ToolbarBtn title="区切り線" onClick={()=>exec("insertHorizontalRule")} active={false} ch="—"/>
      <button onMouseDown={e=>e.preventDefault()}
        onClick={()=>{
          // スレッド区切り専用のhr（class="thread-sep"）を挿入
          document.execCommand("insertHTML",false,'<hr class="thread-sep" data-thread="true"><p><br></p>');
        }}
        style={{border:"1px solid #1d9bf0",background:"#e8f5fe",color:"#1d9bf0",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:"0.73em",fontWeight:700,height:28,display:"flex",alignItems:"center",gap:2,fontFamily:"inherit",marginLeft:3}}
        onMouseEnter={e=>{e.currentTarget.style.background="#1d9bf0";e.currentTarget.style.color="#fff";}}
        onMouseLeave={e=>{e.currentTarget.style.background="#e8f5fe";e.currentTarget.style.color="#1d9bf0";}}>
        𝕏 スレッド↓
      </button>
      <button onMouseDown={e=>e.preventDefault()} onClick={onInsertOpen}
        style={{border:"1px solid #e6dfd6",background:"none",color:"#536471",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:"0.73em",fontWeight:600,height:28,display:"flex",alignItems:"center",gap:2,fontFamily:"inherit",marginLeft:3}}
        onMouseEnter={e=>{e.currentTarget.style.background="#eff3f4";e.currentTarget.style.color="#0f1419";}}
        onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";}}>
        ＋挿入
      </button>
      <ToolbarBtn title="書式クリア" onClick={()=>exec("removeFormat")} active={false} ch="✕"/>
      {/* 現在の形式バッジ */}
      <div style={{marginLeft:6,fontSize:"0.68em",color:"#1d9bf0",background:"#e8f5fe",border:"1px solid #93d3fc",borderRadius:10,padding:"1px 7px",fontWeight:700}}>{blockLabel}</div>
      <div style={{marginLeft:"auto",fontSize:"0.6em",color:"#bbb"}}>Enter=新段落　⇧Enter=同形式改行</div>
    </div>
  );
}

function InsertModal({onClose,savedRange,bodyRef}){
  const [tab,setTab]=useState("image"),[url,setUrl]=useState("");
  const [imgSize,setImgSize]=useState("full");
  const [imgAlign,setImgAlign]=useState("left");
  const fileRef=useRef(null);
  const insertAt=html=>{
    bodyRef.current?.focus();
    const sel=window.getSelection();
    if(savedRange){sel.removeAllRanges();sel.addRange(savedRange);}
    document.execCommand("insertHTML",false,html);
  };
  // IMG_SIZES_OPTS / IMG_ALIGNS_OPTS はモジュールレベルで定義済み
  const imgStyleStr=(()=>{
    const w=imgSize==="small"?"25%":imgSize==="medium"?"50%":imgSize==="large"?"75%":"100%";
    const ml=imgAlign==="center"?"auto":imgAlign==="right"?"auto":"0";
    const mr=imgAlign==="center"?"auto":imgAlign==="right"?"0":"auto";
    return `max-width:${w};width:${w};border-radius:8px;display:block;margin-left:${ml};margin-right:${mr};`;
  })();
  const [uploading,setUploading]=useState(false);
  const handleImage=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>50*1024*1024){alert("画像は50MB以下にしてください");return;}
    setUploading(true);
    try{
      const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
      const safeName=`${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const path=`images/${safeName}`;
      const{error:upErr}=await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
      if(upErr){
        const msg=upErr.message||"";
        if(msg.includes("not found")||msg.includes("bucket"))
          throw new Error("バケット「contentos」が存在しないか非公開です。Supabase→Storageで作成してください");
        if(msg.includes("policy")||msg.includes("violates"))
          throw new Error("ストレージのRLSポリシーでアップロードが拒否されました。ポリシーを確認してください");
        throw upErr;
      }
      const{data:urlData}=supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      if(!urlData?.publicUrl)throw new Error("公開URLの取得に失敗しました");
      insertAt(`<p><img src="${urlData.publicUrl}" alt="${file.name}" style="${imgStyleStr}"/></p>`);
      onClose();
    }catch(err){
      alert("画像のアップロードに失敗しました:\n"+err.message);
    }finally{
      setUploading(false);
      if(fileRef.current)fileRef.current.value="";
    }
  };
  const handlePost=()=>{
    if(!url.trim())return;
    const isNote=/note\.com/.test(url);
    const icon=isNote?"📄":"𝕏";
    insertAt(`<div style="border:1px solid #e6dfd6;border-radius:10px;padding:10px 14px;margin:.6em 0;background:#f7f9f9;display:flex;align-items:center;gap:10px;" contenteditable="false"><span>${icon}</span><a href="${url}" target="_blank" style="color:#1d9bf0;text-decoration:none;font-size:13px;word-break:break-all;">${url}</a></div><p><br></p>`);
    onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",border:"1px solid #e6dfd6",borderRadius:14,width:"100%",maxWidth:360,overflow:"hidden",boxShadow:"0 20px 60px #00000025"}}>
        <div style={{display:"flex",borderBottom:"1px solid #e6dfd6"}}>
          {[["image","🖼 画像"],["post","リンク挿入"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,border:"none",background:"none",padding:"11px 0",fontWeight:tab===t?700:500,color:tab===t?"#f59e0b":"#999",borderBottom:tab===t?"2px solid #f59e0b":"2px solid transparent",cursor:"pointer",fontSize:"0.82em",fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>
        <div style={{padding:"14px 16px 8px"}}>
          {tab==="image"&&(<><input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImage}/>
            {/* サイズ選択 */}
            <div style={{marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#888",marginBottom:5}}>サイズ</div>
              <div style={{display:"flex",gap:4}}>
                {IMG_SIZES_OPTS.map(([v,l])=>(
                  <button key={v} onClick={()=>setImgSize(v)}
                    style={{flex:1,padding:"4px 0",borderRadius:6,border:imgSize===v?"2px solid #f59e0b":"1px solid #e0d8ce",background:imgSize===v?"#fef3c7":"#fff",fontSize:10,fontWeight:imgSize===v?700:500,color:imgSize===v?"#d97706":"#555",cursor:"pointer",fontFamily:"inherit"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {/* 配置選択 */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"#888",marginBottom:5}}>配置</div>
              <div style={{display:"flex",gap:4}}>
                {IMG_ALIGNS_OPTS.map(([v,l])=>(
                  <button key={v} onClick={()=>setImgAlign(v)}
                    style={{flex:1,padding:"4px 0",borderRadius:6,border:imgAlign===v?"2px solid #f59e0b":"1px solid #e0d8ce",background:imgAlign===v?"#fef3c7":"#fff",fontSize:10,fontWeight:imgAlign===v?700:500,color:imgAlign===v?"#d97706":"#555",cursor:"pointer",fontFamily:"inherit"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={()=>!uploading&&fileRef.current?.click()} style={{width:"100%",border:"2px dashed #e8e0d6",background:"#f8f5f1",borderRadius:9,padding:"20px 0",cursor:uploading?"default":"pointer",color:uploading?"#f59e0b":"#aaa",fontSize:"0.83em",fontWeight:600,fontFamily:"inherit"}} onMouseEnter={e=>{if(!uploading){e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}} onMouseLeave={e=>{if(!uploading){e.currentTarget.style.borderColor="#e6dfd6";e.currentTarget.style.color="#aaa";}}}>{uploading?"⏳ アップロード中…":"📁 クリックして画像を選択"}</button></>)}
          {tab==="post"&&(<><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."
            style={{width:"100%",border:"1px solid #e6dfd6",borderRadius:8,padding:"9px 11px",fontSize:"0.82em",fontFamily:"inherit",color:"#1a1a1a",marginBottom:10,outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e6dfd6"}
            onKeyDown={e=>{if(e.key==="Enter")handlePost();}}/>
          <button onClick={handlePost} disabled={!url.trim()} style={{width:"100%",background:url.trim()?"#f59e0b":"#eff3f4",color:url.trim()?"#fff":"#aaa",border:"none",borderRadius:20,padding:"9px 0",fontWeight:700,fontSize:"0.82em",cursor:url.trim()?"pointer":"default",fontFamily:"inherit"}}>挿入</button></>)}
        </div>
        <div style={{padding:"8px 16px 14px"}}><button onClick={onClose} style={{width:"100%",border:"1px solid #e6dfd6",background:"none",color:"#536471",borderRadius:7,padding:"7px",fontWeight:500,fontSize:"0.8em",cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button></div>
      </div>
    </div>
  );
}

// HTMLを読みやすいプレーンテキストに変換（スレッド対応）
function htmlToPlain(html, threadMode=false){
  const div=document.createElement("div");
  div.innerHTML=html;

  if(threadMode){
    // スレッドモード：thread-sepで分割して番号付きに変換
    const parts=[];
    let current=document.createElement("div");
    div.childNodes.forEach(node=>{
      const isThreadSep=node.nodeType===1&&
        (node.classList?.contains("thread-sep")||node.getAttribute?.("data-thread")==="true");
      if(isThreadSep){
        parts.push(current);
        current=document.createElement("div");
      } else {
        current.appendChild(node.cloneNode(true));
      }
    });
    parts.push(current);
    const total=parts.length;
    return parts
      .map((part,i)=>{
        const text=htmlToPlain(part.innerHTML||"").trim();
        if(!text)return null;
        return total>1
          ? `【ツイート ${i+1}/${total}】\n${text}`
          : text;
      })
      .filter(Boolean)
      .join("\n\n---\n\n");
  }

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
    if(tag==="hr")return node.classList?.contains("thread-sep")?"[スレッド区切り]\n\n":"───────────\n\n";
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
// ════════════════════════════════════════════════════════
// TagSelector — メディア・スコア・ラベル共通ドロップダウン
// ════════════════════════════════════════════════════════
function TagSelector({
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
    if(!open)return;
    setTimeout(()=>inputRef.current?.focus(),50);
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    window.addEventListener("mousedown",h);
    return()=>window.removeEventListener("mousedown",h);
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
          background:"#fff",border:"1px solid #e0d8ce",borderRadius:12,
          width:220,boxShadow:"0 8px 28px rgba(0,0,0,.12)",
          display:"flex",flexDirection:"column",overflow:"hidden",
        }}>
          {/* ヘッダー */}
          <div style={{padding:"8px 10px 6px",borderBottom:"1px solid #f0ebe4"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#a8a09a",marginBottom:5,letterSpacing:".4px"}}>{label}</div>
            <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)}
              placeholder="検索…"
              style={{width:"100%",border:"1px solid #e0d8ce",borderRadius:6,padding:"4px 8px",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",color:"#333"}}
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
                style={{flex:1,border:"1px solid #e0d8ce",borderRadius:6,padding:"4px 8px",fontSize:11.5,fontFamily:"inherit",outline:"none",color:"#333",minWidth:0}}
                onFocus={e=>e.target.style.borderColor="#f59e0b"}
                onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
              <button onClick={handleAdd} disabled={!newVal.trim()}
                style={{background:newVal.trim()?"#111":"#e0d8ce",border:"none",borderRadius:6,padding:"4px 9px",fontSize:11,fontWeight:700,color:"#fff",cursor:newVal.trim()?"pointer":"default",fontFamily:"inherit",flexShrink:0}}>
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
function LabelEditor({labels,onChange}){
  const [input,setInput]=useState("");
  const composing=useRef(false);
  const add=()=>{
    const v=input.trim();
    if(!v||labels.includes(v))return;
    onChange([...labels,v]);
    setInput("");
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {labels.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {labels.map((l,i)=>(
            <span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,background:"#f5f0eb",border:"1px solid #e0d8ce",borderRadius:99,padding:"2px 8px",fontSize:"0.72em",fontWeight:600,color:"#555"}}>
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
          style={{flex:1,border:"1px solid #e0d8ce",borderRadius:7,padding:"5px 9px",fontSize:"0.77em",fontFamily:"inherit",color:"#333",outline:"none",boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor="#f59e0b"}
          onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
        <button onClick={add} disabled={!input.trim()}
          style={{background:input.trim()?"#555":"#e0d8ce",border:"none",borderRadius:7,padding:"5px 9px",fontSize:"0.77em",fontWeight:700,color:"#fff",cursor:input.trim()?"pointer":"default",fontFamily:"inherit"}}>
          追加
        </button>
      </div>
    </div>
  );
}

function MemoEditor({memo,memoLinks,onChange}){
  const [linkInput,setLinkInput]=useState("");
  const [labelInput,setLabelInput]=useState("");
  const textareaRef=useRef(null);
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
    const start=el.selectionStart,end=el.selectionEnd;
    const before=memo.slice(0,start),after=memo.slice(end);
    const lineStart=before.lastIndexOf("\n")+1;
    const linePrefix=before.slice(lineStart);
    const insert=linePrefix.startsWith("・")?"":"\n・";
    const next=before+(start===0?"・":insert)+after;
    onChange({memo:next,memoLinks:links});
    setTimeout(()=>{el.focus();const pos=start+(start===0?1:insert.length);el.setSelectionRange(pos,pos);},0);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:"0.7em",fontWeight:700,color:"#888"}}>メモ</span>
        <button onClick={insertBullet}
          style={{border:"1px solid #e0d8ce",background:"#fff",borderRadius:5,padding:"2px 7px",fontSize:"0.68em",fontWeight:700,color:"#555",cursor:"pointer",fontFamily:"inherit"}}>
          ・ 箇条書き
        </button>
      </div>
      <textarea ref={textareaRef} value={memo}
        onChange={e=>onChange({memo:e.target.value,memoLinks:links})}
        onCompositionStart={()=>{composing.current=true;}}
        onCompositionEnd={()=>{composing.current=false;}}
        onKeyDown={e=>{
          if(composing.current)return;
          if(e.key==="Tab"){
            e.preventDefault();
            const el=e.currentTarget;
            const start=el.selectionStart,end=el.selectionEnd;
            const lineStart=memo.slice(0,start).lastIndexOf("\n")+1;
            const lineEnd=memo.indexOf("\n",start);
            const line=memo.slice(lineStart,lineEnd===-1?undefined:lineEnd);
            if(line.trimStart().startsWith("・")){
              // 行頭に全角スペースを追加（インデント）
              const indent=e.shiftKey?"":"　";
              const dedent=e.shiftKey&&line.startsWith("　");
              const newLine=dedent?line.slice(1):indent+line;
              const next=memo.slice(0,lineStart)+newLine+memo.slice(lineEnd===-1?memo.length:lineEnd);
              onChange({memo:next,memoLinks:links});
              const diff=dedent?-1:indent.length;
              setTimeout(()=>{el.focus();el.setSelectionRange(start+diff,start+diff);},0);
            } else {
              const next=memo.slice(0,start)+"　"+memo.slice(end);
              onChange({memo:next,memoLinks:links});
              setTimeout(()=>{el.focus();el.setSelectionRange(start+1,start+1);},0);
            }
            return;
          }
          if(e.key==="Enter"){
            const el=e.currentTarget;
            const start=el.selectionStart;
            const lineStart=memo.slice(0,start).lastIndexOf("\n")+1;
            if(memo.slice(lineStart,lineStart+1)==="・"){
              e.preventDefault();
              const next=memo.slice(0,start)+"\n・"+memo.slice(start);
              onChange({memo:next,memoLinks:links});
              setTimeout(()=>{el.focus();el.setSelectionRange(start+2,start+2);},0);
            }
          }
        }}
        placeholder={"執筆の意図・注意点など\n・箇条書きも使えます"} rows={4}
        style={{width:"100%",background:"#fff",border:"1px solid #e0d8ce",borderRadius:8,padding:"8px 10px",color:"#1a1a1a",fontSize:"0.8em",outline:"none",boxSizing:"border-box",fontFamily:"inherit",resize:"vertical",lineHeight:1.7}}
        onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
      {links.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:180,overflowY:"auto"}}>
          {links.map((l,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:7,padding:"5px 8px"}}>
              <span style={{fontSize:"0.7em",flexShrink:0}}>🔗</span>
              <div style={{flex:1,minWidth:0}}>
                {l.label&&<div style={{fontSize:"0.7em",fontWeight:700,color:"#0369a1",marginBottom:1}}>{l.label}</div>}
                <a href={l.url} target="_blank" rel="noreferrer" style={{fontSize:"0.7em",color:"#0369a1",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{l.url}</a>
              </div>
              <button onClick={()=>onChange({memo,memoLinks:links.filter((_,j)=>j!==i)})} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:"0.8em",flexShrink:0}}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <input value={labelInput} onChange={e=>setLabelInput(e.target.value)}
          placeholder="ラベル（任意）"
          style={{width:"100%",border:"1px solid #e0d8ce",borderRadius:8,padding:"5px 10px",fontSize:"0.77em",fontFamily:"inherit",color:"#1a1a1a",outline:"none",boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
        <div style={{display:"flex",gap:4}}>
          <input value={linkInput} onChange={e=>setLinkInput(e.target.value)}
            placeholder="URLをペースト → 追加"
            onKeyDown={e=>{if(!composing.current&&e.key==="Enter")addLink();}}
            onPaste={e=>{const v=e.clipboardData.getData("text").trim();if(isUrl(v)){e.preventDefault();setLinkInput(v);}}}
            style={{flex:1,border:"1px solid #e0d8ce",borderRadius:8,padding:"5px 10px",fontSize:"0.77em",fontFamily:"inherit",color:"#1a1a1a",outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
          <button onClick={addLink} disabled={!isUrl(linkInput.trim())}
            style={{background:isUrl(linkInput.trim())?"#0369a1":"#e0d8ce",border:"none",borderRadius:8,padding:"5px 10px",fontSize:"0.77em",fontWeight:700,color:"#fff",cursor:isUrl(linkInput.trim())?"pointer":"default",fontFamily:"inherit",whiteSpace:"nowrap",transition:"background .15s"}}>
            ＋追加
          </button>
        </div>
      </div>
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
  // REPOST_REPEATS はモジュールレベルで定義済み
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:380,padding:24,boxShadow:"0 20px 60px #00000025"}}>
        <div style={{fontWeight:800,fontSize:"1.05em",color:"#0f1419",marginBottom:4}}>🔁 再投稿</div>
        <div style={{fontSize:"0.8em",color:"#536471",marginBottom:18,lineHeight:1.5}}>「{post.title||"（タイトルなし）"}」を再投稿します</div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:"0.73em",fontWeight:700,color:"#888",display:"block",marginBottom:4}}>投稿日時</label>
          <input type="datetime-local" value={dt} onChange={e=>setDt(e.target.value)}
            style={{width:"100%",border:"1px solid #e0d8ce",borderRadius:8,padding:"8px 10px",fontSize:"0.84em",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
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
          <button onClick={()=>onRepost(dt,repeat)} style={{flex:1,background:"#f59e0b",border:"none",borderRadius:20,padding:"10px 0",fontWeight:800,fontSize:"0.85em",color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>再投稿を作成</button>
          <button onClick={onClose} style={{border:"1px solid #e0d8ce",background:"none",borderRadius:20,padding:"10px 14px",fontWeight:600,fontSize:"0.85em",color:"#888",cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// 検索モーダル
// ════════════════════════════════════════════════════════
function SearchModal({posts,onClose,onSelect,onRepost}){
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
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:680,maxHeight:"80vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.18)",border:"1px solid #e6dfd6"}}>

        {/* 検索バー */}
        <div style={{padding:"14px 16px",borderBottom:"1px solid #e6dfd6",display:"flex",gap:8,alignItems:"center"}}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#aaa" strokeWidth="2"><circle cx="6.5" cy="6.5" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
          <input ref={inputRef} value={q}
            onChange={e=>setQ(e.target.value)}
            onCompositionStart={()=>{composing.current=true;}}
            onCompositionEnd={e=>{composing.current=false;setQ(e.target.value);}}
            placeholder="タイトル・本文・メモ・ラベルで検索…"
            style={{flex:1,border:"none",outline:"none",fontSize:14,fontFamily:"inherit",color:"#111"}}/>
          {q&&<button onClick={()=>setQ("")} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer",fontSize:16}}>×</button>}
          <button onClick={()=>setShowFilters(v=>!v)}
            style={{display:"flex",alignItems:"center",gap:4,border:`1px solid ${hasFilter?"#111":"#e0d8ce"}`,borderRadius:8,padding:"4px 9px",fontSize:11.5,fontWeight:600,color:hasFilter?"#111":"#888",background:hasFilter?"#f5f0eb":"#fff",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
            絞り込み{hasFilter&&<span style={{background:"#111",color:"#fff",borderRadius:99,width:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,marginLeft:2}}>{[filterPt.length,filterScore.length,filterLabel?1:0,dateFrom||dateTo?1:0].reduce((a,b)=>a+b,0)}</span>}
          </button>
        </div>

        {/* フィルターパネル */}
        {showFilters&&(
          <div style={{padding:"12px 16px",borderBottom:"1px solid #e6dfd6",background:"#faf7f3",display:"flex",flexDirection:"column",gap:10}}>
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
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  style={{border:"1px solid #e0d8ce",borderRadius:6,padding:"4px 7px",fontSize:11,fontFamily:"inherit",outline:"none",color:"#333"}}/>
                <span style={{fontSize:11,color:"#aaa"}}>〜</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  style={{border:"1px solid #e0d8ce",borderRadius:6,padding:"4px 7px",fontSize:11,fontFamily:"inherit",outline:"none",color:"#333"}}/>
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
                      {(p.labels||[]).map(l=><span key={l} style={{fontSize:10,color:"#555",background:"#f5f0eb",border:"1px solid #e0d8ce",padding:"1px 6px",borderRadius:99}}>{l}</span>)}
                      <span style={{fontSize:10,color:"#bbb",marginLeft:"auto"}}>{p.datetime.slice(0,10)}</span>
                    </div>
                  </div>
                  <button onClick={()=>onRepost(p)}
                    style={{border:"1px solid #e0d8ce",background:"none",color:"#888",borderRadius:7,padding:"4px 9px",fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}
                    onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="#f59e0b";}}
                    onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#888";e.currentTarget.style.borderColor="#e0d8ce";}}>
                    再投稿
                  </button>
                </div>
              );
            })}
        </div>

        {/* フッター */}
        <div style={{padding:"9px 16px",borderTop:"1px solid #e6dfd6",fontSize:11.5,color:"#aaa",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>{results.length}件</span>
          <button onClick={onClose} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer",fontFamily:"inherit",fontSize:11.5}}>閉じる (Esc)</button>
        </div>
      </div>
    </div>
  );
}

// ── エディタサイドアイコン（EditorModal外で定義→毎レンダー再マウントを防ぐ） ──
function SideIcon({id,icon,label,sidePanel,setSidePanel}){
  const active=sidePanel===id;
  return(
    <button onClick={()=>setSidePanel(active?null:id)} title={label}
      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"10px 0",border:"none",background:active?"#fef3c7":"none",color:active?"#d97706":"#bbb",cursor:"pointer",width:"100%",borderLeft:active?"3px solid #f59e0b":"3px solid transparent",transition:"all .1s",fontFamily:"inherit"}}
      onMouseEnter={e=>{if(!active){e.currentTarget.style.background="#f5f0eb";e.currentTarget.style.color="#666";}}}
      onMouseLeave={e=>{if(!active){e.currentTarget.style.background="none";e.currentTarget.style.color="#bbb";}}}>
      <span style={{fontSize:"1.1em"}}>{icon}</span>
      <span style={{fontSize:"0.52em",fontWeight:600}}>{label}</span>
    </button>
  );
}

// ════════════════════════════════════════════════════════
// エディタモーダル
// ════════════════════════════════════════════════════════
function EditorModal({post,onSave,onClose}){
  const [draft,setDraft]=useState({...post,memoLinks:post.memoLinks||[],history:post.history||[]});
  const [copyX,setCopyX]=useState(false),[copyNote,setCopyNote]=useState(false);
  const [notionState,setNotionState]=useState("idle"); // idle | saving | done | error
  const [localState,setLocalState]=useState("idle");   // idle | done | error
  const [insertOpen,setInsertOpen]=useState(false),[savedRange,setSavedRange]=useState(null);
  const [sidePanel,setSidePanel]=useState(null);
  const [sideW,setSideW]=useState(248);
  const dragging=useRef(false);
  const bodyEditorRef=useRef(null),articleAreaRef=useRef(null);

  const startResize=e=>{
    e.preventDefault();
    dragging.current=true;
    const startX=e.clientX,startW=sideW;
    const onMove=e=>{if(dragging.current)setSideW(Math.max(180,Math.min(520,startW+(startX-e.clientX))));};
    const onUp=()=>{dragging.current=false;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };

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
    const html=draft.body||"";
    const isThread=/<hr[^>]*class="thread-sep"|data-thread="true"/i.test(html);
    const plain=htmlToPlain(html, isThread);
    copyRichText(html,plain,()=>{
      if(target==="x"){setCopyX(true);setTimeout(()=>setCopyX(false),3500);}
      else{setCopyNote(true);setTimeout(()=>setCopyNote(false),3500);}
    });
  };

  const saveLocalFile=async()=>{
    const content=postToMarkdown(draft);
    const date=draft.datetime.slice(0,10);
    const name=`${date}_${sanitizeFilename(draft.title||"untitled")}.md`;
    try{
      if(FS_SUPPORTED){
        const fh=await window.showSaveFilePicker({
          suggestedName:name,
          types:[{description:"Markdown",accept:{"text/markdown":[".md"]}}],
        });
        const w=await fh.createWritable();
        await w.write(content);
        await w.close();
      }else{
        const blob=new Blob([content],{type:"text/plain;charset=utf-8"});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=name;a.click();
        URL.revokeObjectURL(url);
      }
      setLocalState("done");
      setTimeout(()=>setLocalState("idle"),3000);
    }catch(e){
      if(e.name==="AbortError")return; // キャンセルは無視
      setLocalState("error");
      setTimeout(()=>setLocalState("idle"),3000);
    }
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

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:14}}>
      {insertOpen&&<InsertModal onClose={()=>setInsertOpen(false)} savedRange={savedRange} bodyRef={bodyEditorRef}/>}
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:1100,height:"calc(100vh - 28px)",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px #00000030"}}>

        {/* ヘッダー */}
        <div style={{display:"flex",alignItems:"center",padding:"0 14px",borderBottom:"1px solid #e6dfd6",background:"#fff",height:50,gap:7,flexShrink:0}}>
          <select value={draft.postType} onChange={e=>setDraft(d=>({...d,postType:e.target.value}))}
            style={{border:`1.5px solid ${pt.border}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:pt.color,background:pt.bg,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
            {Object.entries(POST_TYPE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))}
            style={{border:`1.5px solid ${st?.border}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:st?.text,background:st?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="datetime-local" value={draft.datetime} onChange={e=>setDraft(d=>({...d,datetime:e.target.value}))}
            style={{border:"1px solid #e0d8ce",borderRadius:8,padding:"4px 8px",fontSize:11,color:"#555",fontFamily:"inherit",outline:"none"}}/>
          <div style={{flex:1}}/>
          {/* Notion連携はCloudflare移行に伴い一時無効化
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
          */}
          <button onClick={saveLocalFile}
            style={{
              background:localState==="done"?"#00ba7c":localState==="error"?"#ef4444":"#4b5563",
              color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",
              transition:"background .2s",display:"flex",alignItems:"center",gap:5,
            }}>
            {localState==="done"?"✅ 保存完了":localState==="error"?"❌ 失敗":"💾 ローカルに保存"}
          </button>
          <button onClick={()=>doCopy("note")} style={{background:copyNote?"#00ba7c":"#41c9b4",color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"background .2s"}}>{copyNote?"✅ 完了":"note にコピー"}</button>
          <button onClick={()=>doCopy("x")} style={{background:copyX?"#00ba7c":"#1d9bf0",color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"background .2s"}}>{copyX?"✅ 完了":"𝕏 にコピー"}</button>
          <div style={{width:1,height:20,background:"#e6dfd6"}}/>
          <button onClick={handleSave} style={{background:"#f59e0b",border:"none",borderRadius:20,padding:"6px 16px",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>保存</button>
          <button onClick={onClose} style={{background:"none",border:"1px solid #e0d8ce",borderRadius:20,padding:"6px 11px",fontSize:12,fontWeight:600,color:"#888",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
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
                  style={{width:"100%",border:"none",outline:"none",fontSize:28,fontWeight:800,lineHeight:1.25,color:"#0f1419",fontFamily:XFONT,marginBottom:18,paddingBottom:18,borderBottom:"1px solid #e6dfd6",background:"transparent",display:"block",boxSizing:"border-box"}}/>
                <BodyEditor value={draft.body} onChange={body=>setDraft(d=>({...d,body}))} editorRef={bodyEditorRef}/>
              </div>
            </div>
            <div style={{padding:"4px 50px",borderTop:"1px solid #e6dfd6",background:"#f5f0eb",fontSize:"0.67em",color:"#aaa",flexShrink:0}}>
              {((draft.title||"")+(draft.body||"").replace(/<[^>]+>/g,"")).length.toLocaleString()} 文字
            </div>
          </div>

          {/* アイコン列 */}
          <div style={{width:50,borderLeft:"1px solid #e6dfd6",background:"#fafafa",display:"flex",flexDirection:"column",flexShrink:0}}>
            <SideIcon id="meta" icon="⚙️" label="設定" sidePanel={sidePanel} setSidePanel={setSidePanel}/>
            <SideIcon id="history" icon="📋" label="履歴" sidePanel={sidePanel} setSidePanel={setSidePanel}/>
            <SideIcon id="share" icon="🔗" label="共有" sidePanel={sidePanel} setSidePanel={setSidePanel}/>
          </div>

          {/* サイドパネル展開 */}
          {sidePanel&&(
            <>
              {/* リサイズハンドル（アイコン列とパネルの境界） */}
              <div onMouseDown={startResize}
                style={{width:4,cursor:"col-resize",background:"transparent",flexShrink:0,transition:"background .15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#e0d8ce"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}/>
              <div style={{width:sideW,borderLeft:"1px solid #e6dfd6",background:"#fafafa",display:"flex",flexDirection:"column",flexShrink:0}}>
              <div style={{padding:"11px 13px 9px",borderBottom:"1px solid #e6dfd6",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff"}}>
                <span style={{fontWeight:700,fontSize:"0.84em",color:"#0f1419"}}>{sidePanel==="meta"?"設定":sidePanel==="history"?"編集履歴":"共有"}</span>
                <button onClick={()=>setSidePanel(null)} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer"}}>✕</button>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:13}}>
                {sidePanel==="meta"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {/* ラベル */}
                    <div>
                      <label style={{fontSize:"0.7em",fontWeight:700,color:"#888",display:"block",marginBottom:5}}>ラベル</label>
                      <LabelEditor labels={draft.labels||[]} onChange={labels=>setDraft(d=>({...d,labels}))}/>
                    </div>
                    <div>
                      <label style={{fontSize:"0.7em",fontWeight:700,color:"#888",display:"block",marginBottom:5}}>概要メモ・リンク</label>
                      <MemoEditor memo={draft.memo} memoLinks={draft.memoLinks} onChange={({memo,memoLinks})=>setDraft(d=>({...d,memo,memoLinks}))}/>
                    </div>
                    {(draft.comments||[]).length>0&&(
                      <div>
                        <label style={{fontSize:"0.7em",fontWeight:700,color:"#888",display:"block",marginBottom:5}}>コメント ({draft.comments.length})</label>
                        {draft.comments.map((c,i)=>(
                          <div key={i} style={{background:"#fff",border:"1px solid #e6dfd6",borderRadius:7,padding:"6px 9px",fontSize:"0.77em",color:"#444",lineHeight:1.6,marginBottom:4}}>{typeof c==="string"?c:c.text}</div>
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
                          {i<arr.length-1&&<div style={{width:1,height:20,background:"#e6dfd6",margin:"3px 0"}}/>}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// プレビューオーバーレイ
// ════════════════════════════════════════════════════════
function PreviewOverlay({post,onClose,onEdit,onRepost,onDuplicate,onDelete,onSaveComment,onChangeStatus,onSaveMeta,onChangePostType,onSaveNew}){
  const [cmt,setCmt]=useState("");
  const [localComments,setLocalComments]=useState(post.comments||[]);
  const [showComments,setShowComments]=useState(false);
  const [memo,setMemo]=useState(post.memo||"");
  const [memoLinks,setMemoLinks]=useState((post.memoLinks||[]).map(l=>typeof l==="string"?{label:"",url:l}:l));
  const [linkInput,setLinkInput]=useState("");
  const [labelInput,setLabelInput]=useState("");
  const [metaDirty,setMetaDirty]=useState(false);
  const [sideW,setSideW]=useState(280);
  const dragging=useRef(false);
  const titleRef=useRef(null);
  const pt=POST_TYPE[post.postType||"x_post"]||POST_TYPE.x_post;
  const st=STATUS[post.status];

  const getEditPost=()=>({...post,title:titleRef.current?.value??post.title,memo,memoLinks});

  useEffect(()=>{
    setLocalComments(post.comments||[]);
    setMemo(post.memo||"");
    setMemoLinks((post.memoLinks||[]).map(l=>typeof l==="string"?{label:"",url:l}:l));
    setMetaDirty(false);
  },[post]);
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  // サイドバーリサイズ
  const startResize=e=>{
    e.preventDefault();
    dragging.current=true;
    const startX=e.clientX,startW=sideW;
    const onMove=e=>{if(dragging.current)setSideW(Math.max(200,Math.min(520,startW+(startX-e.clientX))));};
    const onUp=()=>{dragging.current=false;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };

  const addComment=()=>{
    if(!cmt.trim())return;
    const c={text:cmt.trim(),at:nowStr()};
    const next=[...localComments,c];
    setLocalComments(next);
    onSaveComment(post.id,next);
    setCmt("");
  };

  const addLink=()=>{
    const url=linkInput.trim();
    if(!isUrl(url))return;
    setMemoLinks(prev=>[...prev,{label:labelInput.trim(),url}]);
    setLinkInput("");setLabelInput("");setMetaDirty(true);
  };

  // メモ箇条書き挿入
  const memoRef=useRef(null);
  const memoComposing=useRef(false);
  const insertBullet=()=>{
    const el=memoRef.current;if(!el)return;
    const start=el.selectionStart,end=el.selectionEnd;
    const before=memo.slice(0,start),after=memo.slice(end);
    const lineStart=before.lastIndexOf("\n")+1;
    const linePrefix=before.slice(lineStart);
    const insert=linePrefix.startsWith("・")?"":"\n・";
    const next=before+(start===0?"・":insert)+after;
    setMemo(next);setMetaDirty(true);
    setTimeout(()=>{el.focus();const pos=start+(start===0?1:insert.length);el.setSelectionRange(pos,pos);},0);
  };

  const handleSaveMeta=()=>{
    onSaveMeta(post.id,{memo,memoLinks});
    setMetaDirty(false);
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:900,maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px #00000035"}}>

        {/* ヘッダー */}
        <div style={{padding:"14px 18px 12px",borderBottom:"1px solid #e6dfd6",background:"#fff",display:"flex",alignItems:"flex-start",gap:10,flexShrink:0}}>
          <div style={{flex:1,minWidth:0}}>

            {/* タイトル */}
            <div style={{fontSize:18,fontWeight:800,color:"#111",lineHeight:1.3,marginBottom:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {post._unsaved
                ? <input ref={titleRef} autoFocus defaultValue={post.title||""} placeholder="タイトルを入力…"
                    onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}}
                    style={{width:"100%",border:"none",borderBottom:"2px solid #f59e0b",outline:"none",fontSize:18,fontWeight:800,color:"#111",background:"transparent",fontFamily:"inherit",padding:"2px 0"}}/>
                : post.title||"（タイトルなし）"
              }
            </div>

            {/* タグ行 */}
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>

              {/* メディアタイプ */}
              <TagSelector
                label="メディアタイプ"
                disabled={!!post._unsaved}
                selected={post.postType||"x_post"}
                options={Object.entries(POST_TYPE).map(([k,v])=>({value:k,label:v.label,color:v.color,bg:v.bg,border:v.border,dot:v.dot}))}
                onChange={v=>v&&!post._unsaved&&onChangePostType(post.id,v)}
                badge={
                  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:pt.bg,border:`1.5px solid ${pt.border}`,fontSize:11,fontWeight:700,color:pt.color,cursor:"pointer"}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:pt.dot,flexShrink:0}}/>
                    {pt.label}
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
                  </span>
                }
              />

              {/* スコア */}
              <TagSelector
                label="スコア"
                selected={post.score||null}
                options={Object.entries(SCORE).map(([k,v])=>({value:k,label:`${k} スコア`,color:v.color,bg:v.bg,swatch:v.bg}))}
                onChange={v=>onChangeStatus(post.id,post.status,v||null)}
                onClear={()=>onChangeStatus(post.id,post.status,null)}
                badge={
                  post.score
                    ? <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:SCORE[post.score]?.bg,border:`1.5px solid ${SCORE[post.score]?.bg}`,fontSize:11,fontWeight:800,color:SCORE[post.score]?.color,cursor:"pointer"}}>
                        {post.score}
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
                      </span>
                    : <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:"#f5f0eb",border:"1.5px solid #e0d8ce",fontSize:11,fontWeight:600,color:"#a8a09a",cursor:"pointer"}}>
                        スコア
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
                      </span>
                }
              />

              {/* ラベル */}
              <TagSelector
                label="ラベル"
                multi
                selected={post.labels||[]}
                options={(post.labels||[]).map(l=>({value:l,label:l}))}
                onChange={labels=>onSaveMeta(post.id,{memo:post.memo,memoLinks:post.memoLinks,labels})}
                onClear={()=>onSaveMeta(post.id,{memo:post.memo,memoLinks:post.memoLinks,labels:[]})}
                allowNew
                onAdd={l=>{
                  const next=[...new Set([...(post.labels||[]),l])];
                  onSaveMeta(post.id,{memo:post.memo,memoLinks:post.memoLinks,labels:next});
                }}
                badge={
                  (post.labels||[]).length>0
                    ? <div style={{display:"inline-flex",alignItems:"center",gap:3,flexWrap:"wrap",cursor:"pointer"}}>
                        {(post.labels||[]).map((l,i)=>(
                          <span key={i} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:99,background:"#f5f0eb",border:"1.5px solid #e0d8ce",fontSize:11,fontWeight:600,color:"#555"}}>
                            {l}
                            <span onClick={e=>{e.stopPropagation();const next=(post.labels||[]).filter((_,j)=>j!==i);onSaveMeta(post.id,{memo:post.memo,memoLinks:post.memoLinks,labels:next});}}
                              style={{cursor:"pointer",color:"#bbb",fontSize:12,lineHeight:1,marginLeft:1}}>×</span>
                          </span>
                        ))}
                        <span style={{display:"inline-flex",alignItems:"center",padding:"3px 7px",borderRadius:99,background:"#f5f0eb",border:"1.5px dashed #e0d8ce",fontSize:11,color:"#bbb"}}>
                          +
                        </span>
                      </div>
                    : <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:"#f5f0eb",border:"1.5px dashed #e0d8ce",fontSize:11,fontWeight:600,color:"#a8a09a",cursor:"pointer"}}>
                        + ラベル
                      </span>
                }
              />

              <span style={{fontSize:11,color:"#c4bab0",marginLeft:2}}>{post.datetime.replace("T"," ")}</span>
            </div>
          </div>

          {/* 右側ボタン群 */}
          <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end",alignItems:"center"}}>
            {post._unsaved&&<span style={{fontSize:10,fontWeight:700,color:"#f59e0b",background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:99,padding:"2px 8px"}}>新規</span>}
            {!post._unsaved&&(
              <select value={post.status} onChange={e=>onChangeStatus(post.id,e.target.value,post.score)}
                style={{border:`1.5px solid ${st?.border}`,borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:700,color:st?.text,background:st?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            )}
            {post._unsaved&&(
              <button onClick={()=>onSaveNew(getEditPost())}
                style={{background:"#10b981",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
                保存
              </button>
            )}
            <button onClick={()=>onEdit(getEditPost())} style={{background:"#f59e0b",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
              {post._unsaved?"編集して作成":"編集"}
            </button>
            {!post._unsaved&&<button onClick={()=>onDuplicate(post)} style={{background:"none",border:"1px solid #e0d8ce",borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:600,color:"#555",cursor:"pointer",fontFamily:"inherit"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f5f0eb"} onMouseLeave={e=>e.currentTarget.style.background="none"}>複製</button>}
            {!post._unsaved&&<button onClick={()=>onRepost(post)} style={{background:"none",border:"1px solid #e0d8ce",borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:600,color:"#555",cursor:"pointer",fontFamily:"inherit"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="#f59e0b";}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#555";e.currentTarget.style.borderColor="#e0d8ce";}}>再投稿</button>}
            {!post._unsaved&&<button onClick={()=>onDelete(post)} style={{background:"none",border:"1px solid #fca5a5",borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:600,color:"#ef4444",cursor:"pointer",fontFamily:"inherit"}}
              onMouseEnter={e=>e.currentTarget.style.background="#fef2f2"} onMouseLeave={e=>e.currentTarget.style.background="none"}>削除</button>}
            <button onClick={onClose} style={{background:"none",border:"1px solid #e0d8ce",borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:600,color:"#888",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
          </div>
        </div>

        {/* コンテンツ */}
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* 本文 */}
          <div style={{flex:1,overflowY:"auto",padding:"20px 28px"}}>
            <div className="xb" dangerouslySetInnerHTML={{__html:post.body||"<p style='color:#aaa'>本文はまだありません</p>"}}/>
          </div>

          {/* リサイズハンドル */}
          <div onMouseDown={startResize}
            style={{width:5,cursor:"col-resize",background:"transparent",flexShrink:0,transition:"background .1s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#e0d8ce"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}/>

          {/* 右サイドパネル */}
          <div style={{width:sideW,borderLeft:"1px solid #e6dfd6",display:"flex",flexDirection:"column",flexShrink:0,background:"#fafafa",overflowY:"auto"}}>

            {/* ラベル */}
            {(post.labels||[]).length>0&&(
              <div style={{padding:"10px 14px",borderBottom:"1px solid #e6dfd6"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:6}}>ラベル</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {(post.labels||[]).map((l,i)=>(
                    <span key={i} style={{fontSize:11,color:"#555",background:"#f5f0eb",border:"1px solid #e0d8ce",borderRadius:99,padding:"2px 9px",fontWeight:600}}>{l}</span>
                  ))}
                </div>
              </div>
            )}

            {/* メモ */}
            <div style={{padding:"12px 14px",borderBottom:"1px solid #e6dfd6"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:700,color:"#888"}}>📝 メモ</span>
                <button onClick={insertBullet} title="箇条書きを挿入"
                  style={{border:"1px solid #e0d8ce",background:"#fff",borderRadius:5,padding:"2px 7px",fontSize:10,fontWeight:700,color:"#555",cursor:"pointer",fontFamily:"inherit"}}>
                  ・ 箇条書き
                </button>
              </div>
              <textarea ref={memoRef} value={memo}
                onChange={e=>{setMemo(e.target.value);setMetaDirty(true);}}
                onCompositionStart={()=>{memoComposing.current=true;}}
                onCompositionEnd={()=>{memoComposing.current=false;}}
                rows={5}
                placeholder={"執筆の意図・注意点など\n・箇条書きも使えます"}
                onKeyDown={e=>{
                  if(memoComposing.current)return;
                  if(e.key==="Tab"){
                    e.preventDefault();
                    const el=e.currentTarget;
                    const start=el.selectionStart,end=el.selectionEnd;
                    const lineStart=memo.slice(0,start).lastIndexOf("\n")+1;
                    const lineEnd=memo.indexOf("\n",start);
                    const line=memo.slice(lineStart,lineEnd===-1?undefined:lineEnd);
                    if(line.trimStart().startsWith("・")){
                      const dedent=e.shiftKey&&line.startsWith("　");
                      const newLine=dedent?line.slice(1):"　"+line;
                      const next=memo.slice(0,lineStart)+newLine+memo.slice(lineEnd===-1?memo.length:lineEnd);
                      setMemo(next);setMetaDirty(true);
                      const diff=dedent?-1:1;
                      setTimeout(()=>{el.focus();el.setSelectionRange(start+diff,start+diff);},0);
                    } else {
                      const next=memo.slice(0,start)+"　"+memo.slice(end);
                      setMemo(next);setMetaDirty(true);
                      setTimeout(()=>{el.focus();el.setSelectionRange(start+1,start+1);},0);
                    }
                    return;
                  }
                  if(e.key==="Enter"){
                    const el=e.currentTarget;
                    const start=el.selectionStart;
                    const lineStart=memo.slice(0,start).lastIndexOf("\n")+1;
                    if(memo.slice(lineStart,lineStart+1)==="・"){
                      e.preventDefault();
                      const next=memo.slice(0,start)+"\n・"+memo.slice(start);
                      setMemo(next);setMetaDirty(true);
                      setTimeout(()=>{el.focus();el.setSelectionRange(start+2,start+2);},0);
                    }
                  }
                }}
                style={{width:"100%",border:"1px solid #e0d8ce",borderRadius:8,padding:"7px 9px",fontSize:"0.77em",fontFamily:"inherit",color:"#1a1a1a",outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:1.7,background:"#fff"}}
                onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
            </div>

            {/* リンク */}
            <div style={{padding:"12px 14px",borderBottom:"1px solid #e6dfd6"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:6}}>🔗 リンク</div>
              {memoLinks.length>0&&(
                <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
                  {memoLinks.map((l,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:5,background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:7,padding:"4px 8px"}}>
                      <div style={{flex:1,minWidth:0}}>
                        {l.label&&<div style={{fontSize:"0.68em",fontWeight:700,color:"#0369a1"}}>{l.label}</div>}
                        <a href={l.url} target="_blank" rel="noreferrer" style={{fontSize:"0.68em",color:"#0369a1",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{l.url}</a>
                      </div>
                      <button onClick={()=>{setMemoLinks(prev=>prev.filter((_,j)=>j!==i));setMetaDirty(true);}}
                        style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:"0.8em",flexShrink:0}}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <input value={labelInput} onChange={e=>setLabelInput(e.target.value)} placeholder="ラベル（任意）"
                style={{width:"100%",border:"1px solid #e0d8ce",borderRadius:7,padding:"5px 8px",fontSize:"0.73em",fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:4,background:"#fff"}}
                onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
              <div style={{display:"flex",gap:4}}>
                <input value={linkInput} onChange={e=>setLinkInput(e.target.value)} placeholder="URLを貼り付け"
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.isComposing)addLink();}}
                  onPaste={e=>{const v=e.clipboardData.getData("text").trim();if(isUrl(v)){e.preventDefault();setLinkInput(v);}}}
                  style={{flex:1,border:"1px solid #e0d8ce",borderRadius:7,padding:"5px 8px",fontSize:"0.73em",fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:"#fff"}}
                  onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
                <button onClick={addLink} disabled={!isUrl(linkInput.trim())}
                  style={{background:isUrl(linkInput.trim())?"#0369a1":"#e0d8ce",border:"none",borderRadius:7,padding:"5px 8px",fontSize:"0.73em",fontWeight:700,color:"#fff",cursor:isUrl(linkInput.trim())?"pointer":"default",fontFamily:"inherit",flexShrink:0}}>＋</button>
              </div>
            </div>

            {/* 保存ボタン */}
            {metaDirty&&!post._unsaved&&(
              <div style={{padding:"10px 14px",borderBottom:"1px solid #e6dfd6"}}>
                <button onClick={handleSaveMeta}
                  style={{width:"100%",background:"#f59e0b",border:"none",borderRadius:8,padding:"7px 0",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
                  メモ・リンクを保存
                </button>
              </div>
            )}

            {/* コメント（折りたたみ） */}
            <div style={{padding:"10px 14px"}}>
              <button onClick={()=>setShowComments(v=>!v)}
                style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",padding:0}}>
                <span style={{fontSize:11,fontWeight:700,color:"#888"}}>💬 コメント ({localComments.length})</span>
                <span style={{fontSize:10,color:"#bbb"}}>{showComments?"▲":"▼"}</span>
              </button>
              {showComments&&(
                <div style={{marginTop:8}}>
                  {localComments.length===0&&<div style={{fontSize:"0.75em",color:"#ccc",textAlign:"center",padding:"10px 0"}}>コメントなし</div>}
                  {localComments.map((c,i)=>(
                    <div key={i} style={{background:"#fff",border:"1px solid #e6dfd6",borderRadius:7,padding:"6px 9px",marginBottom:5}}>
                      <div style={{fontSize:"0.75em",color:"#444",lineHeight:1.5}}>{typeof c==="string"?c:c.text}</div>
                      {c.at&&<div style={{fontSize:"0.65em",color:"#aaa",marginTop:2}}>{new Date(c.at).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>}
                    </div>
                  ))}
                  <div style={{display:"flex",gap:5,marginTop:6}}>
                    <input value={cmt} onChange={e=>setCmt(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.isComposing)addComment();}}
                      placeholder="コメントを追加…"
                      style={{flex:1,background:"#fff",border:"1px solid #e0d8ce",borderRadius:7,padding:"6px 8px",fontSize:"0.73em",outline:"none",fontFamily:"inherit"}}
                      onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
                    <button onClick={addComment} style={{background:"#f59e0b",border:"none",borderRadius:7,padding:"6px 9px",fontSize:"0.73em",fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>追加</button>
                  </div>
                </div>
              )}
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
      <div style={{background:"#fff",border:"1px solid #e6dfd6",borderRadius:17,width:"100%",maxWidth:520,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000025"}}>
        <div style={{padding:"15px 20px",borderBottom:"1px solid #e6dfd6",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f5f0eb"}}>
          <div>
            <div style={{fontSize:15,fontWeight:900}}>クライアント管理</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:2}}>名前・カラーを編集できます</div>
          </div>
          <Btn onClick={onClose}>閉じる</Btn>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          {accounts.map(acc=>(
            <div key={acc.id} style={{background:"#f5f0eb",border:"1px solid #e6dfd6",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
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
                  <div style={{background:"#fff",border:"1px solid #e6dfd6",borderRadius:7,padding:"6px 10px",fontSize:11,color:"#bbb",fontFamily:"monospace",marginBottom:10,wordBreak:"break-all"}}>
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
const {isClient:_isClient,accountId:_urlAccountId}=getUrlParams();

function App({uid}){
  const isClient=_isClient,urlAccountId=_urlAccountId;
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
  const [slots,              setSlots]              = useState([]); // 予約枠 [{id,dow,hour,postType}]
  const [showSlotSettings,   setShowSlotSettings]   = useState(false);
  const [dragId,             setDragId]             = useState(null); // ⑧ DnD
  const [dragOver,           setDragOver]           = useState(null); // ⑧ ドラッグ中セルkey
  const [showNotifySettings, setShowNotifySettings] = useState(false); // メール通知設定
  const [notifySettings,     setNotifySettings]     = useState(null); // {email,notify_overdue,notify_today,notify_daily,send_hour,enabled}
  const [showExport,         setShowExport]         = useState(false);
  const [showAIExport,       setShowAIExport]       = useState(false);
  const shareRef=useRef(null);
  useEffect(()=>{
    if(!showShare)return;
    const h=e=>{if(shareRef.current&&!shareRef.current.contains(e.target))setShowShare(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[showShare]);

  const [today,setToday]=useState(()=>fmtDate(new Date()));
  const [nowDt,setNowDt] =useState(()=>new Date().toISOString().slice(0,16));
  useEffect(()=>{
    const tick=()=>{
      setToday(fmtDate(new Date()));
      setNowDt(new Date().toISOString().slice(0,16));
    };
    const id=setInterval(tick,60000);
    return()=>clearInterval(id);
  },[]);
  const weekDates   =React.useMemo(()=>getWeekDates(week),[week]);
  const weekDateStrs=React.useMemo(()=>weekDates.map(fmtDate),[weekDates]);
  const activeAcc=React.useMemo(()=>accounts.find(a=>a.id===activeAccId),[accounts,activeAccId]);
  const posts    =React.useMemo(()=>allPosts[activeAccId]||[],[allPosts,activeAccId]);
  const filtered =React.useMemo(()=>filterStatus==="all"?posts:posts.filter(p=>p.status===filterStatus),[posts,filterStatus]);
  // ⑨ 未投稿アラート：予約済みのまま期限が過ぎた投稿数
  const overdueCount=React.useMemo(()=>
    posts.filter(p=>p.status===OVERDUE_STATUS&&p.datetime<=nowDt).length
  ,[posts,nowDt]);

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

  const showToast=React.useCallback((msg)=>{setToast(msg);setTimeout(()=>setToast(null),2500);},[]);

  // ── DB保存（内部共通） ──
  const saveToDb=React.useCallback(async(p)=>{
    const {_unsaved,...cleanP}=p; // _unsavedフラグをstate・DBから除去
    const record={
      id:cleanP.id,account_id:activeAccId,
      title:cleanP.title,status:cleanP.status,
      post_type:cleanP.postType||"x_post",
      datetime:cleanP.datetime,
      body:cleanP.body||"",
      memo:cleanP.memo||"",
      memo_links:cleanP.memoLinks||[],
      comments:cleanP.comments||[],
      history:cleanP.history||[],
      score:cleanP.score||null,
      labels:cleanP.labels||[],
    };
    const{error}=await supabase.from("posts").upsert(record);
    if(error){showToast("保存に失敗しました");return false;}
    setAllPosts(prev=>{
      const cur=prev[activeAccId]||[];
      const exists=cur.find(x=>x.id===cleanP.id);
      return{...prev,[activeAccId]:exists?cur.map(x=>x.id===cleanP.id?cleanP:x):[...cur,cleanP]};
    });
    return true;
  },[activeAccId,showToast]);

  const save=React.useCallback(async(p)=>{
    const ok=await saveToDb(p);
    if(!ok)return;
    setEditing(null);setPreview(p);
    showToast("保存しました ✅");
  },[saveToDb,showToast]);

  const del=React.useCallback(async(id)=>{
    const{error}=await supabase.from("posts").delete().eq("id",id);
    if(error){showToast("削除に失敗しました");return;}
    setAllPosts(prev=>({...prev,[activeAccId]:(prev[activeAccId]||[]).filter(p=>p.id!==id)}));
    setPreview(null);setDeleteConfirm(null);
    showToast("削除しました 🗑️");
  },[activeAccId,showToast]);

  const changeStatus=React.useCallback(async(id,s,score)=>{
    const update={status:s,score:score!==undefined?score:null};
    const{error}=await supabase.from("posts").update(update).eq("id",id);
    if(error){showToast("更新に失敗しました");return;}
    setAllPosts(prev=>({...prev,[activeAccId]:(prev[activeAccId]||[]).map(p=>p.id===id?{...p,...update}:p)}));
    setPreview(prev=>prev&&prev.id===id?{...prev,...update}:prev);
  },[activeAccId,showToast]);

  const changePostType=React.useCallback(async(id,postType)=>{
    const{error}=await supabase.from("posts").update({post_type:postType}).eq("id",id);
    if(error){showToast("更新に失敗しました");return;}
    setAllPosts(prev=>({...prev,[activeAccId]:(prev[activeAccId]||[]).map(p=>p.id===id?{...p,postType}:p)}));
    setPreview(prev=>prev&&prev.id===id?{...prev,postType}:prev);
  },[activeAccId,showToast]);

  const saveMeta=React.useCallback(async(id,{memo,memoLinks,labels})=>{
    const update={memo,memo_links:memoLinks};
    if(labels!==undefined)update.labels=labels;
    const{error}=await supabase.from("posts").update(update).eq("id",id);
    if(error){showToast("保存に失敗しました");return;}
    const patch={memo,memoLinks,...(labels!==undefined?{labels}:{})};
    setAllPosts(prev=>({...prev,[activeAccId]:(prev[activeAccId]||[]).map(p=>p.id===id?{...p,...patch}:p)}));
    setPreview(prev=>prev&&prev.id===id?{...prev,...patch}:prev);
  },[activeAccId,showToast]);

  const saveComment=React.useCallback(async(id,comments)=>{
    const{error}=await supabase.from("posts").update({comments}).eq("id",id);
    if(error){showToast("コメントの保存に失敗しました");return;}
    setAllPosts(prev=>({...prev,[activeAccId]:(prev[activeAccId]||[]).map(p=>p.id===id?{...p,comments}:p)}));
    setPreview(prev=>prev&&prev.id===id?{...prev,comments}:prev);
  },[activeAccId,showToast]);

  const handleRepost=React.useCallback(async(p,dt,repeat)=>{
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
  },[saveToDb,showToast]);

  const handleDuplicate=React.useCallback(async(p)=>{
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
  },[saveToDb,showToast]);

  const addAccount=React.useCallback(async()=>{
    const id="acc_"+Date.now();
    const acc={id,name:"新規クライアント",handle:"@handle",color:"#6b7280"};
    const{error}=await supabase.from("accounts").insert(acc);
    if(error){showToast("追加に失敗しました");return;}
    setAccounts(prev=>[...prev,acc]);
    setAllPosts(prev=>({...prev,[id]:[]}));
    setActiveAccId(id);setShowAccountSettings(true);
  },[showToast]);

  const updateAccount=React.useCallback(async(id,fields)=>{
    const{error}=await supabase.from("accounts").update(fields).eq("id",id);
    if(error){showToast("更新に失敗しました");return;}
    setAccounts(prev=>prev.map(a=>a.id===id?{...a,...fields}:a));
  },[showToast]);

  const deleteAccount=React.useCallback(async(id)=>{
    setAccounts(prev=>{
      if(prev.length<=1){showToast("最後のアカウントは削除できません");return prev;}
      return prev; // 非同期処理はsetAccountsの外でやるため、ここでは何もしない
    });
    // 改めて現在のaccountsを参照するため非同期処理はuseRefで管理せずシンプルに実施
    const cur=await supabase.from("accounts").select("*").order("created_at").then(r=>r.data||[]);
    if(cur.length<=1){showToast("最後のアカウントは削除できません");return;}
    const{error}=await supabase.from("accounts").delete().eq("id",id);
    if(error){showToast("削除に失敗しました");return;}
    const remaining=cur.filter(a=>a.id!==id);
    setAccounts(remaining);
    setAllPosts(prev=>{const n={...prev};delete n[id];return n;});
    setActiveAccId(prev=>prev===id?remaining[0]?.id:prev);
  },[showToast]);

  const copyShareLink=React.useCallback((accId)=>{
    const base=window.location.href.split("?")[0];
    navigator.clipboard.writeText(`${base}?account=${accId}`)
      .then(()=>showToast("共有リンクをコピーしました"))
      .catch(()=>showToast("コピー完了"));
  },[showToast]);
  const openNew=React.useCallback((datetime,{title="",postType="x_post"}={})=>{
    const newPost={id:genId(),title,status:"draft",postType,datetime:datetime||`${today}T07:00`,body:"",memo:"",memoLinks:[],comments:[],history:[],labels:[],_unsaved:true};
    setPreview(newPost);
  },[today]);

  // 予約枠 — Supabaseで user_id + account_id ごとに管理
  useEffect(()=>{
    if(!activeAccId||!uid)return;
    supabase.from("slots").select("*")
      .eq("account_id",activeAccId).eq("user_id",uid)
      .then(({data,error})=>{
        if(error){console.error("slots load error:",error);return;}
        setSlots((data||[]).map(s=>({
          ...s,
          postType:s.post_type||s.postType||"x_post",
          time:s.time||(s.hour!=null?String(s.hour).padStart(2,"0")+":00":null),
        })));
      });
  },[activeAccId,uid]);

  const slotsRef=useRef(slots);
  useEffect(()=>{slotsRef.current=slots;},[slots]);

  const saveSlots=React.useCallback(async(next)=>{
    const prev=slotsRef.current;
    const resolved=typeof next==="function"?next(prev):next;
    setSlots(resolved);
    if(!activeAccId||!uid)return;
    const prevIds=new Set(prev.map(s=>s.id));
    const nextIds=new Set(resolved.map(s=>s.id));
    const deleted=[...prevIds].filter(id=>!nextIds.has(id));
    if(deleted.length>0){
      const{error:delErr}=await supabase.from("slots").delete().in("id",deleted);
      if(delErr)console.error("slots delete error:",delErr);
    }
    if(resolved.length>0){
      const records=resolved.map(s=>({
        id:s.id,
        account_id:activeAccId,
        user_id:uid,
        type:s.type||"weekly",
        dow:s.dow??null,
        nth:s.nth??null,
        time:s.time||(s.hour!=null?String(s.hour).padStart(2,"0")+":00":null),
        post_type:s.postType||s.post_type||"x_post",
        title:s.title||"",
      }));
      const{error:upsErr}=await supabase.from("slots").upsert(records);
      if(upsErr){
        console.error("slots upsert error:",upsErr);
        showToast("予約枠の保存に失敗しました");
      }
    }
  },[activeAccId,uid,showToast]);

  // ⑧ ドラッグ&ドロップ：投稿を別セルにドロップして日時変更
  const handleDrop=React.useCallback(async(postId,dateStr,hour)=>{
    const p=posts.find(x=>x.id===postId);
    if(!p)return;
    const newDt=`${dateStr}T${String(hour).padStart(2,"0")}:00`;
    if(p.datetime===newDt)return;
    const updated={...p,datetime:newDt,history:[...(p.history||[]),{at:nowStr(),note:`${p.datetime}→${newDt} (DnD)`}]};
    await saveToDb(updated);
    showToast("日時を変更しました 📅");
    setDragId(null);setDragOver(null);
  },[posts,saveToDb,showToast]);

  const saveNotifySettings=React.useCallback(async(s)=>{
    setNotifySettings(s);
    await supabase.from("notification_settings").upsert({...s,account_id:activeAccId});
    showToast("通知設定を保存しました ✅");
  },[activeAccId,showToast]);

  // メール通知設定ロード
  useEffect(()=>{
    if(!activeAccId)return;
    supabase.from("notification_settings").select("*").eq("account_id",activeAccId).single()
      .then(({data})=>{
        if(data)setNotifySettings(data);
        else setNotifySettings({account_id:activeAccId,email:"",notify_overdue:true,notify_today:true,notify_daily:false,send_hour:8,enabled:false});
      });
  },[activeAccId]);

  const handleTestSend=React.useCallback(async(email)=>{
    if(!email){alert("メールアドレスを入力してください");return;}
    try{
      const res=await fetch("/api/cron-notify",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({accountId:activeAccId,testMode:true,email}),
      });
      const d=await res.json();
      if(res.ok)showToast("テストメールを送信しました ✅");
      else alert("送信失敗:\n"+(d.error||JSON.stringify(d)));
    }catch(e){
      alert("通信エラー: "+e.message);
    }
  },[activeAccId,showToast]);


  useEffect(()=>{
    const h=e=>{
      // ⌘K 検索
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setShowSearch(true);return;}
      // 入力中・修飾キーは無視
      const tag=e.target.tagName;
      if(tag==="INPUT"||tag==="TEXTAREA"||e.target.contentEditable==="true")return;
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      switch(e.key){
        case"n":case"N": e.preventDefault();openNew();break;
        case"ArrowLeft":
          if(view==="calendar"){e.preventDefault();setWeek(d=>{const x=new Date(d);x.setDate(x.getDate()-7);return x;});}
          break;
        case"ArrowRight":
          if(view==="calendar"){e.preventDefault();setWeek(d=>{const x=new Date(d);x.setDate(x.getDate()+7);return x;});}
          break;
        case"c":case"C": e.preventDefault();setView(v=>v==="calendar"?"month":v==="month"?"list":"calendar");break;
        case"e":case"E":
          if(preview){e.preventDefault();setPreview(null);setEditing({...preview});}
          break;
        case"Escape": setPreview(null);break;
        default:break;
      }
    };
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[view,preview,openNew]);

  const postsBySlot=React.useMemo(()=>{
    const m={};
    filtered.forEach(p=>{
      const key=`${p.datetime.slice(0,10)}_${p.datetime.slice(11,13)}`;
      (m[key]=m[key]||[]).push(p);
    });
    return m;
  },[filtered]);

  // 週ビューヘッダー統計（毎レンダーfilterを7×4回走らせないためuseMemoに）
  const weekStats=React.useMemo(()=>{
    return weekDateStrs.map((dateStr,i)=>{
      const dayPosts=filtered.filter(p=>p.datetime.startsWith(dateStr));
      return{
        draftCnt:dayPosts.filter(p=>p.status==="draft").length,
        reservedCnt:dayPosts.filter(p=>p.status==="reserved"||p.status==="waiting").length,
        publishedCnt:dayPosts.filter(p=>p.status==="published"||p.status==="popular").length,
        ghostCnt:slots.filter(s=>slotMatchesDate(s,weekDates[i])).length,
      };
    });
  },[filtered,weekDateStrs,weekDates,slots]);

  const ghostBySlot=React.useMemo(()=>{
    const m={};
    weekDates.forEach((date,i)=>{
      slots.filter(s=>slotMatchesDate(s,date)).forEach(s=>{
        const key=`${weekDateStrs[i]}_${slotTime(s).slice(0,2)}`;
        (m[key]=m[key]||[]).push(s);
      });
    });
    return m;
  },[weekDates,weekDateStrs,slots]);

  if(loading)return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f0eb",fontFamily:"'Geist','Hiragino Sans','Noto Sans JP',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:22,fontWeight:900,color:"#111",marginBottom:10,letterSpacing:"-0.8px"}}>Content<span style={{color:"#f59e0b"}}>OS</span></div>
        <div style={{width:32,height:2,background:"#e6dfd6",borderRadius:99,margin:"0 auto",overflow:"hidden"}}>
          <div style={{width:"60%",height:"100%",background:"#f59e0b",borderRadius:99,animation:"slide 1s infinite"}}/>
        </div>
        <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:`'Geist','Hiragino Sans','Noto Sans JP',sans-serif`,background:"#f5f0eb",minHeight:"100vh",color:"#1a1a1a"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        :root{
          --bg:#f5f0eb;
          --surface:#fff;
          --border:#e6dfd6;
          --border-strong:#d4cbbf;
          --text-primary:#111;
          --text-secondary:#6b6560;
          --text-muted:#a8a09a;
          --accent:#f59e0b;
          --accent-hover:#e08c00;
          --accent-light:#fef3c7;
          --radius-sm:6px;
          --radius-md:10px;
          --radius-lg:14px;
          --radius-xl:20px;
          --shadow-sm:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
          --shadow-md:0 4px 12px rgba(0,0,0,.08),0 2px 4px rgba(0,0,0,.04);
          --shadow-lg:0 20px 48px rgba(0,0,0,.12),0 8px 16px rgba(0,0,0,.06);
        }
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#d4cbbf;border-radius:99px;}
        ::-webkit-scrollbar-track{background:transparent;}
        button,select,input,textarea{font-family:inherit;}
        button{transition:opacity .12s,background .12s,box-shadow .12s,transform .08s;}
        button:active{transform:scale(.97);}
        input:focus,textarea:focus,select:focus{outline:none;}
        .xb{outline:none;}
        .xb:empty:before,.xb[data-ph]:empty:before{content:attr(data-ph);color:#a8a09a;pointer-events:none;}
        .xb p,.xb div{font-size:17px;line-height:1.8;color:#111;margin:0 0 1.2em;}
        .xb p:last-child,.xb div:last-child{margin-bottom:0;}
        .xb br{display:block;height:0;}
        .xb h1{font-size:26px;font-weight:800;line-height:1.3;margin:1.4em 0 .5em;color:#111;letter-spacing:-.3px;}
        .xb h2{font-size:19px;font-weight:700;line-height:1.4;margin:1.1em 0 .4em;color:#111;}
        .xb ul{list-style:disc;padding-left:1.5em;margin:.6em 0 1.2em;}
        .xb ol{list-style:decimal;padding-left:1.5em;margin:.6em 0 1.2em;}
        .xb li{font-size:17px;line-height:1.75;color:#111;margin:.15em 0;}
        .xb ul ul,.xb ol ul{list-style:circle;padding-left:1.5em;margin:.2em 0;}
        .xb blockquote{border-left:3px solid #e6dfd6;padding:6px 0 6px 16px;margin:.8em 0 1.2em;color:#6b6560;font-style:italic;font-size:17px;line-height:1.75;}
        .xb a{color:#2563eb;text-decoration:underline;}
        .xb hr{border:none;border-top:1px solid #e6dfd6;margin:1.5em 0;}
        .xb hr.thread-sep{border:none;border-top:none;margin:1.4em 0;display:flex;align-items:center;gap:8px;}
        .xb hr.thread-sep::before{content:"";flex:1;height:1.5px;background:linear-gradient(90deg,#1d9bf030,#1d9bf080);}
        .xb hr.thread-sep::after{content:"𝕏 スレッド続き";font-size:10px;font-weight:700;color:#1d9bf0;background:#e8f5fe;padding:2px 8px;border-radius:99px;border:1px solid #93d3fc;white-space:nowrap;flex-shrink:0;}
        .xb strong,.xb b{font-weight:700;}
        .xb em,.xb i{font-style:italic;}
        .xb s{text-decoration:line-through;}
        .xb img{max-width:100%;border-radius:8px;margin:.6em 0;display:block;}
        .chip{display:inline-flex;align-items:center;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:.2px;}
        .btn-ghost{background:none;border:1.5px solid var(--border);color:var(--text-secondary);border-radius:var(--radius-md);padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;}
        .btn-ghost:hover{background:#f5f0eb;border-color:var(--border-strong);color:var(--text-primary);}
        .btn-primary{background:var(--accent);border:none;color:#fff;border-radius:var(--radius-md);padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;}
        .btn-primary:hover{background:var(--accent-hover);}
      `}</style>

      {/* ── ヘッダー ── */}
      <div style={{background:"#fff",borderBottom:"1px solid #e6dfd6",padding:"0 16px",display:"flex",alignItems:"center",gap:8,height:50,boxShadow:"0 1px 3px rgba(0,0,0,.04)",flexShrink:0,position:"relative",zIndex:50}}>
        <span style={{fontWeight:900,fontSize:16,letterSpacing:"-0.6px",flexShrink:0,color:"#111"}}>Content<span style={{color:"#f59e0b"}}>OS</span></span>
        <div style={{width:1,height:18,background:"#e6dfd6",flexShrink:0,marginLeft:2}}/>

        {/* 管理者：アカウントタブ */}
        {isAdmin&&(
          <div style={{display:"flex",gap:2,background:"#f5f0eb",borderRadius:8,padding:2,maxWidth:400,overflow:"auto",flexShrink:0}}>
            {accounts.map(acc=>(
              <button key={acc.id} onClick={()=>{setActiveAccId(acc.id);setPreview(null);}}
                style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:600,fontSize:11.5,background:activeAccId===acc.id?"#fff":"transparent",color:activeAccId===acc.id?"#111":"#a8a09a",boxShadow:activeAccId===acc.id?"0 1px 4px rgba(0,0,0,.08)":"none",whiteSpace:"nowrap",fontFamily:"inherit",transition:"all .12s"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:activeAccId===acc.id?acc.color:"#ccc",display:"inline-block",flexShrink:0}}/>
                {acc.name}
              </button>
            ))}
            <button onClick={addAccount}
              style={{padding:"4px 8px",borderRadius:6,border:"1px dashed #ccc",cursor:"pointer",fontSize:11,background:"transparent",color:"#bbb",whiteSpace:"nowrap",fontFamily:"inherit"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#ccc";e.currentTarget.style.color="#bbb";}}>
              + 追加
            </button>
          </div>
        )}

        {/* 共有リンクバッジ */}
        {isClient&&(
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:activeAcc?.color,display:"inline-block"}}/>
            <span style={{fontWeight:700,fontSize:13}}>{activeAcc?.name}</span>
            <span style={{fontSize:10,color:"#2563eb",background:"#eff6ff",border:"1px solid #bfdbfe",padding:"2px 7px",borderRadius:99,fontWeight:600}}>共有</span>
          </div>
        )}

        {/* 右側コントロール */}
        <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
          <button onClick={()=>setShowSearch(true)}
            style={{display:"flex",alignItems:"center",gap:5,border:"1px solid #e6dfd6",background:"#f5f0eb",borderRadius:8,padding:"5px 10px",fontSize:11.5,color:"#6b6560",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6.5" cy="6.5" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
            検索
            <span style={{fontSize:9.5,color:"#bbb",background:"#fff",border:"1px solid #e6dfd6",borderRadius:4,padding:"1px 4px"}}>⌘K</span>
          </button>
          <div style={{display:"flex",background:"#f5f0eb",borderRadius:8,padding:2,gap:1,flexShrink:0,border:"1px solid #e6dfd6"}}>
            {[["calendar","週"],["month","月"],["list","リスト"]].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11.5,fontWeight:600,background:view===v?"#fff":"transparent",color:view===v?"#111":"#a8a09a",boxShadow:view===v?"0 1px 3px rgba(0,0,0,.08)":"none",whiteSpace:"nowrap",fontFamily:"inherit",transition:"all .12s"}}>{l}</button>
            ))}
          </div>
          {isAdmin&&(
            <>
              {overdueCount>0&&(
                <button onClick={()=>setFilter("reserved")}
                  style={{display:"flex",alignItems:"center",gap:4,background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"4px 9px",fontSize:11,fontWeight:700,color:"#dc2626",cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" opacity=".8"><path d="M8 1.5L1.5 13.5h13L8 1.5zM8 6v4m0 2v1"/><rect x="7.25" y="6" width="1.5" height="4" rx=".75"/><rect x="7.25" y="11" width="1.5" height="1.5" rx=".75"/></svg>
                  {overdueCount}件
                </button>
              )}
              <div ref={shareRef} style={{position:"relative"}}>
                <button onClick={()=>setShowShare(s=>!s)}
                  style={{display:"flex",alignItems:"center",gap:5,border:"1px solid #e6dfd6",background:showShare?"#f5f0eb":"#fff",borderRadius:8,padding:"5px 10px",fontSize:11.5,fontWeight:600,color:"#555",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="3" cy="8" r="1.5"/><circle cx="13" cy="3" r="1.5"/><circle cx="13" cy="13" r="1.5"/><path d="m4.5 7.1 7-3.2M4.5 8.9l7 3.2"/></svg>
                  設定
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
                </button>
                {showShare&&(
                  <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",border:"1px solid #e6dfd6",borderRadius:12,padding:6,zIndex:100,width:200,boxShadow:"0 8px 24px rgba(0,0,0,.1)",display:"flex",flexDirection:"column",gap:1}}>
                    {[
                      ["予約枠",()=>{setShowSlotSettings(true);setShowShare(false);}],
                      ["通知設定",()=>{setShowNotifySettings(true);setShowShare(false);}],
                      ["AIコンテキスト出力",()=>{setShowAIExport(true);setShowShare(false);}],
                      ["ローカル保存",()=>{setShowExport(true);setShowShare(false);}],
                      ["クライアント管理",()=>{setShowAccountSettings(true);setShowShare(false);}],
                    ].map(([label,fn])=>(
                      <button key={label} onClick={fn}
                        style={{border:"none",background:"none",borderRadius:7,padding:"8px 11px",fontSize:12,fontWeight:500,color:"#333",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f5f0eb"}
                        onMouseLeave={e=>e.currentTarget.style.background="none"}>
                        {label}
                      </button>
                    ))}
                    <div style={{borderTop:"1px solid #e6dfd6",marginTop:2,paddingTop:6}}>
                      <div style={{fontSize:10,color:"#a8a09a",fontWeight:600,padding:"2px 11px 5px",letterSpacing:".4px"}}>共有リンク</div>
                      {accounts.map(acc=>(
                        <div key={acc.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 11px"}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:acc.color,flexShrink:0}}/>
                          <span style={{fontSize:12,fontWeight:600,flex:1,color:"#333"}}>{acc.name}</span>
                          <button onClick={()=>{copyShareLink(acc.id);setShowShare(false);}}
                            style={{background:"#f59e0b",border:"none",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,color:"#fff",cursor:"pointer"}}>
                            コピー
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          <button onClick={()=>openNew()}
            style={{background:"#111",border:"none",borderRadius:8,padding:"6px 13px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",flexShrink:0,letterSpacing:"-.1px"}}>
            + 新規
          </button>
        </div>
      </div>

      {/* ── カレンダーナビ ── */}
      {view==="calendar"&&(
        <div style={{background:"#fff",borderBottom:"1px solid #e6dfd6",padding:"5px 16px",display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
          {activeAcc&&<span style={{width:7,height:7,borderRadius:"50%",background:activeAcc.color,display:"inline-block"}}/>}
          <span style={{fontWeight:700,fontSize:12.5,color:"#555"}}>{activeAcc?.name}</span>
          <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
            <button onClick={()=>{const d=new Date(week);d.setDate(d.getDate()-7);setWeek(d);}}
              style={{border:"1px solid #e6dfd6",background:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:14,color:"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <span style={{fontWeight:600,fontSize:12.5,minWidth:165,textAlign:"center",color:"#333"}}>
              {weekDates[0].getMonth()+1}月{weekDates[0].getDate()}日 〜 {weekDates[6].getMonth()+1}月{weekDates[6].getDate()}日
            </span>
            <button onClick={()=>{const d=new Date(week);d.setDate(d.getDate()+7);setWeek(d);}}
              style={{border:"1px solid #e6dfd6",background:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:14,color:"#555",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
            <button onClick={()=>setWeek(new Date())}
              style={{border:"1px solid #e6dfd6",background:"#fff",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:11,color:"#555",fontFamily:"inherit"}}>今週</button>
          </div>
          <select value={filterStatus} onChange={e=>setFilter(e.target.value)}
            style={{background:"#f5f0eb",border:"1px solid #e6dfd6",borderRadius:7,padding:"4px 8px",fontSize:11,color:"#555",outline:"none",cursor:"pointer",marginLeft:"auto"}}>
            <option value="all">すべて</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      )}

      {/* ── カレンダービュー ── */}
      {view==="calendar"&&(
        <div style={{height:"calc(100vh - 100px)",overflow:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"48px repeat(7, 1fr)",minWidth:860}}>
            <div style={{background:"#fff",position:"sticky",top:0,zIndex:20,borderRight:"1px solid #e6dfd6",borderBottom:"1px solid #e6dfd6"}}/>
            {weekDates.map((date,i)=>{
              const dateStr=weekDateStrs[i];
              const isToday=dateStr===today;
              const{draftCnt,reservedCnt,publishedCnt,ghostCnt}=weekStats[i]||{};
              return(
                <div key={i} style={{background:"#fff",padding:"6px 5px 4px",textAlign:"center",borderBottom:"1px solid #e6dfd6",borderRight:"1px solid #e6dfd6",position:"sticky",top:0,zIndex:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:isToday?"#f59e0b":i>=5?"#ef4444":"#9ca3af"}}>{DAYS[i]}</div>
                  <div style={{width:28,height:28,borderRadius:"50%",background:isToday?"#f59e0b":"transparent",display:"flex",alignItems:"center",justifyContent:"center",margin:"2px auto",fontSize:13,fontWeight:800,color:isToday?"#fff":"#1a1a1a"}}>{date.getDate()}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:2,justifyContent:"center",minHeight:14}}>
                    {draftCnt>0&&<span style={{fontSize:8,background:"#f3f4f6",color:"#6b7280",borderRadius:4,padding:"0 3px",fontWeight:700}}>下{draftCnt}</span>}
                    {reservedCnt>0&&<span style={{fontSize:8,background:"#ede9fe",color:"#7c3aed",borderRadius:4,padding:"0 3px",fontWeight:700}}>予{reservedCnt}</span>}
                    {publishedCnt>0&&<span style={{fontSize:8,background:"#d1fae5",color:"#059669",borderRadius:4,padding:"0 3px",fontWeight:700}}>済{publishedCnt}</span>}
                    {ghostCnt>0&&<span style={{fontSize:8,background:"#fef3c7",color:"#d97706",borderRadius:4,padding:"0 3px",fontWeight:700}}>枠{ghostCnt}</span>}
                  </div>
                </div>
              );
            })}
            {HOURS.map(hour=>(
              <React.Fragment key={hour}>
                <div style={{borderTop:"1px solid #ede8e0",padding:"3px 5px 0",fontSize:10,color:"#c8bfb4",textAlign:"right",background:"#f5f0eb",borderRight:"1px solid #e6dfd6"}}>{hour}:00</div>
                {weekDates.map((date,di)=>{
                  const dateStr=weekDateStrs[di];
                  const key=dateStr+"_"+String(hour).padStart(2,"0");
                  const sp=postsBySlot[key]||[];
                  const isEmpty=sp.length===0;
                  return(
                    <div key={hour+"-"+di}
                      onClick={isEmpty?()=>openNew(`${dateStr}T${String(hour).padStart(2,"0")}:00`):undefined}
                      onDragOver={dragId?e=>{e.preventDefault();setDragOver(key);}:undefined}
                      onDragLeave={dragId?()=>setDragOver(null):undefined}
                      onDrop={dragId?e=>{e.preventDefault();handleDrop(dragId,dateStr,hour);}:undefined}
                      style={{borderTop:"1px solid #ede8e0",borderRight:"1px solid #e6dfd6",padding:"3px",minHeight:42,
                        background:dragOver===key?"#fef9e7":dragId?"#fffdf5":dateStr===today?"#fffcf5":"#fff",
                        cursor:dragId?"copy":isEmpty?"pointer":"default",transition:"background .1s",
                        outline:dragOver===key?"2px dashed #f59e0b":"none",outlineOffset:-2}}
                      onMouseEnter={!dragId&&isEmpty?e=>{e.currentTarget.style.background=dateStr===today?"#fff8e8":"#f5f0eb";}:undefined}
                      onMouseLeave={!dragId&&isEmpty?e=>{e.currentTarget.style.background=dateStr===today?"#fffcf5":"#fff";}:undefined}>
                      {/* 実投稿 */}
                      {sp.map(p=>{
                        const pt2=POST_TYPE[p.postType||"x_post"],st2=STATUS[p.status];
                        return(
                          <div key={p.id}
                            draggable
                            onDragStart={e=>{e.stopPropagation();setDragId(p.id);e.dataTransfer.effectAllowed="move";}}
                            onDragEnd={()=>{setDragId(null);setDragOver(null);}}
                            onClick={e=>{e.stopPropagation();setPreview(p);}}
                            style={{background:"#fff",border:`1.5px solid ${pt2.border}`,borderLeft:`3px solid ${pt2.dot}`,borderRadius:6,padding:"3px 5px",marginBottom:2,cursor:"grab",transition:"all .1s",opacity:dragId===p.id?0.5:1}}
                            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 2px 8px #0000001a";e.currentTarget.style.borderColor=pt2.color;}}
                            onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor=pt2.border;}}>
                            <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:1}}>
                              <span style={{width:5,height:5,borderRadius:"50%",background:pt2.dot,flexShrink:0}}/>
                              <span style={{fontSize:9,color:"#888"}}>{fmtTime(p.datetime)}</span>
                              {p.score&&<span style={{fontSize:8,fontWeight:800,color:SCORE[p.score]?.color,background:SCORE[p.score]?.bg,borderRadius:3,padding:"0 3px",marginLeft:"auto"}}>{p.score}</span>}
                            </div>
                            <div style={{fontSize:10,fontWeight:700,color:"#0f1419",lineHeight:1.3}}>{(p.title||"（タイトルなし）").slice(0,12)}{(p.title||"").length>12?"…":""}</div>
                            <select value={p.status} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();changeStatus(p.id,e.target.value,p.score);}}
                              style={{marginTop:3,width:"100%",border:`1px solid ${st2?.border}`,borderRadius:5,padding:"2px 4px",fontSize:10,fontWeight:700,color:st2?.text,background:st2?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                              {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                        );
                      })}
                      {/* ゴースト枠（実投稿で埋まっていないもののみ表示） */}
                      {(()=>{
                        const filledTypes=new Set(sp.map(p=>p.postType||"x_post"));
                        const ghosts=(ghostBySlot[key]||[]).filter(g=>!filledTypes.has(g.postType||"x_post"));
                        if(ghosts.length===0)return null;
                        const multi=ghosts.length>1;
                        return multi?(
                          <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                            {ghosts.map((g,gi)=>{
                              const gpt=POST_TYPE[g.postType||"x_post"];
                              return(
                                <div key={"g"+gi}
                                  onClick={e=>{e.stopPropagation();openNew(`${dateStr}T${slotTime(g)}`,{title:g.title||"",postType:g.postType||"x_post"});}}
                                  style={{flex:"1 1 0",minWidth:0,border:`1.5px dashed ${gpt.dot}`,borderLeft:`3px dashed ${gpt.dot}`,borderRadius:5,padding:"3px 4px",cursor:"pointer",opacity:0.7,transition:"all .15s",background:gpt.bg}}
                                  onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.boxShadow="0 1px 6px #0000001a";}}
                                  onMouseLeave={e=>{e.currentTarget.style.opacity="0.7";e.currentTarget.style.boxShadow="none";}}>
                                  <div style={{display:"flex",alignItems:"center",gap:2,marginBottom:1}}>
                                    <span style={{width:4,height:4,borderRadius:"50%",background:gpt.dot,flexShrink:0}}/>
                                    <span style={{fontSize:8,color:gpt.color,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{gpt.label}</span>
                                  </div>
                                  <div style={{fontSize:8,color:"#666",fontWeight:600,lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {g.title||"予約枠"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ):(
                          ghosts.map((g,gi)=>{
                            const gpt=POST_TYPE[g.postType||"x_post"];
                            return(
                              <div key={"g"+gi}
                                onClick={e=>{e.stopPropagation();openNew(`${dateStr}T${slotTime(g)}`,{title:g.title||"",postType:g.postType||"x_post"});}}
                                style={{border:`1.5px dashed ${gpt.dot}`,borderLeft:`3px dashed ${gpt.dot}`,borderRadius:6,padding:"4px 6px",marginBottom:2,cursor:"pointer",opacity:0.65,transition:"all .15s",background:gpt.bg}}
                                onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.boxShadow="0 1px 6px #0000001a";}}
                                onMouseLeave={e=>{e.currentTarget.style.opacity="0.65";e.currentTarget.style.boxShadow="none";}}>
                                <div style={{display:"flex",alignItems:"center",gap:3}}>
                                  <span style={{width:4,height:4,borderRadius:"50%",background:gpt.dot,flexShrink:0}}/>
                                  <span style={{fontSize:9,color:gpt.color,fontWeight:700}}>{slotTime(g)}</span>
                                </div>
                                {g.title
                                  ?<div style={{fontSize:9,fontWeight:700,color:"#666",lineHeight:1.3,marginTop:1}}>{g.title.slice(0,12)}{g.title.length>12?"…":""}</div>
                                  :<div style={{fontSize:9,color:"#999",lineHeight:1.3}}>予約枠</div>
                                }
                                <span style={{fontSize:8,color:gpt.color,fontWeight:700,background:"#fff",border:`1px solid ${gpt.border}`,padding:"0 4px",borderRadius:6,marginTop:2,display:"inline-block"}}>{gpt.label}</span>
                              </div>
                            );
                          })
                        );
                      })()}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* ── マンスリービュー ── */}
      {view==="month"&&(
        <MonthView
          posts={filtered}
          today={today}
          slots={slots}
          openNew={openNew}
          setPreview={setPreview}
        />
      )}

      {/* ── リストビュー ── */}
      {view==="list"&&(
        <ListView
          filtered={filtered}
          today={today}
          activeAcc={activeAcc}
          filterStatus={filterStatus}
          setFilter={setFilter}
          setPreview={setPreview}
          setEditing={setEditing}
          handleDuplicate={handleDuplicate}
          setRepostTgt={setRepostTgt}
          openNew={openNew}
          slots={slots}
          changeStatus={changeStatus}
        />
      )}

      {/* ── 予約枠設定モーダル ── */}
      {showSlotSettings&&isAdmin&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
          onClick={e=>{if(e.target===e.currentTarget)setShowSlotSettings(false);}}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000030"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #e6dfd6",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f5f0eb"}}>
              <div>
                <div style={{fontWeight:800,fontSize:14}}>📅 予約枠設定</div>
                <div style={{fontSize:11,color:"#aaa",marginTop:2}}>カレンダーにゴーストカードで表示されます</div>
              </div>
              <Btn onClick={()=>setShowSlotSettings(false)}>閉じる</Btn>
            </div>
            {/* フォーム（固定） */}
            <div style={{padding:"14px 18px",borderBottom:"1px solid #e6dfd6"}}>
              <SlotAddForm onAdd={s=>{
                saveSlots([...slots,{...s,id:genId()}]);
              }}/>
            </div>
            {/* 枠一覧（スクロール可能） */}
            <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"12px 18px 24px"}}>
              {slots.length===0
                ?<div style={{textAlign:"center",color:"#ccc",fontSize:13,padding:"20px 0"}}>枠がまだありません</div>
                :slots.map((s,i)=>{
                  const pt=POST_TYPE[s.postType||"x_post"];
                  return(
                    <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,background:"#f8f5f1",border:"1px solid #e6dfd6",borderRadius:9,padding:"7px 10px",marginBottom:6}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:pt.dot,flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:700,color:"#555",whiteSpace:"nowrap",flexShrink:0}}>{slotLabel(s)}</span>
                      <input
                        value={s.title||""}
                        onChange={e=>{const v=e.target.value;saveSlots(prev=>prev.map((x,j)=>j===i?{...x,title:v}:x));}}
                        placeholder="仮タイトル"
                        style={{flex:1,minWidth:0,border:"none",borderBottom:"1px solid #e0d8ce",borderRadius:0,padding:"2px 4px",fontSize:11,fontFamily:"inherit",color:"#1a1a1a",outline:"none",background:"transparent"}}
                        onFocus={e=>e.target.style.borderBottomColor="#f59e0b"}
                        onBlur={e=>e.target.style.borderBottomColor="#e0d8ce"}
                      />
                      <span style={{fontSize:10,color:pt.color,background:pt.bg,border:`1px solid ${pt.border}`,padding:"1px 7px",borderRadius:10,fontWeight:700,flexShrink:0}}>{pt.label}</span>
                      <button onClick={()=>saveSlots(slots.filter((_,j)=>j!==i))}
                        style={{border:"none",background:"none",color:"#fca5a5",cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0,padding:0}}>×</button>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      )}

      {/* ── 通知設定モーダル ── */}
      {showNotifySettings&&isAdmin&&notifySettings&&(
        <NotifySettingsModal
          settings={notifySettings}
          accountName={activeAcc?.name||""}
          onSave={saveNotifySettings}
          onClose={()=>setShowNotifySettings(false)}
          onTestSend={handleTestSend}
        />
      )}

      {/* ── エクスポートモーダル ── */}
      {showExport&&isAdmin&&(
        <ExportModal
          posts={posts}
          accountName={activeAcc?.name||""}
          onClose={()=>setShowExport(false)}
        />
      )}

      {showAIExport&&isAdmin&&(
        <AIContextModal
          posts={posts}
          accountName={activeAcc?.name||""}
          onClose={()=>setShowAIExport(false)}
        />
      )}

      {/* ── モーダル群 ── */}
      {preview&&<PreviewOverlay post={preview} onClose={()=>setPreview(null)}
        onEdit={async p=>{
          setPreview(null);
          if(p._unsaved){
            const {_unsaved,...postToSave}=p;
            const title=postToSave.title||"";
            const memo=postToSave.memo||"";
            const clean={...postToSave,title,memo};
            await saveToDb(clean);
            setEditing({...clean});
          } else {
            setEditing({...p});
          }
        }}
        onSaveNew={async p=>{
          const {_unsaved,...postToSave}=p;
          const clean={...postToSave,title:postToSave.title||"",memo:postToSave.memo||""};
          await saveToDb(clean);
          setPreview({...clean});
          showToast("保存しました ✅");
        }}
        onRepost={p=>{setPreview(null);setRepostTgt(p);}}
        onDuplicate={handleDuplicate}
        onDelete={p=>setDeleteConfirm(p)}
        onSaveComment={saveComment}
        onChangeStatus={changeStatus}
        onSaveMeta={saveMeta}
        onChangePostType={changePostType}/>}

      {editing&&<EditorModal post={{postType:'x_post',body:'',memo:'',memoLinks:[],comments:[],history:[],...editing}} onSave={save} onClose={()=>setEditing(null)}/>}

      {showSearch&&<SearchModal posts={filtered} onClose={()=>setShowSearch(false)}
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
              <button onClick={()=>setDeleteConfirm(null)} style={{flex:1,border:"1px solid #e0d8ce",background:"#fff",borderRadius:20,padding:"10px 0",fontWeight:600,fontSize:"0.88em",color:"#536471",cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button>
              <button onClick={()=>del(deleteConfirm.id)} style={{flex:1,background:"#ef4444",border:"none",borderRadius:20,padding:"10px 0",fontWeight:800,fontSize:"0.88em",color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#111",color:"#fff",padding:"10px 20px",borderRadius:10,fontSize:12.5,fontWeight:600,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,.2)",whiteSpace:"nowrap",letterSpacing:"-.1px"}}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── リストビュー ──
// ════════════════════════════════════════════════════════
// マンスリービュー
// ════════════════════════════════════════════════════════
function MonthView({posts,today,slots,openNew,setPreview}){
  const [monthBase,setMonthBase]=useState(()=>new Date());
  const year=monthBase.getFullYear(),month=monthBase.getMonth();

  const {weeks,fmtD}=React.useMemo(()=>{
    const firstDay=new Date(year,month,1);
    const lastDay=new Date(year,month+1,0);
    const startDow=(firstDay.getDay()+6)%7;
    const cells=[];
    for(let i=0;i<startDow;i++)cells.push(null);
    for(let d=1;d<=lastDay.getDate();d++)cells.push(new Date(year,month,d));
    while(cells.length%7!==0)cells.push(null);
    const ws=[];
    for(let i=0;i<cells.length;i+=7)ws.push(cells.slice(i,i+7));
    const fmt=d=>d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`:"";
    return{weeks:ws,fmtD:fmt};
  },[year,month]);

  const postsByDate=React.useMemo(()=>{
    const m={};
    posts.forEach(p=>{const d=p.datetime.slice(0,10);(m[d]=m[d]||[]).push(p);});
    return m;
  },[posts]);

  // 月内の全日付×slotsのマッチングをまとめて計算
  const slotsByDate=React.useMemo(()=>{
    const m={};
    weeks.flat().forEach(date=>{
      if(!date)return;
      const key=fmtD(date);
      m[key]=slots.filter(s=>slotMatchesDate(s,date));
    });
    return m;
  },[weeks,slots,fmtD]);
  return(
    <div style={{height:"calc(100vh - 100px)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* ナビ */}
      <div style={{background:"#fff",borderBottom:"1px solid #e6dfd6",padding:"6px 18px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <button onClick={()=>setMonthBase(new Date(year,month-1,1))} style={{border:"1px solid #e0d8ce",background:"#fff",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>‹</button>
        <span style={{fontWeight:800,fontSize:14,color:"#444",minWidth:100,textAlign:"center"}}>{year}年{month+1}月</span>
        <button onClick={()=>setMonthBase(new Date(year,month+1,1))} style={{border:"1px solid #e0d8ce",background:"#fff",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>›</button>
        <button onClick={()=>setMonthBase(new Date())} style={{border:"1px solid #e0d8ce",background:"#fff",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>今月</button>
      </div>
      {/* グリッド */}
      <div style={{flex:1,overflow:"auto"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",minWidth:700}}>
          {["月","火","水","木","金","土","日"].map((d,i)=>(
            <div key={d} style={{padding:"6px 0",textAlign:"center",fontSize:11,fontWeight:700,color:i>=5?"#ef4444":"#9ca3af",background:"#fff",borderBottom:"1px solid #e6dfd6",borderRight:"1px solid #e6dfd6",position:"sticky",top:0,zIndex:10}}>{d}</div>
          ))}
          {weeks.map((week,wi)=>week.map((date,di)=>{
            const dateStr=fmtD(date);
            const isToday=dateStr===today;
            const isCurrentMonth=date&&date.getMonth()===month;
            const dayPosts=date?(postsByDate[dateStr]||[]):[];
            const daySlots=date?(slotsByDate[dateStr]||[]):[];
            const draftCnt=dayPosts.filter(p=>p.status==="draft").length;
            const reservedCnt=dayPosts.filter(p=>["reserved","waiting"].includes(p.status)).length;
            const publishedCnt=dayPosts.filter(p=>["published","popular"].includes(p.status)).length;
            return(
              <div key={`${wi}-${di}`}
                style={{minHeight:100,borderRight:"1px solid #e6dfd6",borderBottom:"1px solid #e6dfd6",padding:"4px 5px",background:isToday?"#fffcf5":!isCurrentMonth?"#f5f0eb":"#fff",verticalAlign:"top",cursor:date?"pointer":"default"}}
                onClick={date?()=>openNew(`${dateStr}T09:00`):undefined}>
                {date&&(
                  <>
                    {/* 日付 */}
                    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
                      <span style={{width:22,height:22,borderRadius:"50%",background:isToday?"#f59e0b":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:isToday?"#fff":!isCurrentMonth?"#ccc":di>=5?"#ef4444":"#1a1a1a",flexShrink:0}}>{date.getDate()}</span>
                      <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                        {draftCnt>0&&<span style={{fontSize:8,background:"#f3f4f6",color:"#6b7280",borderRadius:4,padding:"0 3px",fontWeight:700}}>下{draftCnt}</span>}
                        {reservedCnt>0&&<span style={{fontSize:8,background:"#ede9fe",color:"#7c3aed",borderRadius:4,padding:"0 3px",fontWeight:700}}>予{reservedCnt}</span>}
                        {publishedCnt>0&&<span style={{fontSize:8,background:"#d1fae5",color:"#059669",borderRadius:4,padding:"0 3px",fontWeight:700}}>済{publishedCnt}</span>}
                        {daySlots.length>0&&<span style={{fontSize:8,background:"#fef3c7",color:"#d97706",borderRadius:4,padding:"0 3px",fontWeight:700}}>枠{daySlots.length}</span>}
                      </div>
                    </div>
                    {/* 投稿チップ（最大3件） */}
                    {dayPosts.slice(0,3).map(p=>{
                      const pt=POST_TYPE[p.postType||"x_post"];
                      return(
                        <div key={p.id} onClick={e=>{e.stopPropagation();setPreview(p);}}
                          style={{display:"flex",alignItems:"center",gap:3,background:pt.bg,border:`1px solid ${pt.border}`,borderLeft:`3px solid ${pt.dot}`,borderRadius:4,padding:"2px 5px",marginBottom:2,cursor:"pointer",overflow:"hidden"}}
                          onMouseEnter={e=>e.currentTarget.style.opacity="0.8"}
                          onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                          <span style={{fontSize:8,color:pt.color,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{p.title||"（無題）"}</span>
                          {p.score&&<span style={{fontSize:7,fontWeight:800,color:SCORE[p.score]?.color,background:SCORE[p.score]?.bg,borderRadius:3,padding:"0 3px",flexShrink:0}}>{p.score}</span>}
                        </div>
                      );
                    })}
                    {dayPosts.length>3&&<div style={{fontSize:8,color:"#aaa",textAlign:"right"}}>+{dayPosts.length-3}件</div>}
                    {/* 予約枠チップ */}
                    {daySlots.slice(0,2).map((s,si)=>{
                      const gpt=POST_TYPE[s.postType||"x_post"];
                      return(
                        <div key={"s"+si} onClick={e=>{e.stopPropagation();openNew(`${dateStr}T${slotTime(s)}`,{title:s.title||"",postType:s.postType||"x_post"});}}
                          style={{display:"flex",alignItems:"center",gap:3,border:`1px dashed ${gpt.dot}`,borderLeft:`2px dashed ${gpt.dot}`,borderRadius:4,padding:"2px 5px",marginBottom:2,cursor:"pointer",background:gpt.bg,opacity:0.7}}
                          onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                          onMouseLeave={e=>e.currentTarget.style.opacity="0.7"}>
                          <span style={{fontSize:8,color:gpt.color,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title||`${slotTime(s)} 予約枠`}</span>
                        </div>
                      );
                    })}
                    {daySlots.length>2&&<div style={{fontSize:8,color:"#d97706",textAlign:"right"}}>+{daySlots.length-2}枠</div>}
                  </>
                )}
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
}

function ListView({filtered,today,activeAcc,filterStatus,setFilter,setPreview,setEditing,handleDuplicate,setRepostTgt,openNew,slots,changeStatus}){
  const [showSlots,setShowSlots]=useState(true);
  const byDate=React.useMemo(()=>{
    const m={};
    filtered.forEach(p=>{
      const d=p.datetime.slice(0,10);
      (m[d]=m[d]||[]).push(p);
    });
    return m;
  },[filtered]);

  // 予約枠がある日付もカラムに含める
  const dates=React.useMemo(()=>{
    const dateSet=new Set(Object.keys(byDate));
    if(showSlots&&slots?.length>0){
      // 今日から60日分の日付を生成してスロット該当日を追加
      for(let i=0;i<60;i++){
        const d=new Date();d.setDate(d.getDate()+i);
        const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        if(slots.some(s=>slotMatchesDate(s,d)))dateSet.add(ds);
      }
    }
    return [...dateSet].sort();
  },[byDate,slots,showSlots]);

  const scrollRef=useRef(null);
  const todayColRef=useRef(null);
  useEffect(()=>{
    if(!scrollRef.current||!todayColRef.current)return;
    const container=scrollRef.current;
    const col=todayColRef.current;
    container.scrollTo({left:Math.max(0,col.offsetLeft-18),behavior:"smooth"});
  },[today,dates.join(",")]);

  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 52px)",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",borderBottom:"1px solid #e6dfd6",background:"#fff",flexShrink:0}}>
        {activeAcc&&<span style={{width:8,height:8,borderRadius:"50%",background:activeAcc.color,display:"inline-block"}}/>}
        <span style={{fontWeight:800,fontSize:14}}>{activeAcc?.name} の投稿</span>
        <span style={{fontSize:12,color:"#aaa"}}>{filtered.length}件</span>
        {/* 予約枠トグル */}
        <button onClick={()=>setShowSlots(v=>!v)}
          style={{display:"flex",alignItems:"center",gap:5,border:`1.5px solid ${showSlots?"#f59e0b":"#e0d8ce"}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",background:showSlots?"#fef3c7":"#fff",color:showSlots?"#d97706":"#aaa",fontFamily:"inherit",transition:"all .15s"}}>
          <span style={{fontSize:13}}>📅</span>
          予約枠{showSlots?"表示中":"非表示"}
        </button>
        <select value={filterStatus} onChange={e=>setFilter(e.target.value)}
          style={{marginLeft:"auto",background:"#f8f4ef",border:"1px solid #e0d8ce",borderRadius:7,padding:"5px 9px",fontSize:12,color:"#666",outline:"none",cursor:"pointer"}}>
          <option value="all">すべてのステータス</option>
          {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div ref={scrollRef} style={{flex:1,overflowX:"auto",overflowY:"hidden",display:"flex",padding:"16px 18px",gap:14,alignItems:"flex-start"}}>
        {dates.length===0&&<div style={{color:"#ccc",fontSize:13,margin:"auto"}}>投稿がありません</div>}
        {dates.map(date=>{
          const isToday=date===today;
          const dayPosts=(byDate[date]||[]).sort((a,b)=>a.datetime.localeCompare(b.datetime));
          const d=new Date(date+"T00:00:00");
          const dayLabel=["日","月","火","水","木","金","土"][d.getDay()];
          // この日に該当する予約枠を時刻順で取得
          const daySlots=showSlots&&slots?.length>0
            ?slots.filter(s=>slotMatchesDate(s,d)).sort((a,b)=>slotTime(a).localeCompare(slotTime(b)))
            :[];
          // 予約枠のうち実投稿が埋まっていない枠だけゴースト表示
          const filledTimes=new Set(dayPosts.map(p=>p.datetime.slice(11,16)));
          const ghostSlots=daySlots.filter(s=>!filledTimes.has(slotTime(s)));
          // 実投稿とゴーストをまとめて時刻順に並べる
          const allItems=[
            ...dayPosts.map(p=>({type:"post",data:p,sortKey:p.datetime.slice(11,13)})),
            ...ghostSlots.map(s=>({type:"ghost",data:s,sortKey:slotTime(s)})),
          ].sort((a,b)=>a.sortKey.localeCompare(b.sortKey));

          return(
            <div key={date} ref={isToday?todayColRef:null} style={{flexShrink:0,width:200}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,paddingBottom:7,borderBottom:`2px solid ${isToday?"#f59e0b":"#e6dfd6"}`}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:isToday?"#f59e0b":"#f5f0eb",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:isToday?"#fff":"#555",flexShrink:0}}>
                  {d.getDate()}
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:isToday?"#f59e0b":"#aaa"}}>{dayLabel}曜日</div>
                  <div style={{fontSize:10,color:"#bbb"}}>{d.getMonth()+1}月</div>
                </div>
                <span style={{marginLeft:"auto",fontSize:10,color:"#ccc"}}>{dayPosts.length}件</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {allItems.map((item,idx)=>{
                  if(item.type==="post"){
                    const p=item.data;
                    const pt2=POST_TYPE[p.postType||"x_post"];
                    const st2=STATUS[p.status];
                    return(
                      <div key={p.id} onClick={()=>setPreview(p)}
                        style={{background:"#fff",border:`1.5px solid ${pt2.border}`,borderLeft:`3px solid ${pt2.dot}`,borderRadius:9,padding:"9px 10px",cursor:"pointer",transition:"box-shadow .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.boxShadow="0 3px 12px #0000001a"}
                        onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                        <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                          <span style={{fontSize:10,color:"#888"}}>{p.datetime.slice(11,16)}</span>
                          <span style={{fontSize:9,color:pt2.color,fontWeight:700,background:pt2.bg,border:`1px solid ${pt2.border}`,padding:"0 5px",borderRadius:6,marginLeft:2}}>{pt2.label}</span>
                          {p.score&&<span style={{fontSize:9,fontWeight:800,color:SCORE[p.score]?.color,background:SCORE[p.score]?.bg,borderRadius:4,padding:"0 5px"}}>{p.score}</span>}
                          <select value={p.status} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();changeStatus(p.id,e.target.value,p.score);}}
                            style={{marginLeft:"auto",border:`1px solid ${st2?.border}`,borderRadius:6,padding:"1px 4px",fontSize:9,fontWeight:600,color:st2?.text,background:st2?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                        <div style={{fontSize:12,fontWeight:800,color:"#0f1419",lineHeight:1.35,marginBottom:4}}>{(p.title||"（タイトルなし）").slice(0,22)}{(p.title||"").length>22?"…":""}</div>
                        {p.memo&&<div style={{fontSize:10,color:"#b45309",background:"#fffbeb",borderRadius:4,padding:"2px 6px",marginBottom:5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.memo}</div>}
                        <div style={{display:"flex",gap:4,marginTop:4}}>
                          <button onClick={e=>{e.stopPropagation();setEditing({...p});}}
                            style={{background:"#f59e0b",border:"none",borderRadius:5,padding:"3px 8px",fontSize:9,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>編集</button>
                          <button onClick={e=>{e.stopPropagation();handleDuplicate(p);}}
                            style={{background:"none",border:"1px solid #e0d8ce",borderRadius:5,padding:"3px 6px",fontSize:9,color:"#536471",cursor:"pointer",fontFamily:"inherit"}}
                            onMouseEnter={e=>e.currentTarget.style.background="#f3f4f6"} onMouseLeave={e=>e.currentTarget.style.background="none"}>📋</button>
                          <button onClick={e=>{e.stopPropagation();setRepostTgt(p);}}
                            style={{background:"none",border:"1px solid #e0d8ce",borderRadius:5,padding:"3px 6px",fontSize:9,color:"#536471",cursor:"pointer",fontFamily:"inherit"}}
                            onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="#f59e0b";}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";e.currentTarget.style.borderColor="#e0d8ce";}}>🔁</button>
                        </div>
                      </div>
                    );
                  }
                  // ゴースト枠
                  const s=item.data;
                  const gpt=POST_TYPE[s.postType||"x_post"];
                  return(
                    <div key={"g"+idx}
                      onClick={()=>openNew(`${date}T${slotTime(s)}`,{title:s.title||"",postType:s.postType||"x_post"})}
                      style={{border:`1.5px dashed ${gpt.dot}`,borderLeft:`3px dashed ${gpt.dot}`,borderRadius:9,padding:"8px 10px",cursor:"pointer",opacity:0.7,transition:"all .15s",background:gpt.bg}}
                      onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.boxShadow="0 2px 8px #0000001a";}}
                      onMouseLeave={e=>{e.currentTarget.style.opacity="0.7";e.currentTarget.style.boxShadow="none";}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                        <span style={{width:5,height:5,borderRadius:"50%",background:gpt.dot,flexShrink:0}}/>
                        <span style={{fontSize:10,color:gpt.color,fontWeight:700}}>{slotTime(s)}</span>
                        <span style={{fontSize:9,color:gpt.color,background:"#fff",border:`1px solid ${gpt.border}`,padding:"0 5px",borderRadius:6,fontWeight:700,marginLeft:"auto"}}>{gpt.label}</span>
                      </div>
                      {s.title
                        ?<div style={{fontSize:11,fontWeight:700,color:"#555",lineHeight:1.35,marginBottom:2}}>{s.title.slice(0,20)}{s.title.length>20?"…":""}</div>
                        :<div style={{fontSize:10,color:"#999",fontWeight:600}}>予約枠 — クリックで作成</div>
                      }
                    </div>
                  );
                })}
                <button onClick={()=>openNew(`${date}T09:00`)}
                  style={{width:"100%",border:"1.5px dashed #e0d8ce",background:"transparent",borderRadius:9,padding:"8px 0",fontSize:10,color:"#ccc",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0d8ce";e.currentTarget.style.color="#ccc";}}>
                  ＋ 追加
                </button>
              </div>
            </div>
          );
        })}
        <div style={{flexShrink:0,width:200}}>
          <button onClick={()=>openNew()}
            style={{width:"100%",border:"2px dashed #e0d8ce",background:"transparent",borderRadius:9,padding:"14px 0",fontSize:11,color:"#ccc",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0d8ce";e.currentTarget.style.color="#ccc";}}>
            ＋ 新規作成
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 予約枠：スロットのラベル生成ヘルパー ──
// type: "weekly"=毎週特定曜日, "daily"=毎日, "nth_weekday"=第N曜日（月次）
function slotLabel(s){
  const DOWL=["","月","火","水","木","金","土","日"];
  const NTH=["","第1","第2","第3","第4","第5"];
  // 後方互換：hourのみある古いデータはHH:00に変換
  const t=s.time||(s.hour!=null?String(s.hour).padStart(2,"0")+":00":"00:00");
  if(s.type==="daily") return `毎日 ${t}`;
  if(s.type==="nth_weekday") return `毎月${NTH[s.nth]||""}${DOWL[s.dow]||""}曜 ${t}`;
  return `毎週${DOWL[s.dow]||""}曜 ${t}`;
}

// ── 日付がスロット条件に一致するか判定 ──
function slotMatchesDate(s,date){
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
function SlotAddForm({onAdd}){
  const [type,setType]=useState("weekly");
  const [dow,setDow]=useState(1);
  const [nth,setNth]=useState(1);
  const [time,setTime]=useState("09:00");
  const [postType,setPostType]=useState("x_post");
  const pt=POST_TYPE[postType];

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
            style={{border:"1px solid #e0d8ce",borderRadius:7,padding:"5px 8px",fontSize:12,color:"#555",outline:"none",background:"#fff",fontFamily:"inherit",cursor:"pointer"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"}
            onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
        </div>
      </div>

      {/* 投稿種類 */}
      <div style={{marginBottom:10}}>
        <label style={{fontSize:10,color:"#888",fontWeight:700,display:"block",marginBottom:4}}>投稿種類</label>
        <select value={postType} onChange={e=>setPostType(e.target.value)}
          style={{border:`1.5px solid ${pt.border}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:pt.color,background:pt.bg,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
          {Object.entries(POST_TYPE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
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

// ════════════════════════════════════════════════════════
// ローカル保存（エクスポート）モーダル
// ════════════════════════════════════════════════════════
const FS_SUPPORTED=typeof window!=="undefined"&&"showDirectoryPicker" in window;

function postToMarkdown(p){
  const links=(p.memoLinks||[]).map(l=>{
    const url=typeof l==="string"?l:l.url;
    const label=typeof l==="string"?"":l.label;
    return label?`- [${label}](${url})`:`- ${url}`;
  }).join("\n");
  return [
    "---",
    `title: "${(p.title||"").replace(/"/g,'\\"')}"`,
    `status: ${p.status}`,
    `postType: ${p.postType||"x_post"}`,
    `datetime: ${p.datetime}`,
    p.memo?`memo: |\n  ${p.memo.replace(/\n/g,"\n  ")}`:"memo: \"\"",
    links?`links:\n${links.split("\n").map(l=>"  "+l).join("\n")}`:"links: []",
    "---",
    "",
    p.title?`# ${p.title}\n`:"",
    (p.body||"").replace(/<[^>]+>/g,"").replace(/\n{3,}/g,"\n\n").trim(),
  ].filter(l=>l!==null).join("\n");
}

function sanitizeFilename(s){
  return (s||"untitled").replace(/[\\/:*?"<>|]/g,"_").slice(0,60);
}

// ════════════════════════════════════════════════════════
// AIコンテキスト出力モーダル
// ════════════════════════════════════════════════════════
function postsToAIContext(posts, accountName, {scores, postTypes, includeBody, includeMemo, includeLinks, prompt}){
  const filtered=posts.filter(p=>{
    const scoreOk=scores.length===0||scores.includes(p.score);
    const typeOk=postTypes.length===0||postTypes.includes(p.postType||"x_post");
    return scoreOk&&typeOk;
  }).sort((a,b)=>b.datetime.localeCompare(a.datetime));

  if(filtered.length===0)return "# 該当する投稿がありませんでした";

  const lines=[];
  if(prompt.trim()){
    lines.push(`# 依頼内容\n${prompt.trim()}\n`);
    lines.push("---\n");
  }
  lines.push(`# ContentOS データ（${accountName}）`);
  lines.push(`取得件数: ${filtered.length}件 / 条件: スコア[${scores.length?scores.join(","):"全て"}] 種類[${postTypes.length?postTypes.map(t=>POST_TYPE[t]?.label||t).join(","):"全て"}]\n`);

  filtered.forEach((p,i)=>{
    const pt=POST_TYPE[p.postType||"x_post"]?.label||p.postType;
    const sc=p.score?` [スコア:${p.score}]`:"";
    const st=STATUS[p.status]?.label||p.status;
    lines.push(`## ${i+1}. ${p.title||"（タイトルなし）"}`);
    lines.push(`- 種類: ${pt}${sc}　ステータス: ${st}　日時: ${p.datetime.replace("T"," ")}`);
    if(includeMemo&&p.memo) lines.push(`- メモ: ${p.memo}`);
    if((p.labels||[]).length>0) lines.push(`- ラベル: ${p.labels.join(", ")}`);
    if(includeLinks&&(p.memoLinks||[]).length>0){
      const ls=(p.memoLinks||[]).map(l=>{
        const url=typeof l==="string"?l:l.url;
        const label=typeof l==="string"?"":l.label;
        return label?`[${label}](${url})`:url;
      });
      lines.push(`- リンク: ${ls.join(" / ")}`);
    }
    if(includeBody&&p.body){
      const plain=p.body.replace(/<[^>]+>/g,"").replace(/\n{3,}/g,"\n\n").trim();
      if(plain) lines.push(`\n### 本文\n${plain}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

function AIContextModal({posts,accountName,onClose}){
  const [scores,setScores]=useState([]);
  const [postTypes,setPostTypes]=useState([]);
  const [includeBody,setIncludeBody]=useState(false);
  const [includeMemo,setIncludeMemo]=useState(true);
  const [includeLinks,setIncludeLinks]=useState(true);
  const [prompt,setPrompt]=useState("");
  const [copied,setCopied]=useState(false);
  const today=fmtDate(new Date());
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState(today);

  const toggle=(arr,setArr,v)=>setArr(prev=>prev.includes(v)?prev.filter(x=>x!==v):[...prev,v]);

  const setPreset=preset=>{
    const d=new Date();
    if(preset==="all"){setDateFrom("");setDateTo(today);return;}
    if(preset==="7"){d.setDate(d.getDate()-7);setDateFrom(fmtDate(d));setDateTo(today);return;}
    if(preset==="30"){d.setDate(d.getDate()-30);setDateFrom(fmtDate(d));setDateTo(today);return;}
    if(preset==="90"){d.setDate(d.getDate()-90);setDateFrom(fmtDate(d));setDateTo(today);return;}
  };

  const preview=React.useMemo(()=>postsToAIContext(
    posts.filter(p=>{
      if(dateFrom&&p.datetime.slice(0,10)<dateFrom)return false;
      if(dateTo&&p.datetime.slice(0,10)>dateTo)return false;
      return true;
    }),
    accountName,{scores,postTypes,includeBody,includeMemo,includeLinks,prompt}
  ),[posts,accountName,scores,postTypes,includeBody,includeMemo,includeLinks,prompt,dateFrom,dateTo]);

  const targetCount=posts.filter(p=>{
    const scoreOk=scores.length===0||scores.includes(p.score);
    const typeOk=postTypes.length===0||postTypes.includes(p.postType||"x_post");
    const fromOk=!dateFrom||p.datetime.slice(0,10)>=dateFrom;
    const toOk=!dateTo||p.datetime.slice(0,10)<=dateTo;
    return scoreOk&&typeOk&&fromOk&&toOk;
  }).length;

  const handleCopy=()=>{
    navigator.clipboard.writeText(preview).then(()=>{
      setCopied(true);setTimeout(()=>setCopied(false),3000);
    });
  };

  const handleDownload=()=>{
    const blob=new Blob([preview],{type:"text/markdown;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`${sanitizeFilename(accountName)}_ai_context.md`;
    a.click();URL.revokeObjectURL(url);
  };

  const chipBtn=(label,active,onClick)=>(
    <button onClick={onClick} style={{padding:"3px 10px",borderRadius:99,border:`1.5px solid ${active?"#111":"#e0d8ce"}`,background:active?"#111":"#fff",color:active?"#fff":"#555",fontSize:11,fontWeight:active?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all .12s"}}>
      {label}
    </button>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:860,maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.15)",border:"1px solid #e6dfd6"}}>
        {/* ヘッダー */}
        <div style={{padding:"14px 20px",borderBottom:"1px solid #e6dfd6",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontWeight:800,fontSize:15,letterSpacing:"-.3px"}}>AIコンテキスト出力</div>
            <div style={{fontSize:11,color:"#a8a09a",marginTop:2}}>投稿データをAIに渡せる形式で出力します</div>
          </div>
          <Btn onClick={onClose}>閉じる</Btn>
        </div>

        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* 左：フィルター設定 */}
          <div style={{width:260,borderRight:"1px solid #e6dfd6",padding:"16px",display:"flex",flexDirection:"column",gap:14,overflowY:"auto",flexShrink:0}}>

            {/* 期間 */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7,letterSpacing:".3px"}}>期間</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                {[["all","全期間"],["7","7日"],["30","30日"],["90","90日"]].map(([v,l])=>{
                  const isActive=v==="all"?!dateFrom:dateFrom===fmtDate(new Date(new Date().setDate(new Date().getDate()-Number(v))));
                  return(
                    <button key={v} onClick={()=>setPreset(v)}
                      style={{padding:"3px 9px",borderRadius:99,border:`1.5px solid ${isActive?"#111":"#e0d8ce"}`,background:isActive?"#111":"#fff",color:isActive?"#fff":"#555",fontSize:11,fontWeight:isActive?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all .12s"}}>
                      {l}
                    </button>
                  );
                })}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  style={{flex:1,border:"1px solid #e0d8ce",borderRadius:7,padding:"5px 7px",fontSize:11,fontFamily:"inherit",outline:"none",color:"#333"}}
                  onFocus={e=>e.target.style.borderColor="#111"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
                <span style={{fontSize:11,color:"#aaa"}}>〜</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  style={{flex:1,border:"1px solid #e0d8ce",borderRadius:7,padding:"5px 7px",fontSize:11,fontFamily:"inherit",outline:"none",color:"#333"}}
                  onFocus={e=>e.target.style.borderColor="#111"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
              </div>
            </div>

            {/* スコア */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7,letterSpacing:".3px"}}>スコア</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {chipBtn("全て",scores.length===0,()=>setScores([]))}
                {Object.entries(SCORE).map(([k])=>chipBtn(k,scores.includes(k),()=>toggle(scores,setScores,k)))}
              </div>
            </div>

            {/* 投稿種類 */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7,letterSpacing:".3px"}}>投稿種類</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {chipBtn("全て",postTypes.length===0,()=>setPostTypes([]))}
                {Object.entries(POST_TYPE).map(([k,v])=>chipBtn(v.label,postTypes.includes(k),()=>toggle(postTypes,setPostTypes,k)))}
              </div>
            </div>

            {/* 含める情報 */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7,letterSpacing:".3px"}}>含める情報</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[
                  ["本文（長くなります）",includeBody,setIncludeBody],
                  ["メモ",includeMemo,setIncludeMemo],
                  ["リンク",includeLinks,setIncludeLinks],
                ].map(([label,val,setter])=>(
                  <label key={label} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"#444"}}>
                    <input type="checkbox" checked={val} onChange={e=>setter(e.target.checked)} style={{accentColor:"#111",width:14,height:14}}/>
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* プロンプト */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7,letterSpacing:".3px"}}>依頼文（任意）</div>
              <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
                placeholder={"例：これらのSランク記事を参考に、来週のX投稿アイデアを5つ提案してください。"}
                rows={4}
                style={{width:"100%",border:"1px solid #e0d8ce",borderRadius:8,padding:"8px 10px",fontSize:11.5,fontFamily:"inherit",color:"#333",outline:"none",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="#111"}
                onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
            </div>

            {/* 件数 */}
            <div style={{background:"#f5f0eb",borderRadius:8,padding:"8px 12px",fontSize:11.5,color:"#555"}}>
              対象: <strong>{targetCount}件</strong>
            </div>

            {/* ボタン */}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <button onClick={handleCopy}
                style={{background:copied?"#10b981":"#111",border:"none",borderRadius:9,padding:"10px 0",fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit",transition:"background .15s"}}>
                {copied?"✓ コピーしました":"クリップボードにコピー"}
              </button>
              <button onClick={handleDownload}
                style={{background:"#fff",border:"1px solid #e0d8ce",borderRadius:9,padding:"9px 0",fontSize:13,fontWeight:600,color:"#333",cursor:"pointer",fontFamily:"inherit"}}
                onMouseEnter={e=>e.currentTarget.style.background="#f5f0eb"}
                onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                MDファイルでダウンロード
              </button>
            </div>
          </div>

          {/* 右：プレビュー */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"10px 16px",borderBottom:"1px solid #e6dfd6",fontSize:11,color:"#a8a09a",fontWeight:600,letterSpacing:".3px",flexShrink:0}}>
              プレビュー
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
              <pre style={{fontSize:11.5,lineHeight:1.7,color:"#333",whiteSpace:"pre-wrap",wordBreak:"break-word",fontFamily:"'Geist Mono','SF Mono','Menlo',monospace",margin:0}}>
                {preview}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportModal({posts,accountName,onClose}){
  const [format,setFormat]=useState("md");
  const [scope,setScope]=useState("all");
  const [statusFilter,setStatusFilter]=useState("all");
  const [folderHandle,setFolderHandle]=useState(null);
  const [progress,setProgress]=useState(null); // null | {done,total,errors}
  const [done,setDone]=useState(false);

  const targetPosts=React.useMemo(()=>{
    if(scope==="all")return posts;
    return posts.filter(p=>p.status===statusFilter);
  },[posts,scope,statusFilter]);

  const pickFolder=async()=>{
    try{
      const h=await window.showDirectoryPicker({mode:"readwrite"});
      setFolderHandle(h);
    }catch(e){
      if(e.name!=="AbortError")alert("フォルダの取得に失敗しました: "+e.message);
    }
  };

  const runExport=async()=>{
    setProgress({done:0,total:targetPosts.length,errors:[]});
    setDone(false);

    if(FS_SUPPORTED&&folderHandle){
      // File System Access API — フォルダに直接書き込み
      const errors=[];
      for(let i=0;i<targetPosts.length;i++){
        const p=targetPosts[i];
        try{
          const date=p.datetime.slice(0,10);
          const name=`${date}_${sanitizeFilename(p.title)}.${format}`;
          const content=format==="md"?postToMarkdown(p):JSON.stringify(p,null,2);
          const fh=await folderHandle.getFileHandle(name,{create:true});
          const w=await fh.createWritable();
          await w.write(content);
          await w.close();
        }catch(e){
          errors.push(p.title||"(無題)");
        }
        setProgress({done:i+1,total:targetPosts.length,errors});
      }
      setDone(true);
    }else{
      // フォールバック：ZIPダウンロード（JSZipなし → 単一JSONで代替）
      const content=format==="md"
        ?targetPosts.map(p=>`${"=".repeat(60)}\n${postToMarkdown(p)}`).join("\n\n")
        :JSON.stringify(targetPosts,null,2);
      const blob=new Blob([content],{type:"text/plain;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`${sanitizeFilename(accountName)}_export.${format==="md"?"txt":"json"}`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress({done:targetPosts.length,total:targetPosts.length,errors:[]});
      setDone(true);
    }
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:460,maxHeight:"88vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000030"}}>
        {/* ヘッダー */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid #e6dfd6",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f5f0eb",flexShrink:0}}>
          <div>
            <div style={{fontWeight:800,fontSize:14}}>💾 ローカル保存</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{accountName} の投稿をファイルに書き出す</div>
          </div>
          <Btn onClick={onClose}>閉じる</Btn>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:16}}>

          {/* フォーマット */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>ファイル形式</div>
            <div style={{display:"flex",gap:6}}>
              {[["md","Markdown (.md)"],["json","JSON (.json)"]].map(([v,l])=>(
                <button key={v} onClick={()=>setFormat(v)}
                  style={{flex:1,border:`1.5px solid ${format===v?"#f59e0b":"#e0d8ce"}`,borderRadius:9,padding:"10px 0",background:format===v?"#fef3c7":"#fff",color:format===v?"#d97706":"#555",fontWeight:format===v?700:500,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                  {l}
                </button>
              ))}
            </div>
            {format==="md"&&<div style={{fontSize:10,color:"#aaa",marginTop:5}}>frontmatter付き。タイトル・本文・ステータス・リンクを含む</div>}
            {format==="json"&&<div style={{fontSize:10,color:"#aaa",marginTop:5}}>全フィールドをそのまま保存。インポート・バックアップ向け</div>}
          </div>

          {/* 対象 */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>対象</div>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[["all","すべて"],["filter","ステータス絞り込み"]].map(([v,l])=>(
                <button key={v} onClick={()=>setScope(v)}
                  style={{flex:1,border:`1.5px solid ${scope===v?"#f59e0b":"#e0d8ce"}`,borderRadius:9,padding:"8px 0",background:scope===v?"#fef3c7":"#fff",color:scope===v?"#d97706":"#555",fontWeight:scope===v?700:500,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                  {l}
                </button>
              ))}
            </div>
            {scope==="filter"&&(
              <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                style={{width:"100%",border:"1px solid #e0d8ce",borderRadius:8,padding:"7px 10px",fontSize:12,color:"#555",outline:"none",cursor:"pointer",background:"#fff",fontFamily:"inherit"}}>
                {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            )}
            <div style={{fontSize:11,color:"#555",marginTop:6,background:"#f8f5f1",border:"1px solid #e6dfd6",borderRadius:7,padding:"6px 10px"}}>
              対象: <strong>{targetPosts.length}件</strong>
            </div>
          </div>

          {/* フォルダ選択 */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>保存先フォルダ</div>
            {FS_SUPPORTED?(
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={pickFolder}
                  style={{flex:1,border:`1.5px solid ${folderHandle?"#10b981":"#e0d8ce"}`,borderRadius:9,padding:"10px 14px",background:folderHandle?"#d1fae5":"#fff",color:folderHandle?"#059669":"#555",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {folderHandle?`📁 ${folderHandle.name}`:"📁 フォルダを選択…"}
                </button>
                {folderHandle&&<button onClick={()=>setFolderHandle(null)} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer",fontSize:16,padding:"4px"}}>×</button>}
              </div>
            ):(
              <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 12px",fontSize:11,color:"#92400e",lineHeight:1.6}}>
                このブラウザはフォルダ選択に対応していません。<br/>
                代わりに全件をひとつのファイルとしてダウンロードします。<br/>
                <span style={{fontSize:10,color:"#aaa"}}>(Chrome / Edge 推奨)</span>
              </div>
            )}
          </div>

          {/* 進捗 */}
          {progress&&(
            <div style={{background:"#f8f5f1",border:"1px solid #e6dfd6",borderRadius:9,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700,marginBottom:6,color:done?"#059669":"#555"}}>
                <span>{done?"✅ 完了":"⏳ 書き出し中…"}</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div style={{height:6,background:"#e6dfd6",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",background:done?"#10b981":"#f59e0b",borderRadius:3,width:`${(progress.done/progress.total)*100}%`,transition:"width .2s"}}/>
              </div>
              {progress.errors.length>0&&(
                <div style={{marginTop:8,fontSize:10,color:"#ef4444"}}>
                  失敗: {progress.errors.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={{padding:"12px 18px",borderTop:"1px solid #e6dfd6",display:"flex",gap:8,justifyContent:"flex-end",background:"#f5f0eb",flexShrink:0}}>
          <Btn onClick={onClose}>キャンセル</Btn>
          <button onClick={runExport}
            disabled={FS_SUPPORTED&&!folderHandle||targetPosts.length===0||!!progress&&!done}
            style={{background:(FS_SUPPORTED&&!folderHandle)||targetPosts.length===0?"#d1d5db":"#f59e0b",border:"none",borderRadius:8,padding:"7px 20px",fontSize:12,fontWeight:800,color:"#fff",cursor:(FS_SUPPORTED&&!folderHandle)||targetPosts.length===0?"default":"pointer",fontFamily:"inherit",transition:"background .15s"}}>
            {done?"もう一度":"書き出す"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// 通知設定モーダル
// ════════════════════════════════════════════════════════
function NotifySettingsModal({settings,accountName,onSave,onClose,onTestSend}){
  const [draft,setDraft]=useState({...settings});
  const [sending,setSending]=useState(false);
  const changed=JSON.stringify(draft)!==JSON.stringify(settings);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000030"}}>
        {/* ヘッダー */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid #e6dfd6",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f5f0eb"}}>
          <div>
            <div style={{fontWeight:800,fontSize:14}}>🔔 メール通知設定</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{accountName} — Vercel Cronで毎日自動送信</div>
          </div>
          <Btn onClick={onClose}>閉じる</Btn>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:14}}>
          {/* 有効/無効トグル */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:draft.enabled?"#f0fdf4":"#f9fafb",border:`1.5px solid ${draft.enabled?"#86efac":"#e0d8ce"}`,borderRadius:10,padding:"12px 14px"}}>
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
              style={{border:"1px solid #e0d8ce",borderRadius:8,padding:"7px 10px",fontSize:13,color:"#555",outline:"none",cursor:"pointer",background:"#fff",fontFamily:"inherit"}}>
              {HOURS.map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}
            </select>
            <span style={{fontSize:11,color:"#aaa",marginLeft:8}}>（JST）毎日この時刻に送信</span>
          </div>
          {/* 通知種別 */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#888",display:"block",marginBottom:8}}>通知内容</label>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
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
        <div style={{padding:"12px 18px",borderTop:"1px solid #e6dfd6",display:"flex",gap:8,background:"#f5f0eb"}}>
          <button onClick={async()=>{setSending(true);await onTestSend(draft.email);setSending(false);}}
            disabled={!draft.email||sending}
            style={{border:"1px solid #e0d8ce",background:"#fff",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:draft.email?"#555":"#bbb",cursor:draft.email?"pointer":"default",fontFamily:"inherit"}}>
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

// ── ⑦ キーボードショートカット一覧（ヘルプ） ──
// （将来的にモーダルとして表示）
// N=新規, ←/→=週移動, C=ビュー切替, E=編集, ⌘K=検索

// ── 共通UIコンポーネント ──
function Btn({children,onClick,primary,danger,style}){
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
const INP={width:"100%",background:"#fff",border:"1px solid #e6dfd6",borderRadius:8,padding:"7px 10px",color:"#111",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border-color .12s"};
// ════════════════════════════════════════════════════════
// PortalAuthWrapper — Firebase認証 + Firestore権限チェック
// ════════════════════════════════════════════════════════
function PortalAuthWrapper({children}){
  const [state,setState]=useState("loading");
  const [uid,setUid]=useState(null);

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,async user=>{
      if(!user){setState("unauthed");return;}
      try{
        const snap=await getDoc(doc(db,"users",user.uid));
        if(!snap.exists()){setState("denied");return;}
        const d=snap.data();
        const isAdmin=d.role==="admin";
        const isPaid =d.paymentStatus==="paid"&&(d.allowedApps||[]).includes(PORTAL_APP_ID);
        if(isAdmin||isPaid){setUid(user.uid);setState("allowed");}
        else setState("denied");
      }catch(e){
        console.error(e);
        setState("denied");
      }
    });
    return()=>unsub();
  },[]);

  if(state==="loading") return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f0eb",fontFamily:"'Geist','Hiragino Sans','Noto Sans JP',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:22,fontWeight:900,marginBottom:12,letterSpacing:"-0.8px"}}>Content<span style={{color:"#f59e0b"}}>OS</span></div>
        <div style={{width:32,height:2,background:"#e6dfd6",borderRadius:99,margin:"0 auto",overflow:"hidden"}}>
          <div style={{width:"60%",height:"100%",background:"#f59e0b",borderRadius:99,animation:"slide 1s infinite"}}/>
        </div>
        <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
      </div>
    </div>
  );

  if(state==="unauthed") return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f0eb",fontFamily:"'Geist','Hiragino Sans','Noto Sans JP',sans-serif"}}>
      <div style={{background:"#fff",borderRadius:16,padding:"44px 48px",textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,.08)",maxWidth:360,width:"100%",border:"1px solid #e6dfd6"}}>
        <div style={{fontSize:22,fontWeight:900,marginBottom:4,letterSpacing:"-0.8px"}}>Content<span style={{color:"#f59e0b"}}>OS</span></div>
        <div style={{fontSize:12.5,color:"#a8a09a",marginBottom:32}}>コンテンツ管理ツール</div>
        <button
          onClick={()=>signInWithPopup(auth,googleProvider).catch(console.error)}
          style={{display:"flex",alignItems:"center",gap:10,margin:"0 auto",border:"1px solid #e6dfd6",borderRadius:10,padding:"11px 22px",fontSize:13.5,fontWeight:600,cursor:"pointer",background:"#fff",fontFamily:"inherit",color:"#333",boxShadow:"0 1px 4px rgba(0,0,0,.06)",transition:"all .12s"}}
          onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)";e.currentTarget.style.transform="translateY(-1px)";}}
          onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.06)";e.currentTarget.style.transform="none";}}>
          <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Googleでログイン
        </button>
        <a href={PORTAL_URL} style={{display:"block",marginTop:24,fontSize:11,color:"#c4b8ad",textDecoration:"none",letterSpacing:".2px"}}
          onMouseEnter={e=>e.currentTarget.style.color="#888"}
          onMouseLeave={e=>e.currentTarget.style.color="#c4b8ad"}>
          ポータルサイトへ戻る →
        </a>
      </div>
    </div>
  );

  if(state==="denied"){
    window.location.href=PORTAL_URL;
    return null;
  }

  return children(uid);
}

// ── ポータル認証付きエクスポート ──
export default function AppWithAuth(){
  return(
    <PortalAuthWrapper>
      {uid=><App uid={uid}/>}
    </PortalAuthWrapper>
  );
}
