import React, { useState, useRef, useEffect, useCallback } from "react";
import { POST_TYPE, STATUS, SCORE, BD, BD2, S, XFONT, fmtTime, stripHtml, isUrl, genId, nowStr } from "../constants.js";
import { TagSelector, LabelEditor, MemoEditor, CopyBtn, Btn } from "../components/shared.jsx";
import { RepostModal } from "../components/modals.jsx";

export function PreviewOverlay({post,onClose,onEdit,onRepost,onDuplicate,onDelete,onSaveComment,onChangeStatus,onSaveMeta,onChangePostType,onSaveNew,allLabels=[],allPostTypes=POST_TYPE,onAddPostType}){
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
  const pt=allPostTypes[post.postType||"x_post"]||allPostTypes.x_post||POST_TYPE.x_post;
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
        <div style={{padding:"14px 18px 12px",borderBottom:BD2,background:"#fff",display:"flex",alignItems:"flex-start",gap:10,flexShrink:0}}>
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
            <div style={{...S.row,gap:6,flexWrap:"wrap"}}>

              {/* メディアタイプ */}
              <TagSelector
                label="メディアタイプ"
                disabled={!!post._unsaved}
                selected={post.postType||"x_post"}
                options={Object.entries(allPostTypes).map(([k,v])=>({value:k,label:v.label,color:v.color,bg:v.bg,border:v.border,dot:v.dot}))}
                onChange={v=>v&&!post._unsaved&&onChangePostType(post.id,v)}
                allowNew={!!onAddPostType}
                onAdd={label=>{onAddPostType?.(label);}}
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
                options={[...new Set([...(post.labels||[]),...allLabels])].sort().map(l=>({value:l,label:l}))}
                onChange={labels=>onSaveMeta(post.id,{memo,memoLinks,labels})}
                onClear={()=>onSaveMeta(post.id,{memo,memoLinks,labels:[]})}
                allowNew
                onAdd={l=>{
                  const next=[...new Set([...(post.labels||[]),l])];
                  onSaveMeta(post.id,{memo,memoLinks,labels:next});
                }}
                badge={
                  (post.labels||[]).length>0
                    ? <div style={{display:"inline-flex",alignItems:"center",gap:3,flexWrap:"wrap",cursor:"pointer"}}>
                        {(post.labels||[]).map((l,i)=>(
                          <span key={i} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:99,background:"#f5f0eb",border:"1.5px solid #e0d8ce",fontSize:11,fontWeight:600,color:"#555"}}>
                            {l}
                            <span onClick={e=>{e.stopPropagation();const next=(post.labels||[]).filter((_,j)=>j!==i);onSaveMeta(post.id,{memo,memoLinks,labels:next});}}
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
            <button onClick={()=>onEdit(getEditPost())} style={{background:"#f59e0b",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer"}}>
              {post._unsaved?"編集して作成":"編集"}
            </button>
            {!post._unsaved&&<button onClick={()=>onDuplicate(post)} style={{background:"none",border:BD,borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:600,color:"#555",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f5f0eb"} onMouseLeave={e=>e.currentTarget.style.background="none"}>複製</button>}
            {!post._unsaved&&<button onClick={()=>onRepost(post)} style={{background:"none",border:BD,borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:600,color:"#555",cursor:"pointer"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="#f59e0b";}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#555";e.currentTarget.style.borderColor="#e0d8ce";}}>再投稿</button>}
            {!post._unsaved&&<button onClick={()=>onDelete(post)} style={{background:"none",border:"1px solid #fca5a5",borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:600,color:"#ef4444",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background="#fef2f2"} onMouseLeave={e=>e.currentTarget.style.background="none"}>削除</button>}
            <button onClick={onClose} style={{background:"none",border:BD,borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:600,color:"#888",cursor:"pointer"}}>✕</button>
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
              <div style={{padding:"10px 14px",borderBottom:BD2}}>
                <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:6}}>ラベル</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {(post.labels||[]).map((l,i)=>(
                    <span key={i} style={{fontSize:11,color:"#555",background:"#f5f0eb",border:BD,borderRadius:99,padding:"2px 9px",fontWeight:600}}>{l}</span>
                  ))}
                </div>
              </div>
            )}

            {/* メモ */}
            <div style={{padding:"12px 14px",borderBottom:BD2}}>
              <div style={{...S.rowB,marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:700,color:"#888"}}>📝 メモ</span>
                <button onClick={insertBullet} title="箇条書きを挿入"
                  style={{border:BD,background:"#fff",borderRadius:5,padding:"2px 7px",fontSize:10,fontWeight:700,color:"#555",cursor:"pointer"}}>
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
                style={{width:"100%",border:BD,borderRadius:8,padding:"7px 9px",fontSize:"0.77em",fontFamily:"inherit",color:"#1a1a1a",outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:1.7,background:"#fff"}}
                onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
            </div>

            {/* リンク */}
            <div style={{padding:"12px 14px",borderBottom:BD2}}>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:6}}>🔗 リンク</div>
              {memoLinks.length>0&&(
                <div style={{...S.col,gap:4,marginBottom:8}}>
                  {memoLinks.map((l,i)=>(
                    <div key={i} style={{...S.row,gap:5,background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:7,padding:"4px 8px"}}>
                      <div style={{flex:1,minWidth:0}}>
                        {l.label&&<div style={{fontSize:"0.68em",fontWeight:700,color:"#0369a1"}}>{l.label}</div>}
                        <a href={l.url} target="_blank" rel="noreferrer" style={{fontSize:"0.68em",color:"#0369a1",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{l.url}</a>
                      </div>
                      <CopyBtn url={l.url}/>
                      <button onClick={()=>{setMemoLinks(prev=>prev.filter((_,j)=>j!==i));setMetaDirty(true);}}
                        style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:"0.8em",flexShrink:0}}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <input value={labelInput} onChange={e=>setLabelInput(e.target.value)} placeholder="ラベル（任意）"
                style={{width:"100%",border:BD,borderRadius:7,padding:"5px 8px",fontSize:"0.73em",fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:4,background:"#fff"}}
                onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
              <div style={{display:"flex",gap:4}}>
                <input value={linkInput} onChange={e=>setLinkInput(e.target.value)} placeholder="URLを貼り付け"
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.isComposing)addLink();}}
                  onPaste={e=>{const v=e.clipboardData.getData("text").trim();if(isUrl(v)){e.preventDefault();setLinkInput(v);}}}
                  style={{flex:1,border:BD,borderRadius:7,padding:"5px 8px",fontSize:"0.73em",fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:"#fff"}}
                  onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
                <button onClick={addLink} disabled={!isUrl(linkInput.trim())}
                  style={{background:isUrl(linkInput.trim())?"#0369a1":"#e0d8ce",border:"none",borderRadius:7,padding:"5px 8px",fontSize:"0.73em",fontWeight:700,color:"#fff",cursor:isUrl(linkInput.trim())?"pointer":"default",flexShrink:0}}>＋</button>
              </div>
            </div>

            {/* 保存ボタン */}
            {metaDirty&&!post._unsaved&&(
              <div style={{padding:"10px 14px",borderBottom:BD2}}>
                <button onClick={handleSaveMeta}
                  style={{width:"100%",background:"#f59e0b",border:"none",borderRadius:8,padding:"7px 0",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer"}}>
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
                    <div key={i} style={{background:"#fff",border:BD2,borderRadius:7,padding:"6px 9px",marginBottom:5}}>
                      <div style={{fontSize:"0.75em",color:"#444",lineHeight:1.5}}>{typeof c==="string"?c:c.text}</div>
                      {c.at&&<div style={{fontSize:"0.65em",color:"#aaa",marginTop:2}}>{new Date(c.at).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>}
                    </div>
                  ))}
                  <div style={{display:"flex",gap:5,marginTop:6}}>
                    <input value={cmt} onChange={e=>setCmt(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.isComposing)addComment();}}
                      placeholder="コメントを追加…"
                      style={{flex:1,background:"#fff",border:BD,borderRadius:7,padding:"6px 8px",fontSize:"0.73em",outline:"none",fontFamily:"inherit"}}
                      onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}/>
                    <button onClick={addComment} style={{background:"#f59e0b",border:"none",borderRadius:7,padding:"6px 9px",fontSize:"0.73em",fontWeight:700,color:"#fff",cursor:"pointer",flexShrink:0}}>追加</button>
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
