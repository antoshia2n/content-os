import React, { useState, useRef, useEffect, useCallback } from "react";
import { POST_TYPE, getPostTypeStyle, STATUS, BD, BD2, S, XFONT, IMG_SIZES_OPTS, IMG_ALIGNS_OPTS, genId, nowStr, stripHtml, isUrl, TOOLBAR_BLOCK_LABELS } from "../constants.js";
import { supabase } from "../lib/supabase.js";
import { BodyEditor, Toolbar, InsertModal, SideIcon, PostSearchPanel, htmlToPlain, copyRichText } from "../components/editor.jsx";
import { TagSelector, LabelEditor, MemoEditor, CopyBtn } from "../components/shared.jsx";
import { postToMarkdown, sanitizeFilename } from "./ExportModal.jsx";
import { TemplatePicker } from "../components/TemplatePicker.jsx";

// 横の欄のアイコン（線の太さをそろえた SVG。2026-10-05 絵文字から置き換え）
const ic=d=><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const ICONS={
  memo:ic(<><path d="M5 3.5h7l3 3v10H5z"/><path d="M12 3.5v3h3"/><path d="M7.5 10h5M7.5 13h3.5"/></>),
  search:ic(<><circle cx="9" cy="9" r="5"/><path d="M13 13l3.5 3.5"/></>),
  history:ic(<><circle cx="10" cy="10" r="6.5"/><path d="M10 6.5V10l2.5 1.8"/></>),
  share:ic(<><path d="M8.5 11.5l3-3"/><path d="M9.5 6.5l1.2-1.2a3 3 0 014.2 4.2L13.7 10.7"/><path d="M10.5 13.5l-1.2 1.2a3 3 0 01-4.2-4.2L6.3 9.3"/></>),
};

// 「その他」のメニュー（めったに使わない書き出しをまとめる）
function MoreMenu({items}){
  const [open,setOpen]=useState(false);const box=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const h=e=>{if(box.current&&!box.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[open]);
  return(
    <div ref={box} style={{position:"relative",flexShrink:0}}>
      <button className="em-icon" onClick={()=>setOpen(o=>!o)} title="その他" aria-label="その他" style={open?{background:"#f5f0eb",color:"#4b4540"}:undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12.5" cy="8" r="1.4"/></svg>
      </button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:300,background:"#fff",border:BD2,borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,.12)",padding:5,minWidth:200}}>
          {items.map(it=>(
            <button key={it.label} disabled={it.disabled} onClick={()=>{it.onClick();}}
              style={{display:"block",width:"100%",textAlign:"left",border:"none",background:"none",borderRadius:8,padding:"8px 11px",fontSize:12.5,fontWeight:600,color:"#333",cursor:it.disabled?"default":"pointer",fontFamily:"inherit"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f5f0eb"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const FS_SUPPORTED = typeof window !== "undefined" && "showDirectoryPicker" in window;

// compact：/panel（幅 360px 前後）で開くときだけ true。広い画面では今と同じ見た目と動き
export function EditorModal({post,onSave,onClose,allPosts=[],accounts=[],compact=false,templates=[],postTypes=POST_TYPE,onManageTemplates}){
  const [draft,setDraft]=useState({...post,memoLinks:post.memoLinks||[],history:post.history||[]});
  const [copyX,setCopyX]=useState(false),[copyNote,setCopyNote]=useState(false);
  const [notionState,setNotionState]=useState("idle"); // idle | saving | done | error
  const [localState,setLocalState]=useState("idle");   // idle | done | error
  const [insertOpen,setInsertOpen]=useState(false),[savedRange,setSavedRange]=useState(null);
  const [sidePanel,setSidePanel]=useState(post.status==="idea"?"meta":null);
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
  // 段 5：型の差し込み先。細い幅は「本文／メモ」の切り替え、広い幅は最後に触った側
  const memoRef=useRef(null);
  const [lastSide,setLastSide]=useState(post.status==="idea"?"memo":"body");
  const side=compact?(sidePanel==="meta"?"memo":"body"):(sidePanel==="meta"?lastSide:"body");
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
    const date=(draft.datetime||"").slice(0,10);
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
      if(e.name==="AbortError")return;
      setLocalState("error");
      setTimeout(()=>setLocalState("idle"),3000);
    }
  };

  const saveToNotion=async()=>{
    setNotionState("saving");
    try{
      const res=await fetch("/api/internal/push-to-notion",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          title:draft.title,
          body_text:draft.body,
          status:draft.status,
          content_type:draft.postType,
          post_date:draft.datetime?draft.datetime.split("T")[0]:undefined,
          source_app:"コンテンツくん",
        }),
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"エラー");
      setNotionState("done");
      setTimeout(()=>setNotionState("idle"),4000);
      if(data.notion_url){
        setDraft(d=>{
          const already=(d.memoLinks||[]).some(l=>l.url===data.notion_url);
          if(already)return d;
          return{...d,memoLinks:[{label:"Notion",url:data.notion_url},...(d.memoLinks||[])]};
        });
      }
    }catch(e){
      setNotionState("error");
      setTimeout(()=>setNotionState("idle"),4000);
      console.error(e);
    }
  };

  const pt=getPostTypeStyle(draft.postType);
  const st=STATUS[draft.status];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:compact?0:14}}>
      {insertOpen&&<InsertModal onClose={()=>setInsertOpen(false)} savedRange={savedRange} bodyRef={bodyEditorRef}/>}
      <div style={{background:"#fff",borderRadius:compact?0:18,width:"100%",maxWidth:1100,height:compact?"100vh":"calc(100vh - 28px)",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px #00000030"}}>

        {/* ヘッダー（細い幅）：戻る・コピー・保存の 3 つと、種類・状態・登録先・日時だけ */}
        {compact&&(
          <div style={{borderBottom:BD2,background:"#fff",flexShrink:0,padding:"8px 10px",display:"flex",flexDirection:"column",gap:7}}>
            <div style={{...S.row,gap:6}}>
              <button onClick={onClose} style={{background:"none",border:BD,borderRadius:20,padding:"5px 11px",fontSize:12,fontWeight:700,color:"#555",cursor:"pointer",whiteSpace:"nowrap"}}>← 一覧</button>
              <div style={{flex:1}}/>
              <TemplatePicker compact templates={templates} side={side} postType={draft.postType} postTypes={postTypes} bodyRef={bodyEditorRef} memoRef={memoRef} draft={draft} setDraft={setDraft} onManage={onManageTemplates}/>
              <button onClick={()=>doCopy("x")} style={{background:copyX?"#00ba7c":"#fff",color:copyX?"#fff":"#555",border:copyX?"1px solid #00ba7c":BD,borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"background .2s"}}>{copyX?"コピーしました":"コピー"}</button>
              <button onClick={handleSave} style={{background:"#f59e0b",border:"none",borderRadius:20,padding:"6px 16px",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer"}}>保存</button>
            </div>
            <div style={{...S.row,gap:5,flexWrap:"wrap"}}>
              <select value={draft.postType} onChange={e=>setDraft(d=>({...d,postType:e.target.value}))}
                style={{border:`1.5px solid ${pt.border}`,borderRadius:20,padding:"3px 8px",fontSize:11,fontWeight:700,color:pt.color,background:pt.bg,cursor:"pointer",fontFamily:"inherit",outline:"none",maxWidth:"100%"}}>
                {Object.entries(POST_TYPE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))}
                style={{border:`1.5px solid ${st?.border}`,borderRadius:20,padding:"3px 8px",fontSize:11,fontWeight:700,color:st?.text,background:st?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              {accounts.length>1&&(
                <select value={draft.account_id||""} onChange={e=>setDraft(d=>({...d,account_id:e.target.value}))}
                  style={{background:"#fff7ed",border:"1px solid #fcd34d",borderRadius:20,padding:"3px 8px",fontSize:11,fontWeight:700,color:"#b45309",outline:"none",cursor:"pointer",fontFamily:"inherit",maxWidth:"100%"}}>
                  {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <input type="datetime-local" value={draft.datetime} onChange={e=>setDraft(d=>({...d,datetime:e.target.value}))}
                style={{border:BD,borderRadius:8,padding:"3px 6px",fontSize:11,color:"#555",fontFamily:"inherit",outline:"none",maxWidth:"100%"}}/>
            </div>
            <div style={{display:"flex",background:"#f5f0eb",borderRadius:8,padding:2,gap:2,border:BD2}}>
              {[[null,"本文"],["meta","メモ"]].map(([k,l])=>(
                <button key={l} onClick={()=>setSidePanel(k)} style={{flex:1,padding:"5px 0",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:sidePanel===k?"#fff":"transparent",color:sidePanel===k?"#111":"#a8a09a",boxShadow:sidePanel===k?"0 1px 2px rgba(0,0,0,.06)":"none"}}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {/* ヘッダー（広い幅）：左に投稿の属性、右に「型・コピー・その他・保存・閉じる」。2026-10-05 整理 */}
        {!compact&&<div style={{...S.row,padding:"0 12px 0 14px",borderBottom:BD2,background:"#fff",height:54,gap:6,flexShrink:0}}>
          <div style={{...S.row,gap:4,background:"#f7f3ee",border:BD2,borderRadius:12,padding:3,minWidth:0}}>
            <select className="em-chip" value={draft.postType} onChange={e=>setDraft(d=>({...d,postType:e.target.value}))} style={{color:pt.color}}>
              {Object.entries(POST_TYPE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="em-chip" value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))} style={{color:st?.text}}>
              {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            {accounts.length>0&&(
              <select className="em-chip" title="登録先" value={draft.account_id||""} onChange={e=>setDraft(d=>({...d,account_id:e.target.value}))} style={{color:"#b45309"}}>
                {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <input className="em-chip" type="datetime-local" value={draft.datetime} onChange={e=>setDraft(d=>({...d,datetime:e.target.value}))} style={{color:"#555",fontWeight:600}}/>
          </div>
          <div style={{flex:1}}/>
          <TemplatePicker templates={templates} side={side} postType={draft.postType} postTypes={postTypes} bodyRef={bodyEditorRef} memoRef={memoRef} draft={draft} setDraft={setDraft} onManage={onManageTemplates}/>
          <button className="em-btn" onClick={()=>doCopy("x")} style={copyX?{background:"#ecfdf5",borderColor:"#6ee7b7",color:"#059669"}:undefined}>{copyX?"コピーしました":"コピー"}</button>
          <MoreMenu items={[
            {label:notionState==="saving"?"Notion に保存中…":notionState==="done"?"Notion に保存しました":notionState==="error"?"Notion に保存できませんでした":"Notion に保存",onClick:saveToNotion,disabled:notionState==="saving"},
            {label:localState==="done"?"ファイルに保存しました":localState==="error"?"ファイルに保存できませんでした":"ファイルに保存（.md）",onClick:saveLocalFile},
          ]}/>
          <button onClick={handleSave} style={{background:"#f59e0b",border:"none",borderRadius:10,padding:"8px 18px",fontSize:12.5,fontWeight:800,color:"#fff",cursor:"pointer",whiteSpace:"nowrap",marginLeft:4,boxShadow:"0 1px 2px rgba(180,83,9,.25)"}}>保存</button>
          <button className="em-icon" onClick={onClose} title="閉じる（Esc）" aria-label="閉じる">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>
          </button>
        </div>}
        <style>{`
          .em-chip{appearance:none;-webkit-appearance:none;border:none;background-color:transparent;border-radius:9px;padding:6px 10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;outline:none;max-width:180px}
          select.em-chip{padding-right:22px;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%2710%27 viewBox=%270 0 10 10%27%3E%3Cpath d=%27M2 3.5l3 3 3-3%27 fill=%27none%27 stroke=%27%23a8a09a%27 stroke-width=%271.5%27 stroke-linecap=%27round%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 7px center}
          .em-chip:hover,.em-chip:focus-visible{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.06)}
          .em-btn{background:#fff;border:1px solid #e6dfd6;border-radius:10px;padding:7px 13px;font-size:12px;font-weight:700;color:#4b4540;cursor:pointer;white-space:nowrap;font-family:inherit}
          .em-btn:hover{border-color:#d4cbbf;background:#faf7f3}
          .em-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;background:none;border-radius:9px;color:#a8a09a;cursor:pointer;flex-shrink:0}
          .em-icon:hover{background:#f5f0eb;color:#4b4540}
        `}</style>

        {/* 本体 */}
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* 記事エリア */}
          <div onFocusCapture={()=>setLastSide("body")} style={{flex:1,display:compact&&sidePanel?"none":"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
            {compact?<div style={{overflowX:"auto",flexShrink:0}}><Toolbar onInsertOpen={openInsert}/></div>:<Toolbar onInsertOpen={openInsert}/>}
            <div style={{flex:1,overflowY:"auto"}}>
              <div ref={articleAreaRef} style={{padding:compact?"16px 14px 80px":"28px 32px 100px"}}>
                <input type="text" value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}
                  placeholder="タイトルを入力..."
                  style={{width:"100%",border:"none",outline:"none",fontSize:compact?20:28,fontWeight:800,lineHeight:1.25,color:"#0f1419",fontFamily:XFONT,marginBottom:compact?12:18,paddingBottom:compact?12:18,borderBottom:BD2,background:"transparent",display:"block",boxSizing:"border-box"}}/>
                <BodyEditor value={draft.body} onChange={body=>setDraft(d=>({...d,body}))} editorRef={bodyEditorRef}/>
              </div>
            </div>
            <div style={{padding:"4px 50px",borderTop:BD2,background:"#f5f0eb",fontSize:"0.67em",color:"#aaa",flexShrink:0}}>
              {((draft.title||"")+(draft.body||"").replace(/<[^>]+>/g,"")).length.toLocaleString()} 文字
            </div>
          </div>

          {/* アイコン列（細い幅では上の「本文／メモ」で切り替えるため出さない） */}
          {!compact&&<div style={{width:58,borderLeft:"1px solid #e6dfd6",background:"#fcfaf8",display:"flex",flexDirection:"column",flexShrink:0,paddingTop:6}}>
            <SideIcon id="meta" icon={ICONS.memo} label="メモ" sidePanel={sidePanel} setSidePanel={setSidePanel}/>
            <SideIcon id="search" icon={ICONS.search} label="検索" sidePanel={sidePanel} setSidePanel={setSidePanel}/>
            <SideIcon id="history" icon={ICONS.history} label="履歴" sidePanel={sidePanel} setSidePanel={setSidePanel}/>
            <SideIcon id="share" icon={ICONS.share} label="共有" sidePanel={sidePanel} setSidePanel={setSidePanel}/>
          </div>}

          {/* サイドパネル展開 */}
          {sidePanel&&(
            <>
              {!compact&&<div onMouseDown={startResize}
                style={{width:4,cursor:"col-resize",background:"transparent",flexShrink:0,transition:"background .15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#e0d8ce"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}/>}
              <div onFocusCapture={()=>setLastSide("memo")} style={compact?{flex:1,minWidth:0,borderLeft:"1px solid #e6dfd6",background:"#fafafa",display:"flex",flexDirection:"column"}:{width:sideW,borderLeft:"1px solid #e6dfd6",background:"#fafafa",display:"flex",flexDirection:"column",flexShrink:0}}>
              {!compact&&<div style={{padding:"11px 13px 9px",borderBottom:BD2,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff"}}>
                <span style={{fontWeight:700,fontSize:"0.84em",color:"#0f1419"}}>
                  {sidePanel==="meta"?"メモ":sidePanel==="search"?"過去コンテンツ":sidePanel==="history"?"編集履歴":"共有"}
                </span>
                <button onClick={()=>setSidePanel(null)} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer"}}>✕</button>
              </div>}
              <div style={{flex:1,overflowY:"auto",padding:sidePanel==="search"?0:13}}>
                {sidePanel==="search"&&(
                  <PostSearchPanel
                    posts={allPosts}
                    bodyEditorRef={bodyEditorRef}
                    savedRange={savedRange}
                    onSaveRange={()=>{
                      const sel=window.getSelection();
                      if(sel?.rangeCount>0){
                        const r=sel.getRangeAt(0);
                        setSavedRange(bodyEditorRef.current?.contains(r.commonAncestorContainer)?r.cloneRange():null);
                      }
                    }}
                  />
                )}
                {sidePanel==="meta"&&(
                  <div style={{...S.col,gap:12}}>
                    <div>
                      <label style={{fontSize:"0.7em",fontWeight:700,color:"#888",display:"block",marginBottom:5}}>概要メモ・リンク</label>
                      <MemoEditor textareaRef={memoRef} memo={draft.memo} memoLinks={draft.memoLinks} autoFocus={post.status==="idea"} onChange={({memo,memoLinks})=>setDraft(d=>({...d,memo,memoLinks}))}/>
                    </div>
                    <div>
                      <label style={{fontSize:"0.7em",fontWeight:700,color:"#888",display:"block",marginBottom:5}}>ラベル</label>
                      <LabelEditor labels={draft.labels||[]} onChange={labels=>setDraft(d=>({...d,labels}))}/>
                    </div>
                    {(draft.comments||[]).length>0&&(
                      <div>
                        <label style={{fontSize:"0.7em",fontWeight:700,color:"#888",display:"block",marginBottom:5}}>コメント ({draft.comments.length})</label>
                        {draft.comments.map((c,i)=>(
                          <div key={i} style={{background:"#fff",border:BD2,borderRadius:7,padding:"6px 9px",fontSize:"0.77em",color:"#444",lineHeight:1.6,marginBottom:4}}>{typeof c==="string"?c:c.text}</div>
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
                        <div style={{...S.col,alignItems:"center",flexShrink:0,paddingTop:3}}>
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
