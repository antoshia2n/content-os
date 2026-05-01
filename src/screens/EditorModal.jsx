import React, { useState, useRef, useEffect, useCallback } from "react";
import { POST_TYPE, STATUS, BD, BD2, S, XFONT, IMG_SIZES_OPTS, IMG_ALIGNS_OPTS, genId, nowStr, stripHtml, isUrl, TOOLBAR_BLOCK_LABELS } from "../constants.js";
import { supabase } from "../lib/supabase.js";
import { BodyEditor, Toolbar, InsertModal, SideIcon, PostSearchPanel, htmlToPlain, copyRichText } from "../components/editor.jsx";
import { TagSelector, LabelEditor, MemoEditor, CopyBtn } from "../components/shared.jsx";

export function EditorModal({post,onSave,onClose,allPosts=[]}){
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

  const saveToNotionWithStatus=async(overrideStatus)=>{
    setNotionState("saving");
    try{
      const res=await fetch("/api/internal/push-to-notion",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          title:draft.title,
          body:draft.body,
          status:overrideStatus??draft.status,
          postType:draft.postType,
          datetime:draft.datetime,
          memo:draft.memo,
        }),
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"エラー");
      setNotionState("done");
      setTimeout(()=>setNotionState("idle"),4000);
      if(data.url){
        setDraft(d=>{
          const already=(d.memoLinks||[]).some(l=>l.url===data.url);
          if(already)return d;
          return{...d,memoLinks:[{label:"Notion",url:data.url},...(d.memoLinks||[])]};
        });
      }
    }catch(e){
      setNotionState("error");
      setTimeout(()=>setNotionState("idle"),4000);
      console.error(e);
    }
  };

  const saveToNotion=()=>saveToNotionWithStatus();

  const pt=POST_TYPE[draft.postType]||POST_TYPE.x_post;
  const st=STATUS[draft.status];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:14}}>
      {insertOpen&&<InsertModal onClose={()=>setInsertOpen(false)} savedRange={savedRange} bodyRef={bodyEditorRef}/>}
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:1100,height:"calc(100vh - 28px)",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px #00000030"}}>

        {/* ヘッダー */}
        <div style={{...S.row,padding:"0 14px",borderBottom:BD2,background:"#fff",height:50,gap:7,flexShrink:0}}>
          <select value={draft.postType} onChange={e=>setDraft(d=>({...d,postType:e.target.value}))}
            style={{border:`1.5px solid ${pt.border}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:pt.color,background:pt.bg,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
            {Object.entries(POST_TYPE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={draft.status} onChange={e=>{const s=e.target.value;setDraft(d=>({...d,status:s}));if(s==="published")saveToNotionWithStatus("published");}}
            style={{border:`1.5px solid ${st?.border}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:st?.text,background:st?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="datetime-local" value={draft.datetime} onChange={e=>setDraft(d=>({...d,datetime:e.target.value}))}
            style={{border:BD,borderRadius:8,padding:"4px 8px",fontSize:11,color:"#555",fontFamily:"inherit",outline:"none"}}/>
          <div style={{flex:1}}/>
          <button onClick={saveToNotion} disabled={notionState==="saving"}
            style={{
              background:notionState==="done"?"#00ba7c":notionState==="error"?"#ef4444":notionState==="saving"?"#9ca3af":"#000",
              color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,
              cursor:notionState==="saving"?"default":"pointer",whiteSpace:"nowrap",
              transition:"background .2s",display:"flex",alignItems:"center",gap:5,
            }}>
            {notionState==="saving"?"⏳ 保存中…":notionState==="done"?"✅ Notion保存完了":notionState==="error"?"❌ 保存失敗":<>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/></svg>
              Notionに保存
            </>}
          </button>
          <button onClick={saveLocalFile}
            style={{
              background:localState==="done"?"#00ba7c":localState==="error"?"#ef4444":"#4b5563",
              color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,
              cursor:"pointer",whiteSpace:"nowrap",
              transition:"background .2s",display:"flex",alignItems:"center",gap:5,
            }}>
            {localState==="done"?"✅ 保存完了":localState==="error"?"❌ 失敗":"💾 ローカルに保存"}
          </button>
          <button onClick={()=>doCopy("note")} style={{background:copyNote?"#00ba7c":"#41c9b4",color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"background .2s"}}>{copyNote?"✅ 完了":"note にコピー"}</button>
          <button onClick={()=>doCopy("x")} style={{background:copyX?"#00ba7c":"#1d9bf0",color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"background .2s"}}>{copyX?"✅ 完了":"𝕏 にコピー"}</button>
          <div style={{width:1,height:20,background:"#e6dfd6"}}/>
          <button onClick={handleSave} style={{background:"#f59e0b",border:"none",borderRadius:20,padding:"6px 16px",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer"}}>保存</button>
          <button onClick={onClose} style={{background:"none",border:BD,borderRadius:20,padding:"6px 11px",fontSize:12,fontWeight:600,color:"#888",cursor:"pointer"}}>✕</button>
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
                  style={{width:"100%",border:"none",outline:"none",fontSize:28,fontWeight:800,lineHeight:1.25,color:"#0f1419",fontFamily:XFONT,marginBottom:18,paddingBottom:18,borderBottom:BD2,background:"transparent",display:"block",boxSizing:"border-box"}}/>
                <BodyEditor value={draft.body} onChange={body=>setDraft(d=>({...d,body}))} editorRef={bodyEditorRef}/>
              </div>
            </div>
            <div style={{padding:"4px 50px",borderTop:BD2,background:"#f5f0eb",fontSize:"0.67em",color:"#aaa",flexShrink:0}}>
              {((draft.title||"")+(draft.body||"").replace(/<[^>]+>/g,"")).length.toLocaleString()} 文字
            </div>
          </div>

          {/* アイコン列 */}
          <div style={{width:50,borderLeft:"1px solid #e6dfd6",background:"#fafafa",display:"flex",flexDirection:"column",flexShrink:0}}>
            <SideIcon id="meta" icon="⚙️" label="設定" sidePanel={sidePanel} setSidePanel={setSidePanel}/>
            <SideIcon id="search" icon="🔍" label="検索" sidePanel={sidePanel} setSidePanel={setSidePanel}/>
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
              <div style={{padding:"11px 13px 9px",borderBottom:BD2,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff"}}>
                <span style={{fontWeight:700,fontSize:"0.84em",color:"#0f1419"}}>
                  {sidePanel==="meta"?"設定":sidePanel==="search"?"過去コンテンツ":sidePanel==="history"?"編集履歴":"共有"}
                </span>
                <button onClick={()=>setSidePanel(null)} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer"}}>✕</button>
              </div>
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
