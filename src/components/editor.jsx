import React, { useState, useRef, useEffect, useCallback } from "react";
import { POST_TYPE, getPostTypeStyle, BD, BD2, S, XFONT, TOOLBAR_BLOCK_LABELS, IMG_SIZES_OPTS, IMG_ALIGNS_OPTS, STORAGE_BUCKET, stripHtml } from "../constants.js";
import { supabase } from "../lib/supabase.js";
import { auth } from "../firebase.js"; import { buildPasteHtml } from "../lib/paste.js"; import { uploadImage } from "../lib/articleImages.js";
import { useDialogFocus } from "../lib/useDialogFocus.js";
import { searchMaps } from "../lib/mindmapLink.js";
import { loadOthers, SWIPE_URL } from "../screens/FindView.jsx";

// ════════════════════════════════════════════════════════
// WYSIWYG
// ════════════════════════════════════════════════════════
// 2026-11-07 Notion の形へ 便③：「/」で機能を呼ぶ一覧（slash が真のときだけ）と、文字を選んだときだけ出る書式の帯（bubble が真のときだけ）
const SLASH_ITEMS=[
  {k:"p",l:"本文",i:"Aa",g:"基本"},{k:"h1",l:"見出し",i:"H1",g:"基本"},{k:"h2",l:"小見出し",i:"H2",g:"基本"},
  {k:"ul",l:"箇条書き",i:"•",g:"基本"},{k:"ol",l:"番号リスト",i:"1.",g:"基本"},{k:"quote",l:"引用",i:"❝",g:"基本"},{k:"hr",l:"区切り線",i:"—",g:"基本"},
  {k:"image",l:"画像",i:"▣",g:"コンテンツくん"},{k:"insert",l:"リンク・埋め込み",i:"↗",g:"コンテンツくん"},{k:"thread",l:"スレッドの区切り",i:"𝕏",g:"コンテンツくん"},
];
const runBlock=k=>{
  const ex=(c,v)=>document.execCommand(c,false,v??null);
  if(k==="p")clearFormat();
  else if(k==="h1"||k==="h2")toggleBlock(k);
  else if(k==="quote")toggleBlock("blockquote");
  else if(k==="ul")ex("insertUnorderedList");
  else if(k==="ol")ex("insertOrderedList");
  else if(k==="hr")ex("insertHorizontalRule");
  else if(k==="thread")ex("insertHTML",'<hr class="thread-sep" data-thread="true"><p><br></p>');
};

// 2026-11-10 Naoki「書式解除、本文に戻すも使いづらい」→ デモに OK 11:36
// 今の段の形（見出し・小見出し・引用・本文）と、箇条書きの中かを読む
export function curBlock(){
  try{
    const sel=window.getSelection();if(!sel||!sel.rangeCount)return {tag:"p",list:null};
    const n=sel.anchorNode;const el=n&&n.nodeType===3?n.parentElement:n;
    const b=el&&el.closest?el.closest("h1,h2,blockquote"):null;
    const l=el&&el.closest?el.closest("ul,ol"):null;
    return {tag:b?b.tagName.toLowerCase():"p",list:l?l.tagName.toLowerCase():null};
  }catch{return {tag:"p",list:null};}
}
// 見出し・小見出し・引用：今と同じ形をもう一度押すと本文に戻る。箇条書きの中なら先に箇条書きを外す
export function toggleBlock(tag){
  const ex=(c,v)=>document.execCommand(c,false,v??null);
  const c=curBlock();
  if(c.list&&tag!=="p")ex(c.list==="ul"?"insertUnorderedList":"insertOrderedList");
  ex("formatBlock",c.tag===tag?"p":tag);
}
// 書式を外す：太字・斜体・取り消し線・リンク・箇条書き・見出し・引用を一度に外して本文に戻す（⌘＼ でも）
// 段の形は execCommand に任せず、選んだ範囲にかかる段を 1 つずつ <p> に置き換える
// （formatBlock は箇条書きをまたぐと <p> の中に <ul> を入れたり、段の順番を入れ替えたりするため・2026-11-10 の試しで見つけた）
export function clearFormat(){
  const ex=(c,v)=>document.execCommand(c,false,v??null);
  const sel=window.getSelection();if(!sel||!sel.rangeCount)return;
  const n0=sel.anchorNode;const root=(n0&&n0.nodeType===3?n0.parentElement:n0)?.closest?.('[contenteditable="true"],[contenteditable=""]');
  if(!root)return;
  const range=sel.getRangeAt(0);
  if(!range.collapsed){ex("removeFormat");ex("unlink");}
  else{ // 何も選んでいないときは、今の段の中の太字などを外す
    const r=sel.getRangeAt(0);const blk=(r.startContainer.nodeType===3?r.startContainer.parentElement:r.startContainer).closest("p,h1,h2,h3,blockquote,li");
    if(blk&&root.contains(blk)){const rr=document.createRange();rr.selectNodeContents(blk);sel.removeAllRanges();sel.addRange(rr);ex("removeFormat");ex("unlink");sel.collapseToEnd();}
  }
  const rg=sel.getRangeAt(0);
  const hits=el=>{try{return rg.intersectsNode(el);}catch{return false;}};
  const toP=el=>{const p=document.createElement("p");
    // 引用の中に段があれば、中身の字だけを順に入れる
    while(el.firstChild){const c=el.firstChild;if(c.nodeType===1&&/^(P|DIV|H1|H2|H3|BLOCKQUOTE)$/.test(c.tagName)){while(c.firstChild)p.appendChild(c.firstChild);if(c.nextSibling)p.appendChild(document.createElement("br"));c.remove();}else if(c.nodeType===1&&/^(UL|OL)$/.test(c.tagName)){c.remove();}else p.appendChild(c);}
    if(!p.childNodes.length)p.appendChild(document.createElement("br"));return p;};
  const made=[];
  for(const top of [...root.children]){
    if(!hits(top))continue;
    if(/^(H1|H2|H3|BLOCKQUOTE)$/.test(top.tagName)){const p=toP(top);top.replaceWith(p);made.push(p);}
    else if(/^(UL|OL)$/.test(top.tagName)){
      const items=[...top.children];const out=[];let run=null;
      for(const li of items){
        if(li.tagName==="LI"&&hits(li)){
          const nested=[...li.querySelectorAll(":scope > ul, :scope > ol")];nested.forEach(x=>x.remove());
          const p=toP(li);out.push(p);made.push(p);run=null;
          // 中の箇条書き（字下げした行）は、外した行のすぐ下に箇条書きのまま残す
          nested.forEach(x=>out.push(x));
        }else{if(!run){run=document.createElement(top.tagName.toLowerCase());out.push(run);}run.appendChild(li);}
      }
      top.replaceWith(...out);
    }
  }
  if(made.length){try{const r=document.createRange();r.setStartBefore(made[0]);r.setEndAfter(made[made.length-1]);sel.removeAllRanges();sel.addRange(r);}catch{}}
}
export function BodyEditor({value,onChange,editorRef,slash=false,bubble=false,onInsertOpen}){
  const isComposing=useRef(false),internal=useRef(false);
  const [sl,setSl]=useState(null); // {q, x, y, i}
  const slRef=useRef(null);slRef.current=sl;
  const [bb,setBb]=useState(null); // {x, y, tag, list, b, i, s}
  const bbRef=useRef(null);
  const slItems=sl?SLASH_ITEMS.filter(it=>!sl.q||it.l.includes(sl.q)):[];
  // 「/」の後ろの言葉を、今カーソルのある文字の並びから読む（行の頭か空白のあとの「/」だけ）
  const readSlash=()=>{
    if(!slash)return;
    const sel=window.getSelection();if(!sel||!sel.rangeCount||!sel.isCollapsed){setSl(null);return;}
    const n=sel.anchorNode;if(!n||n.nodeType!==3||!editorRef.current?.contains(n)){setSl(null);return;}
    const t=n.textContent.slice(0,sel.anchorOffset);const m=t.match(/(?:^|[\s　])[\/／]([^\s　\/／]{0,12})$/);
    if(!m){setSl(null);return;}
    const r=sel.getRangeAt(0).getBoundingClientRect();
    setSl(o=>({q:m[1],x:r.left,y:r.bottom+6,i:o&&o.q===m[1]?o.i:0,node:n,end:sel.anchorOffset,start:sel.anchorOffset-m[1].length-1}));
  };
  const pickSlash=it=>{
    const cur=slRef.current;if(!cur)return;
    try{const r=document.createRange();r.setStart(cur.node,cur.start);r.setEnd(cur.node,cur.end);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);document.execCommand("delete");}catch{/* 消せなくても機能は動かす */}
    setSl(null);
    if(it.k==="image"){onInsertOpen&&onInsertOpen("image");return;}
    if(it.k==="insert"){onInsertOpen&&onInsertOpen("post");return;}
    runBlock(it.k);emit();
  };
  useEffect(()=>{
    if(!bubble)return;
    const upd=()=>{
      const sel=window.getSelection();
      if(!sel||!sel.rangeCount||sel.isCollapsed||!editorRef.current?.contains(sel.anchorNode)){setBb(null);return;}
      const r=sel.getRangeAt(0).getBoundingClientRect();if(!r.width){setBb(null);return;}
      const c=curBlock();let b=false,i=false,st=false;try{b=document.queryCommandState("bold");i=document.queryCommandState("italic");st=document.queryCommandState("strikeThrough");}catch{}
      setBb({x:r.left+r.width/2,y:r.top-8,tag:c.tag,list:c.list,b,i,s:st});
    };
    // 画面の形が変わったとき（集中モード・スクロール・幅の変化）も、帯を選んだ文字の上へ置き直す
    const later=()=>requestAnimationFrame(upd);
    document.addEventListener("selectionchange",upd);window.addEventListener("resize",later);document.addEventListener("scroll",later,true);
    const ro=typeof ResizeObserver!=="undefined"&&editorRef.current?new ResizeObserver(later):null;if(ro)ro.observe(editorRef.current);
    return()=>{document.removeEventListener("selectionchange",upd);window.removeEventListener("resize",later);document.removeEventListener("scroll",later,true);if(ro)ro.disconnect();};
  },[bubble]);
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
    // ⌘＼（Ctrl＋＼）で書式を外す（Google ドキュメントと同じ）
    if((e.metaKey||e.ctrlKey)&&(e.key==="\\"||e.code==="Backslash"||e.code==="IntlYen"||e.key==="¥")){e.preventDefault();clearFormat();emit();return;}
    // 「/」の一覧が開いている間は、↑↓ で選ぶ・Enter で入れる・Esc で閉じる
    if(slRef.current&&slItems.length){
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();const d=e.key==="ArrowDown"?1:-1;setSl(o=>({...o,i:(o.i+d+slItems.length)%slItems.length}));return;}
      if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();pickSlash(slItems[Math.min(slRef.current.i,slItems.length-1)]);return;}
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();setSl(null);return;}
    }

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

  // on：今の形なら明るく（押すと外れる）。押したあとは帯の光り方を今の形に合わせ直す
  const bbBtn=(l,fn,t,on)=><button key={t||l} title={t||l} aria-label={t||l} aria-pressed={on===undefined?undefined:!!on} onMouseDown={e=>{e.preventDefault();fn();emit();const c=curBlock();let b=false,i=false,st=false;try{b=document.queryCommandState("bold");i=document.queryCommandState("italic");st=document.queryCommandState("strikeThrough");}catch{}setBb(o=>o?{...o,tag:c.tag,list:c.list,b,i,s:st}:o);}} style={{border:"none",background:on?"rgba(255,255,255,.22)":"none",color:"#fff",fontSize:12.5,fontWeight:700,padding:"5px 9px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",minHeight:28}}>{l}</button>;
  const ex=(c,v)=>document.execCommand(c,false,v??null);
  return(<>
    {sl&&slItems.length>0&&<div role="listbox" aria-label="入れるもの" style={{position:"fixed",left:Math.min(sl.x,window.innerWidth-290),top:Math.min(sl.y,window.innerHeight-330),zIndex:400,width:270,maxHeight:320,overflowY:"auto",background:"#fff",border:"1px solid #e6dfd6",borderRadius:12,boxShadow:"0 10px 30px rgba(0,0,0,.14)",padding:5}}>
      {slItems.map((it,j)=><React.Fragment key={it.k}>
        {(j===0||slItems[j-1].g!==it.g)&&<div style={{fontSize:12,fontWeight:700,color:"#736a62",padding:"6px 8px 2px"}}>{it.g}</div>}
        <button role="option" aria-selected={j===sl.i} onMouseDown={e=>{e.preventDefault();pickSlash(it);}} onMouseEnter={()=>setSl(o=>({...o,i:j}))}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",border:"none",background:j===sl.i?"#f7f3ee":"none",borderRadius:7,padding:"5px 8px",fontSize:13,textAlign:"left",cursor:"pointer",fontFamily:"inherit",color:"#1a1a1a"}}>
          <span style={{width:26,height:26,border:"1px solid #e6dfd6",borderRadius:6,display:"grid",placeItems:"center",fontSize:12,fontWeight:700,color:"#6b6259",background:"#fff",flexShrink:0}}>{it.i}</span>{it.l}</button>
      </React.Fragment>)}
    </div>}
    {/* 2026-11-09 Naoki「書式変更メニューに箇条書きや画像挿入がない」→ 箇条書き・番号リスト・画像を足した。帯は選んだ文字の真ん中に置き、画面の端からはみ出さない */}
    {bb&&(()=>{const w=bbRef.current?.offsetWidth||520;const left=Math.min(Math.max(8,bb.x-w/2),window.innerWidth-w-8);
      const sep=k=><span key={k} aria-hidden="true" style={{width:1,alignSelf:"stretch",margin:"4px 2px",background:"rgba(255,255,255,.22)"}}/>;
      return <div ref={bbRef} role="toolbar" aria-label="書式" style={{position:"fixed",left,top:Math.max(8,bb.y-40),zIndex:400,display:"flex",alignItems:"center",gap:1,background:"#1a1a1a",borderRadius:9,padding:3,boxShadow:"0 6px 18px rgba(0,0,0,.2)",whiteSpace:"nowrap"}}>
      {bbBtn(<strong>B</strong>,()=>ex("bold"),"太字",bb.b)}{bbBtn(<em>I</em>,()=>ex("italic"),"斜体",bb.i)}{bbBtn(<s>S</s>,()=>ex("strikeThrough"),"取り消し線",bb.s)}
      {sep("a")}{bbBtn("見出し",()=>toggleBlock("h1"),bb.tag==="h1"?"見出し（押すと本文に戻る）":"見出し",bb.tag==="h1")}{bbBtn("小見出し",()=>toggleBlock("h2"),bb.tag==="h2"?"小見出し（押すと本文に戻る）":"小見出し",bb.tag==="h2")}{bbBtn("引用",()=>toggleBlock("blockquote"),bb.tag==="blockquote"?"引用（押すと本文に戻る）":"引用",bb.tag==="blockquote")}
      {sep("b")}{bbBtn("• 箇条書き",()=>ex("insertUnorderedList"),"箇条書き",bb.list==="ul")}{bbBtn("1. 番号",()=>ex("insertOrderedList"),"番号リスト",bb.list==="ol")}
      {sep("c")}{bbBtn("リンク",()=>{const u=prompt("URL:");if(u)ex("createLink",u);})}
      <button key="img" title="画像（選んだ文字のあとに入れる）" aria-label="画像を挿入" onMouseDown={e=>{e.preventDefault();const sel=window.getSelection();if(sel&&sel.rangeCount)sel.collapseToEnd();setBb(null);onInsertOpen&&onInsertOpen("image");}} style={{border:"none",background:"none",color:"#fff",fontSize:12.5,fontWeight:700,padding:"5px 9px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",minHeight:28}}>画像</button>
      {sep("d")}{bbBtn("✕ 書式を外す",()=>clearFormat(),"書式を外して本文に戻す（⌘＼）")}
    </div>;})()}
    <div ref={editorRef} contentEditable suppressContentEditableWarning
      className="xb" data-ph="本文を入力…"
      onCompositionStart={()=>{isComposing.current=true;}}
      onCompositionEnd={()=>{isComposing.current=false;emit();readSlash();}}
      onInput={()=>{if(!isComposing.current){emit();readSlash();}}}
      onBlur={()=>setTimeout(()=>setSl(null),120)}
      onPaste={e=>{
        e.preventDefault();
        // 2026-11-07：画像だけを貼ったとき（スクショなど）は、置き場へ上げて本文に差し込む
        const imgs=[...(e.clipboardData?.files||[])].filter(f=>/^image\//.test(f.type||""));
        if(imgs.length&&!(e.clipboardData.getData("text/plain")||"").trim()){
          const sel=window.getSelection();const at=sel&&sel.rangeCount?sel.getRangeAt(0).cloneRange():null;
          const mark=document.createElement("span");mark.textContent="画像を置いています…";mark.style.color="#736a62";
          if(at){at.deleteContents();at.insertNode(mark);}else editorRef.current?.appendChild(mark);
          (async()=>{
            let out="";
            for(const f of imgs){try{const url=await uploadImage(f);out+=`<p><img src="${url}" alt="" style="max-width:100%;width:100%;border-radius:8px;display:block;margin-left:0;margin-right:auto;"/></p>`;}catch(err){out+=`<p>（画像を置けませんでした：${String(err.message||err).replace(/[<>&]/g,"")}）</p>`;}}
            const tmp=document.createElement("div");tmp.innerHTML=out;
            mark.replaceWith(...tmp.childNodes);emit();
          })();
          return;
        }
        const html=buildPasteHtml(e.clipboardData);
        if(!html)return;
        document.execCommand("insertHTML",false,html);
        emit();
      }}
      onKeyDown={handleKeyDown}
      style={{minHeight:360,fontSize:17,lineHeight:1.75,color:"#0f1419",fontFamily:XFONT,wordBreak:"break-word",caretColor:"#1d9bf0",outline:"none"}}
    />
  </>);
}

// ── ツールバー用ボタン（Toolbar外で定義することで毎レンダー再生成を防ぐ） ──
export function ToolbarBtn({title,onClick,active,ch}){
  return(
    <button title={title} onMouseDown={e=>{e.preventDefault();onClick();}}
      style={{border:active?"1.5px solid #1d9bf0":"1px solid transparent",background:active?"#e8f5fe":"none",color:active?"#1d9bf0":"#536471",borderRadius:5,padding:"4px 6px",cursor:"pointer",fontSize:"max(12px,0.82em)",fontWeight:active?800:600,display:"flex",alignItems:"center",justifyContent:"center",height:28,minWidth:26,fontFamily:"inherit",transition:"all .1s"}}
      onMouseEnter={e=>{if(!active){e.currentTarget.style.background="#eff3f4";e.currentTarget.style.color="#0f1419";}}}
      onMouseLeave={e=>{if(!active){e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";}}}>
      {ch}
    </button>
  );
}
export function ToolbarSep(){return <div style={{width:1,height:16,background:"#e6dfd6",margin:"0 2px"}}/>;}

export function Toolbar({onInsertOpen}){
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
        const lst=el?.closest("ul,ol");
        setFmt({
          list:lst?lst.tagName.toLowerCase():null,
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
    <div style={{...S.row,gap:1,padding:"5px 14px",borderBottom:BD2,background:"#fff",flexWrap:"wrap",flexShrink:0}}>
      {/* 形式セレクト（現在の形式を表示） */}
      <select value={["p","h1","h2","blockquote"].includes(fmt.block)?fmt.block:"p"}
        onChange={e=>{const v=e.target.value;if(v==="p")clearFormat();else toggleBlock(v);}}
        style={{border:BD2,borderRadius:5,padding:"2px 7px",fontSize:"max(12px,0.77em)",color:"#1a1a1a",background:"#fff",cursor:"pointer",fontFamily:"inherit",height:28,fontWeight:600}}>
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
      <ToolbarBtn title="箇条書き" onClick={()=>exec("insertUnorderedList")} active={fmt.list==="ul"} ch={
        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="1.5" cy="3" r="1.5"/><rect x="4" y="2" width="10" height="2" rx="1"/>
          <circle cx="1.5" cy="7" r="1.5"/><rect x="4" y="6" width="10" height="2" rx="1"/>
          <circle cx="1.5" cy="11" r="1.5"/><rect x="4" y="10" width="10" height="2" rx="1"/>
        </svg>}/>
      <ToolbarBtn title="番号リスト" onClick={()=>exec("insertOrderedList")} active={fmt.list==="ol"} ch="1≡"/>
      <ToolbarSep/>
      <ToolbarBtn title="リンク" onClick={()=>{const u=prompt("URL:");if(u)exec("createLink",u);}} active={false} ch="🔗"/>
      <ToolbarBtn title="区切り線" onClick={()=>exec("insertHorizontalRule")} active={false} ch="—"/>
      <button onMouseDown={e=>e.preventDefault()}
        onClick={()=>{
          // スレッド区切り専用のhr（class="thread-sep"）を挿入
          document.execCommand("insertHTML",false,'<hr class="thread-sep" data-thread="true"><p><br></p>');
        }}
        style={{border:"1px solid #1d9bf0",background:"#e8f5fe",color:"#1d9bf0",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:"max(12px,0.73em)",fontWeight:700,height:28,display:"flex",alignItems:"center",gap:2,fontFamily:"inherit",marginLeft:3}}
        onMouseEnter={e=>{e.currentTarget.style.background="#1d9bf0";e.currentTarget.style.color="#fff";}}
        onMouseLeave={e=>{e.currentTarget.style.background="#e8f5fe";e.currentTarget.style.color="#1d9bf0";}}>
        𝕏 スレッド↓
      </button>
      <button onMouseDown={e=>e.preventDefault()} onClick={onInsertOpen}
        style={{border:BD2,background:"none",color:"#536471",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:"max(12px,0.73em)",fontWeight:600,height:28,display:"flex",alignItems:"center",gap:2,fontFamily:"inherit",marginLeft:3}}
        onMouseEnter={e=>{e.currentTarget.style.background="#eff3f4";e.currentTarget.style.color="#0f1419";}}
        onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#536471";}}>
        ＋挿入
      </button>
      <ToolbarBtn title="書式を外して本文に戻す（⌘＼）" onClick={()=>clearFormat()} active={false} ch="✕"/>
      {/* 現在の形式バッジ */}
      <div style={{marginLeft:6,fontSize:"max(12px,0.68em)",color:"#1d9bf0",background:"#e8f5fe",border:"1px solid #93d3fc",borderRadius:10,padding:"1px 7px",fontWeight:700}}>{blockLabel}</div>
      <div style={{marginLeft:"auto",fontSize:"max(12px,0.6em)",color:"#736a62"}}>Enter=新段落　⇧Enter=同形式改行</div>
    </div>
  );
}

export function InsertModal({onClose,savedRange,bodyRef,initialTab="image"}){
  const [tab,setTab]=useState(initialTab),[url,setUrl]=useState("");
  const [imgSize,setImgSize]=useState("full");
  const [imgAlign,setImgAlign]=useState("left");
  const fileRef=useRef(null);
  const box=useRef(null);
  useDialogFocus(box,{onClose}); // 窓の決まり（差し込んだあとは本文にカーソルを残す。戻す先より本文が優先）
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
  const [upErr,setUpErr]=useState(""); // 2026-11-03 便 B：ブラウザの警告の窓をやめ、その場の赤字で出す
  // 【2026-08-09 変更】画像の保存を、このアプリのサーバー（/api/storage/upload）経由にした。
  // 保存先の名前はサーバーが決める。表示用の住所は返ってきた名前から作る（置き場は公開のまま）。
  const handleImage=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    setUpErr("");setUploading(true);
    try{
      const url=await uploadImage(file); // 置き場へ上げる処理は lib/articleImages.js に 1 本（サムネ・貼り付けと共通）
      insertAt(`<p><img src="${url}" alt="${file.name}" style="${imgStyleStr}"/></p>`);
      onClose();
    }catch(err){
      setUpErr("画像を上げられませんでした："+err.message);
    }finally{
      setUploading(false);
      if(fileRef.current)fileRef.current.value="";
    }
  };
  const handlePost=()=>{
    if(!url.trim()){setUpErr("埋め込むポストの住所（https://…）を入れてください");return;}
    setUpErr("");
    const isNote=/note\.com/.test(url);
    const icon=isNote?"📄":"𝕏";
    insertAt(`<div style="border:1px solid #e6dfd6;border-radius:10px;padding:10px 14px;margin:.6em 0;background:#f7f9f9;display:flex;align-items:center;gap:10px;" contenteditable="false"><span>${icon}</span><a href="${url}" target="_blank" style="color:#1d9bf0;text-decoration:none;font-size:13px;word-break:break-all;">${url}</a></div><p><br></p>`);
    onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="画像・リンクを差し込む" style={{background:"#fff",border:BD2,borderRadius:14,width:"100%",maxWidth:360,overflow:"hidden",boxShadow:"0 20px 60px #00000025"}}>
        <div style={{display:"flex",borderBottom:BD2}}>
          {[["image","🖼 画像"],["post","リンク挿入"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,border:"none",background:"none",padding:"11px 0",fontWeight:tab===t?700:500,color:tab===t?"#f59e0b":"#736a62",borderBottom:tab===t?"2px solid #f59e0b":"2px solid transparent",cursor:"pointer",fontSize:"max(12px,0.82em)"}}>{l}</button>
          ))}
        </div>
        <div style={{padding:"14px 16px 8px"}}>
          {tab==="image"&&(<><input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImage}/>
            {/* サイズ選択 */}
            <div style={{marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:700,color:"#6b6259",marginBottom:5}}>サイズ</div>
              <div style={{display:"flex",gap:4}}>
                {IMG_SIZES_OPTS.map(([v,l])=>(
                  <button key={v} onClick={()=>setImgSize(v)}
                    style={{flex:1,padding:"4px 0",borderRadius:6,border:imgSize===v?"2px solid #f59e0b":"1px solid #e0d8ce",background:imgSize===v?"#fef3c7":"#fff",fontSize:12,fontWeight:imgSize===v?700:500,color:imgSize===v?"#d97706":"#555",cursor:"pointer",fontFamily:"inherit"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {/* 配置選択 */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:"#6b6259",marginBottom:5}}>配置</div>
              <div style={{display:"flex",gap:4}}>
                {IMG_ALIGNS_OPTS.map(([v,l])=>(
                  <button key={v} onClick={()=>setImgAlign(v)}
                    style={{flex:1,padding:"4px 0",borderRadius:6,border:imgAlign===v?"2px solid #f59e0b":"1px solid #e0d8ce",background:imgAlign===v?"#fef3c7":"#fff",fontSize:12,fontWeight:imgAlign===v?700:500,color:imgAlign===v?"#d97706":"#555",cursor:"pointer",fontFamily:"inherit"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={()=>!uploading&&fileRef.current?.click()} style={{width:"100%",border:"2px dashed #e8e0d6",background:"#f8f5f1",borderRadius:9,padding:"20px 0",cursor:uploading?"default":"pointer",color:uploading?"#f59e0b":"#736a62",fontSize:"max(12px,0.83em)",fontWeight:600}} onMouseEnter={e=>{if(!uploading){e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}} onMouseLeave={e=>{if(!uploading){e.currentTarget.style.borderColor="#e6dfd6";e.currentTarget.style.color="#736a62";}}}>{uploading?"⏳ アップロード中…":"📁 クリックして画像を選択"}</button>
            {upErr&&<div role="alert" style={{color:"#b91c1c",fontSize:12.5,marginTop:8,lineHeight:1.6}}>{upErr}</div>}</>)}
          {tab==="post"&&(<><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."
            style={{width:"100%",border:BD2,borderRadius:8,padding:"9px 11px",fontSize:"max(12px,0.82em)",fontFamily:"inherit",color:"#1a1a1a",marginBottom:10,outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e6dfd6"}
            onKeyDown={e=>{if(e.key==="Enter")handlePost();}}/>
          <button onClick={handlePost} style={{width:"100%",background:url.trim()?"#b45309":"#eff3f4",color:url.trim()?"#fff":"#736a62",border:"none",borderRadius:20,padding:"9px 0",fontWeight:700,fontSize:"max(12px,0.82em)",cursor:url.trim()?"pointer":"default"}}>挿入</button>
          {upErr&&<div role="alert" style={{color:"#b91c1c",fontSize:12.5,marginTop:8}}>{upErr}</div>}</>)}
        </div>
        <div style={{padding:"8px 16px 14px"}}><button onClick={onClose} style={{width:"100%",border:BD2,background:"none",color:"#536471",borderRadius:7,padding:"7px",fontWeight:500,fontSize:"max(12px,0.8em)",cursor:"pointer"}}>キャンセル</button></div>
      </div>
    </div>
  );
}

// HTMLを読みやすいプレーンテキストに変換（スレッド対応）
export function htmlToPlain(html, threadMode=false){
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
export function copyRichText(html,_plain,onDone){
  const plain=htmlToPlain(html);
  try{navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([html],{type:"text/html"}),"text/plain":new Blob([plain],{type:"text/plain"})})]).then(onDone).catch(()=>fallbackCopy(plain,onDone));}
  catch(e){fallbackCopy(plain,onDone);}
}
export function fallbackCopy(plain,onDone){
  const ta=document.createElement("textarea");ta.value=plain;ta.style.cssText="position:fixed;left:-9999px;top:0";
  document.body.appendChild(ta);ta.select();
  try{document.execCommand("copy");}catch(e){}document.body.removeChild(ta);onDone?.();
}


// ── エディタサイドアイコン（EditorModal外で定義→毎レンダー再マウントを防ぐ） ──
export function SideIcon({id,icon,label,sidePanel,setSidePanel}){
  const active=sidePanel===id;
  return(
    <button onClick={()=>setSidePanel(active?null:id)} title={label} aria-pressed={active}
      style={{...S.col,alignItems:"center",gap:4,padding:"9px 0 8px",margin:"2px 6px",border:"none",borderRadius:10,background:active?"#fef3c7":"none",color:active?"#b45309":"#736a62",cursor:"pointer",transition:"background .12s,color .12s",fontFamily:"inherit"}}
      onMouseEnter={e=>{if(!active){e.currentTarget.style.background="#f5f0eb";e.currentTarget.style.color="#4b4540";}}}
      onMouseLeave={e=>{if(!active){e.currentTarget.style.background="none";e.currentTarget.style.color="#736a62";}}}>
      {typeof icon==="string"?<span style={{fontSize:"1.1em"}}>{icon}</span>:icon}
      <span style={{fontSize:12,fontWeight:700,letterSpacing:".02em"}}>{label}</span>
    </button>
  );
}

// ════════════════════════════════════════════════════════
// エディタモーダル
// ════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════
// 過去コンテンツ検索パネル（エディタサイドバー内）
// ════════════════════════════════════════════════════════
export function PostSearchPanel({posts,bodyEditorRef,savedRange,onSaveRange,refWhere=null,onToggleRef=null}){
  const [q,setQ]=useState("");
  // 2026-11-10 スワイプくんも探す（読むだけ）。参考に付けられる（依頼の参考）
  const [swipes,setSwipes]=useState(null);
  useEffect(()=>{let live=true;loadOthers().then(d=>{if(live)setSwipes(d?.swipes||[]);});return()=>{live=false;};},[]);
  const swHits=React.useMemo(()=>{
    const terms=q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if(!terms.length||!swipes)return [];
    return swipes.filter(s=>{const t=[s.title,s.excerpt,s.body,s.author,s.reason,s.an_hypo,s.an_idea].join(" ").toLowerCase();return terms.every(x=>t.includes(x));}).slice(0,20);
  },[q,swipes]);
  // 参考に付ける：どの依頼に付けるかを選ぶ（全部・作るものごと）。付いている先は ✓ で出し、もう一度選ぶと外れる
  const REF_TARGETS=[["all","全部の依頼"],["quote_figure","引用の図解"],["article_figure","記事内の図解"],["thumbnail","サムネ"],["text","本文"]];
  const RefBtn=({r})=>{
    if(!onToggleRef)return null;
    const at=refWhere?refWhere(r):[];
    return <select value="" onChange={e=>{if(e.target.value)onToggleRef(r,e.target.value);}} aria-label={`「${r.title}」を依頼の参考に付ける（付ける先を選ぶ）`}
      style={{flex:1,border:`1px solid ${at.length?"#7c3aed":"#a39a90"}`,background:at.length?"#7c3aed":"#fff",borderRadius:6,padding:"4px 6px",minHeight:30,fontSize:12,fontWeight:700,color:at.length?"#fff":"#1a1a1a",cursor:"pointer",fontFamily:"inherit"}}>
      <option value="">{at.length?`参考に付けた ✓（${at.length}）`:"参考に付ける ▾"}</option>
      {REF_TARGETS.map(([k,l])=><option key={k} value={k} style={{color:"#1a1a1a",background:"#fff"}}>{at.includes(k)?`✓ ${l}（押すと外す）`:l}</option>)}
    </select>;
  };
  const inputRef=useRef(null);
  const composing=useRef(false);

  const results=React.useMemo(()=>{
    if(!q.trim())return [];
    const qq=q.toLowerCase();
    return posts
      .filter(p=>
        p.title.toLowerCase().includes(qq)||
        stripHtml(p.body).toLowerCase().includes(qq)||
        (p.memo||"").toLowerCase().includes(qq)
      )
      .sort((a,b)=>(b.datetime||"").localeCompare(a.datetime||""))
      .slice(0,30);
  },[posts,q]);
  // 2026-11-09 思考整理くんのマップも探す（打ち終えて 0.35 秒後に 1 回。使えない人は欄ごと出さない）
  const [maps,setMaps]=useState([]),[mapState,setMapState]=useState("idle"); // idle | busy | off | 言葉（失敗）
  useEffect(()=>{
    const t=q.trim();
    if(!t){setMaps([]);setMapState("idle");return;}
    const ac=new AbortController();
    const h=setTimeout(async()=>{
      setMapState("busy");
      try{const r=await searchMaps(t,fetch,ac.signal);if(r===null){setMaps([]);setMapState("off");}else{setMaps(r);setMapState("idle");}}
      catch(e){if(e?.name!=="AbortError"){setMaps([]);setMapState(e.message||"思考整理くんを探せませんでした");}}
    },350);
    return()=>{clearTimeout(h);ac.abort();};
  },[q]);

  // URLをプレーンテキストでカーソル位置に挿入
  const insertUrl=(url)=>{
    const el=bodyEditorRef.current;
    if(!el)return;
    el.focus();
    if(savedRange){
      const sel=window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    document.execCommand("insertText",false,url);
  };

  return(
    <div style={{...S.col,height:"100%"}}>
      {/* 検索欄 */}
      <div style={{padding:"10px 11px",borderBottom:BD2,flexShrink:0}}>
        <div style={{...S.row,gap:6,background:"#f5f0eb",borderRadius:8,padding:"5px 9px",border:BD}}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#aaa" strokeWidth="2"><circle cx="6.5" cy="6.5" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e=>setQ(e.target.value)}
            onCompositionStart={()=>{composing.current=true;}}
            onCompositionEnd={e=>{composing.current=false;setQ(e.target.value);}}
            placeholder="投稿・スワイプくん・思考整理くんを検索…" aria-label="投稿・スワイプくん・思考整理くんを検索"
            style={{flex:1,border:"none",outline:"none",background:"transparent",fontSize:12,color:"#333",minWidth:0}}/>
          {q&&<button onClick={()=>setQ("")} style={{border:"none",background:"none",color:"#736a62",cursor:"pointer",fontSize:14,lineHeight:1}}>×</button>}
        </div>
        <div style={{fontSize:12,color:"#736a62",marginTop:5,textAlign:"right"}}>
          クリックしてカーソル位置を選択後、リンクを挿入
        </div>
      </div>

      {/* 結果リスト */}
      <div style={{flex:1,overflowY:"auto"}}>
        {!q.trim()&&(
          <div style={{padding:"24px 12px",textAlign:"center",color:"#736a62",fontSize:12,lineHeight:1.8}}>
            キーワードを入力してください
          </div>
        )}
        {q.trim()&&mapState!=="off"&&(
          <div style={{borderBottom:BD2}}>
            <div style={{...S.row,gap:6,padding:"8px 12px 4px"}}>
              <span style={{width:8,height:8,borderRadius:2,background:"#7c3aed",flexShrink:0}}/>
              <span style={{fontSize:12,fontWeight:800,color:"#1a1a1a"}}>思考整理くん</span>
              <span style={{fontSize:12,color:"#736a62"}}>{mapState==="busy"?"探しています…":`${maps.length} 枚`}</span>
            </div>
            {mapState!=="busy"&&mapState!=="idle"&&<div role="alert" style={{fontSize:12,color:"#b91c1c",padding:"0 12px 8px"}}>{mapState}</div>}
            {mapState==="idle"&&maps.length===0&&<div style={{fontSize:12,color:"#736a62",padding:"0 12px 8px"}}>当たるマップはありません</div>}
            {maps.map(m=>(
              <div key={m.id} style={{padding:"6px 12px 9px"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#1a1a1a",lineHeight:1.4,wordBreak:"break-all"}}>{m.title}</div>
                <div style={{fontSize:12,color:"#736a62",marginTop:1}}>{[m.folder,m.updated?String(m.updated).slice(0,10):""].filter(Boolean).join("・")}</div>
                {(m.hits||[]).map((h,i)=><div key={i} style={{fontSize:12,color:"#4b4540",background:"#f5f3ff",borderRadius:6,padding:"3px 7px",marginTop:4,lineHeight:1.5,wordBreak:"break-all"}}>{h}</div>)}
                <div style={{display:"flex",gap:6,marginTop:6}}>
                  <a href={m.url} target="_blank" rel="noopener noreferrer" aria-label={`「${m.title}」を別タブで開く`} style={{flex:1,textAlign:"center",border:"1px solid #a39a90",borderRadius:6,padding:"4px 0",fontSize:12,fontWeight:700,color:"#1a1a1a",textDecoration:"none"}}>別タブで開く ↗</a>
                  <RefBtn r={{k:"map",id:String(m.id),title:m.title||"無題のマップ"}}/>
                  <button onClick={()=>{onSaveRange();insertUrl(m.url);}} aria-label={`「${m.title}」の住所を本文に挿入`} style={{flex:1,border:"none",background:"#b45309",borderRadius:6,padding:"4px 0",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>← リンクを挿入</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {q.trim()&&<div style={{borderBottom:BD2}}>
          <div style={{...S.row,gap:6,padding:"8px 12px 4px"}}>
            <span style={{width:8,height:8,borderRadius:2,background:"#9a3412",flexShrink:0}}/>
            <span style={{fontSize:12,fontWeight:800,color:"#1a1a1a"}}>スワイプくん</span>
            <span style={{fontSize:12,color:"#736a62"}}>{swipes===null?"読み込み中…":`${swHits.length} 件`}</span>
          </div>
          {swipes!==null&&swHits.length===0&&<div style={{fontSize:12,color:"#736a62",padding:"0 12px 8px"}}>当たるスワイプはありません</div>}
          {swHits.map(s=>{const title=(s.title||s.excerpt||s.body||"（見出しなし）").trim().split("\n")[0].slice(0,80);return(
            <div key={s.id} style={{padding:"6px 12px 9px"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1a1a1a",lineHeight:1.4,wordBreak:"break-all"}}>{title}</div>
              <div style={{fontSize:12,color:"#736a62",marginTop:1}}>{[s.shu,s.author].filter(Boolean).join("・")}</div>
              {s.reason&&<div style={{fontSize:12,color:"#4b4540",background:"#fff7ed",borderRadius:6,padding:"3px 7px",marginTop:4,lineHeight:1.5,wordBreak:"break-all"}}>選んだ理由：{s.reason}</div>}
              <div style={{display:"flex",gap:6,marginTop:6}}>
                <a href={SWIPE_URL(s.id)} target="_blank" rel="noopener noreferrer" aria-label={`「${title}」をスワイプくんで開く`} style={{flex:1,textAlign:"center",border:"1px solid #a39a90",borderRadius:6,padding:"4px 0",minHeight:30,boxSizing:"border-box",fontSize:12,fontWeight:700,color:"#1a1a1a",textDecoration:"none"}}>開く ↗</a>
                <RefBtn r={{k:"swipe",id:String(s.id),title}}/>
              </div>
            </div>);})}
        </div>}
        {q.trim()&&<div style={{...S.row,gap:6,padding:"8px 12px 4px"}}>
          <span style={{width:8,height:8,borderRadius:2,background:"#ea580c",flexShrink:0}}/>
          <span style={{fontSize:12,fontWeight:800,color:"#1a1a1a"}}>コンテンツくん</span>
          <span style={{fontSize:12,color:"#736a62"}}>{results.length} 件</span>
        </div>}
        {q.trim()&&results.length===0&&(
          <div style={{padding:"0 12px 12px",color:"#736a62",fontSize:12}}>
            当たる投稿はありません
          </div>
        )}
        {results.map(p=>{
          const pt=getPostTypeStyle(p.postType,POST_TYPE);
          const links=(p.memoLinks||[]).filter(l=>{
            const url=typeof l==="string"?l:l.url;
            return url&&url.startsWith("http");
          });
          return(
            <div key={p.id} style={{padding:"10px 12px",borderBottom:BD2}}>
              {/* 投稿情報 */}
              <div style={{...S.row,gap:5,marginBottom:4,flexWrap:"wrap"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:pt.dot,flexShrink:0}}/>
                <span style={{fontSize:12,color:pt.color,fontWeight:700,background:pt.bg,border:`1px solid ${pt.border}`,padding:"0 5px",borderRadius:99}}>{pt.label}</span>
                <span style={{fontSize:12,color:"#736a62"}}>{p.datetime.slice(0,10)}</span>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"#222",lineHeight:1.4,marginBottom:6,wordBreak:"break-all"}}>
                {p.title||"（タイトルなし）"}
              </div>

              {/* リンク一覧 */}
              {links.length>0?(
                <div style={{...S.col,gap:4}}>
                  {links.map((l,i)=>{
                    const url=typeof l==="string"?l:l.url;
                    const label=typeof l==="string"?"":l.label;
                    return(
                      <div key={i} style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:7,padding:"5px 8px"}}>
                        {label&&<div style={{fontSize:12,fontWeight:700,color:"#0369a1",marginBottom:2}}>{label}</div>}
                        <div style={{fontSize:12,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:5}}>{url}</div>
                        <button
                          onClick={()=>{onSaveRange();insertUrl(url);}}
                          style={{width:"100%",background:"#0369a1",border:"none",borderRadius:5,padding:"4px 0",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer"}}>
                          ← 挿入
                        </button>
                      </div>
                    );
                  })}
                </div>
              ):(
                <div style={{fontSize:12,color:"#736a62",fontStyle:"italic"}}>リンクなし</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
