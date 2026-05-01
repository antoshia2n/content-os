import React, { useState, useRef, useEffect, useCallback } from "react";
import { BD, BD2, S, XFONT, TOOLBAR_BLOCK_LABELS, IMG_SIZES_OPTS, IMG_ALIGNS_OPTS, stripHtml } from "../constants.js";
import { supabase } from "../lib/supabase.js";

// ════════════════════════════════════════════════════════
// WYSIWYG
// ════════════════════════════════════════════════════════
export function BodyEditor({value,onChange,editorRef}){
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
export function ToolbarBtn({title,onClick,active,ch}){
  return(
    <button title={title} onMouseDown={e=>{e.preventDefault();onClick();}}
      style={{border:active?"1.5px solid #1d9bf0":"1px solid transparent",background:active?"#e8f5fe":"none",color:active?"#1d9bf0":"#536471",borderRadius:5,padding:"4px 6px",cursor:"pointer",fontSize:"0.82em",fontWeight:active?800:600,display:"flex",alignItems:"center",justifyContent:"center",height:28,minWidth:26,fontFamily:"inherit",transition:"all .1s"}}
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
    <div style={{...S.row,gap:1,padding:"5px 14px",borderBottom:BD2,background:"#fff",flexWrap:"wrap",flexShrink:0}}>
      {/* 形式セレクト（現在の形式を表示） */}
      <select value={["p","h1","h2","blockquote"].includes(fmt.block)?fmt.block:"p"}
        onChange={e=>{exec("formatBlock",e.target.value);}}
        style={{border:BD2,borderRadius:5,padding:"2px 7px",fontSize:"0.77em",color:"#1a1a1a",background:"#fff",cursor:"pointer",fontFamily:"inherit",height:28,fontWeight:600}}>
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
        style={{border:BD2,background:"none",color:"#536471",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:"0.73em",fontWeight:600,height:28,display:"flex",alignItems:"center",gap:2,fontFamily:"inherit",marginLeft:3}}
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

export function InsertModal({onClose,savedRange,bodyRef}){
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
      <div style={{background:"#fff",border:BD2,borderRadius:14,width:"100%",maxWidth:360,overflow:"hidden",boxShadow:"0 20px 60px #00000025"}}>
        <div style={{display:"flex",borderBottom:BD2}}>
          {[["image","🖼 画像"],["post","リンク挿入"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,border:"none",background:"none",padding:"11px 0",fontWeight:tab===t?700:500,color:tab===t?"#f59e0b":"#999",borderBottom:tab===t?"2px solid #f59e0b":"2px solid transparent",cursor:"pointer",fontSize:"0.82em"}}>{l}</button>
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
            <button onClick={()=>!uploading&&fileRef.current?.click()} style={{width:"100%",border:"2px dashed #e8e0d6",background:"#f8f5f1",borderRadius:9,padding:"20px 0",cursor:uploading?"default":"pointer",color:uploading?"#f59e0b":"#aaa",fontSize:"0.83em",fontWeight:600}} onMouseEnter={e=>{if(!uploading){e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}} onMouseLeave={e=>{if(!uploading){e.currentTarget.style.borderColor="#e6dfd6";e.currentTarget.style.color="#aaa";}}}>{uploading?"⏳ アップロード中…":"📁 クリックして画像を選択"}</button></>)}
          {tab==="post"&&(<><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."
            style={{width:"100%",border:BD2,borderRadius:8,padding:"9px 11px",fontSize:"0.82em",fontFamily:"inherit",color:"#1a1a1a",marginBottom:10,outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e6dfd6"}
            onKeyDown={e=>{if(e.key==="Enter")handlePost();}}/>
          <button onClick={handlePost} disabled={!url.trim()} style={{width:"100%",background:url.trim()?"#f59e0b":"#eff3f4",color:url.trim()?"#fff":"#aaa",border:"none",borderRadius:20,padding:"9px 0",fontWeight:700,fontSize:"0.82em",cursor:url.trim()?"pointer":"default"}}>挿入</button></>)}
        </div>
        <div style={{padding:"8px 16px 14px"}}><button onClick={onClose} style={{width:"100%",border:BD2,background:"none",color:"#536471",borderRadius:7,padding:"7px",fontWeight:500,fontSize:"0.8em",cursor:"pointer"}}>キャンセル</button></div>
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
    <button onClick={()=>setSidePanel(active?null:id)} title={label}
      style={{...S.col,alignItems:"center",gap:2,padding:"10px 0",border:"none",background:active?"#fef3c7":"none",color:active?"#d97706":"#bbb",cursor:"pointer",width:"100%",borderLeft:active?"3px solid #f59e0b":"3px solid transparent",transition:"all .1s",fontFamily:"inherit"}}
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
// ════════════════════════════════════════════════════════
// 過去コンテンツ検索パネル（エディタサイドバー内）
// ════════════════════════════════════════════════════════
export function PostSearchPanel({posts,bodyEditorRef,savedRange,onSaveRange}){
  const [q,setQ]=useState("");
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
      .slice(0,30)
      .sort((a,b)=>b.datetime.localeCompare(a.datetime));
  },[posts,q]);

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
            placeholder="タイトル・本文・メモで検索…"
            style={{flex:1,border:"none",outline:"none",background:"transparent",fontSize:12,color:"#333",minWidth:0}}/>
          {q&&<button onClick={()=>setQ("")} style={{border:"none",background:"none",color:"#bbb",cursor:"pointer",fontSize:14,lineHeight:1}}>×</button>}
        </div>
        <div style={{fontSize:10,color:"#bbb",marginTop:5,textAlign:"right"}}>
          クリックしてカーソル位置を選択後、リンクを挿入
        </div>
      </div>

      {/* 結果リスト */}
      <div style={{flex:1,overflowY:"auto"}}>
        {!q.trim()&&(
          <div style={{padding:"24px 12px",textAlign:"center",color:"#ccc",fontSize:12,lineHeight:1.8}}>
            キーワードを入力してください
          </div>
        )}
        {q.trim()&&results.length===0&&(
          <div style={{padding:"24px 12px",textAlign:"center",color:"#ccc",fontSize:12}}>
            該当なし
          </div>
        )}
        {results.map(p=>{
          const pt=POST_TYPE[p.postType||"x_post"];
          const links=(p.memoLinks||[]).filter(l=>{
            const url=typeof l==="string"?l:l.url;
            return url&&url.startsWith("http");
          });
          return(
            <div key={p.id} style={{padding:"10px 12px",borderBottom:BD2}}>
              {/* 投稿情報 */}
              <div style={{...S.row,gap:5,marginBottom:4,flexWrap:"wrap"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:pt.dot,flexShrink:0}}/>
                <span style={{fontSize:10,color:pt.color,fontWeight:700,background:pt.bg,border:`1px solid ${pt.border}`,padding:"0 5px",borderRadius:99}}>{pt.label}</span>
                <span style={{fontSize:10,color:"#bbb"}}>{p.datetime.slice(0,10)}</span>
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
                        {label&&<div style={{fontSize:10,fontWeight:700,color:"#0369a1",marginBottom:2}}>{label}</div>}
                        <div style={{fontSize:10,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:5}}>{url}</div>
                        <button
                          onClick={()=>{onSaveRange();insertUrl(url);}}
                          style={{width:"100%",background:"#0369a1",border:"none",borderRadius:5,padding:"4px 0",fontSize:10,fontWeight:700,color:"#fff",cursor:"pointer"}}>
                          ← 挿入
                        </button>
                      </div>
                    );
                  })}
                </div>
              ):(
                <div style={{fontSize:10,color:"#ccc",fontStyle:"italic"}}>リンクなし</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
