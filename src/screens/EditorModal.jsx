import { getWorkspace } from "shia2n-core/lib/supabase-lite.js"; // 2026-11-10 みんなの場所では依頼タブを出さない（依頼と Buffer は Naoki 本人の場所だけ）
import React, { useState, useRef, useEffect, useCallback } from "react";
import { POST_TYPE, getPostTypeStyle, STATUS, SCORE, BD, BD2, S, XFONT, IMG_SIZES_OPTS, IMG_ALIGNS_OPTS, genId, nowStr, stripHtml, isUrl, TOOLBAR_BLOCK_LABELS } from "../constants.js";
import { supabase } from "../lib/supabase.js";
import { BodyEditor, Toolbar, InsertModal, SideIcon, PostSearchPanel, htmlToPlain, copyRichText } from "../components/editor.jsx";
import { TagSelector, LabelEditor, MemoEditor, CopyBtn } from "../components/shared.jsx";
import { postToMarkdown, sanitizeFilename } from "./ExportModal.jsx";
import { TemplatePicker } from "../components/TemplatePicker.jsx";
import { TemplateTab } from "../components/TemplateTab.jsx";
import { RequestTab } from "../components/RequestTab.jsx";
import { auth } from "../firebase.js";
import { useDialogFocus } from "../lib/useDialogFocus.js";
import { uploadImage, bodyImages, markImagesForX, saveImageBundle } from "../lib/articleImages.js";
import { hasThumbCol } from "../constants.js";
import { OutlineEditor } from "../components/OutlineEditor.jsx";
import { createStructureMap } from "../lib/mindmapLink.js";

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
    // Esc で閉じて、押したボタンへ戻る（窓より先にこのメニューを閉じる）
    const k=e=>{if(e.key==="Escape"){e.stopPropagation();e.preventDefault();setOpen(false);box.current?.querySelector("button")?.focus();}};
    document.addEventListener("mousedown",h);document.addEventListener("keydown",k,true);
    return()=>{document.removeEventListener("mousedown",h);document.removeEventListener("keydown",k,true);};
  },[open]);
  return(
    <div ref={box} style={{position:"relative",flexShrink:0}}>
      <button className="em-icon" onClick={()=>setOpen(o=>!o)} title="その他" aria-label="その他" style={open?{background:"#f5f0eb",color:"#4b4540"}:undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12.5" cy="8" r="1.4"/></svg>
      </button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:300,background:"#fff",border:BD2,borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,.12)",padding:5,minWidth:200}}>
          {items.map(it=>(
            <button key={it.label} disabled={it.disabled} onClick={()=>{it.onClick();if(it.close)setOpen(false);}}
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
export function EditorModal({uid,post,onSave,onClose,allPosts=[],accounts=[],compact=false,templates=[],postTypes=POST_TYPE,onManageTemplates,onAutoSave,onSentToNotion,owner=false,onDuplicate,onRepost,onDelete}){
  const [draft,setDraft]=useState({...post,memoLinks:post.memoLinks||[],history:post.history||[]});
  // 閉じるときは書きかけの中身も渡す（まだ表に無いネタを、中身があれば残すため）。Esc でも最新を渡すよう ref で持つ
  const draftRef=useRef(draft);draftRef.current=draft;
  // 2026-11-07 直し：予約枠などから開いた、まだ表に無い投稿（_viaPreview）は、何か書き換えるまで裏で保存しない。
  // 書き換えずに閉じたら表に作らない（前のプレビューの窓と同じ。窓では「編集して作成」を押すまで作らなかった）
  const keyOf=d=>JSON.stringify([d.title,d.body,d.memo,d.memoLinks,d.labels,d.status,d.datetime,d.postType,d.account_id,d.score,d.thumb,d.mm_url]);
  const initKey=useRef(keyOf(draft));
  const untouched=()=>!!post._viaPreview&&keyOf(draftRef.current)===initKey.current;
  const onCloseRef=useRef(onClose);onCloseRef.current=onClose;
  // 2026-10-06：既にある投稿の書きかけを、表ではなくこの端末の中に一時保存する（パネルやタブごと閉じても失わないため）。
  // 本番の投稿は勝手に変えない。次に開いたとき「戻す／捨てる」を選んでもらう
  const draftKey=post._unsaved?null:`contentos.draft.${post.id}`;
  const pickDraft=d=>({title:d.title||"",body:d.body||"",memo:d.memo||"",memoLinks:d.memoLinks||[],postType:d.postType,status:d.status,datetime:d.datetime||"",account_id:d.account_id||null});
  const sameAsPost=d=>JSON.stringify(pickDraft(d))===JSON.stringify(pickDraft({...post,memoLinks:post.memoLinks||[]}));
  const [restore,setRestore]=useState(()=>{
    if(!draftKey)return null;
    try{
      const saved=JSON.parse(localStorage.getItem(draftKey)||"null");
      if(!saved?.fields||sameAsPost(saved.fields))return null;
      return saved;
    }catch{return null;}
  });
  const restoreRef=useRef(restore);restoreRef.current=restore;
  // 2026-11-10 軽量化 便1（Naoki OK 00:11）：既にある投稿は、打つ手を止めて 3 秒で自動保存（Ghost と同じ間）。
  // 予約済み・公開済みは Buffer に送った中身を勝手に変えないため、今までどおり「保存」ボタン
  const AUTO_OFF=["reserved","published"];
  const canAuto=!post._unsaved&&!!onAutoSave&&!AUTO_OFF.includes(post.status);
  const autoOn=canAuto&&!AUTO_OFF.includes(draft.status);
  const autoOnRef=useRef(autoOn);autoOnRef.current=autoOn;
  const akey=d=>JSON.stringify([d.title,d.body,d.memo,d.memoLinks,d.labels,d.status,d.datetime,d.postType,d.account_id,d.score,d.thumb,d.mm_url,d.comments]);
  const savedKey=useRef(akey(draft));
  const [autoMsg,setAutoMsg]=useState(canAuto?"保存済み":"");
  const runAuto=async()=>{
    if(!autoOnRef.current)return;
    const d=draftRef.current,k=akey(d);
    if(k===savedKey.current)return;
    setAutoMsg("保存中…");
    let ok=false;try{ok=await onAutoSave(d);}catch{ok=false;}
    if(ok!==false){savedKey.current=k;dropLocal();const t=new Date();setAutoMsg(`保存しました ${t.getHours()}:${String(t.getMinutes()).padStart(2,"0")}`);}
    else setAutoMsg("保存できませんでした。書き足すともう一度保存します");
  };
  useEffect(()=>{
    if(!autoOn)return;
    if(akey(draft)===savedKey.current)return;
    setAutoMsg("書いています…");
    const t=setTimeout(runAuto,3000);
    return()=>clearTimeout(t);
  },[draft,autoOn]);
  useEffect(()=>{
    if(!canAuto)return;
    const flush=()=>{if(document.visibilityState==="hidden")runAuto();};
    document.addEventListener("visibilitychange",flush);window.addEventListener("pagehide",runAuto);
    return()=>{document.removeEventListener("visibilitychange",flush);window.removeEventListener("pagehide",runAuto);};
  },[]);
  const writeLocal=()=>{
    if(!draftKey||restoreRef.current||autoOnRef.current)return; // 自動保存の投稿は表へ直に残すので、端末の一時保存は使わない // 戻すか捨てるかを選ぶまでは上書きしない
    try{
      if(sameAsPost(draftRef.current))localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey,JSON.stringify({at:Date.now(),base:post.updated_at||null,fields:pickDraft(draftRef.current)}));
    }catch{/* 保存できなくても編集は続けられる */}
  };
  const dropLocal=()=>{if(draftKey){try{localStorage.removeItem(draftKey);}catch{/* 無視 */}}};
  useEffect(()=>{
    if(!draftKey)return;
    const t=setTimeout(writeLocal,800);
    return()=>clearTimeout(t);
  },[draft]);
  useEffect(()=>{
    if(!draftKey)return;
    const flush=()=>{if(document.visibilityState==="hidden")writeLocal();};
    document.addEventListener("visibilitychange",flush);window.addEventListener("pagehide",writeLocal);
    return()=>{document.removeEventListener("visibilitychange",flush);window.removeEventListener("pagehide",writeLocal);};
  },[]);
  // 閉じる操作で閉じたときは、保存しない選択として書きかけも捨てる（戻すか選んでいない書きかけは残す）
  const close=()=>{if(autoOnRef.current)runAuto();if(!restoreRef.current)dropLocal();onCloseRef.current(untouched()?{...draftRef.current,_untouched:true}:draftRef.current);};
  // まだ表に無い新しいネタだけ、書いた中身を 0.8 秒ごとに裏で保存する（パネルやタブごと閉じても残すため）。
  // 画面が隠れたとき（パネルを閉じる・タブを切り替える）は待たずにすぐ保存する
  // Notion へ送ったあとは、コンテンツくんへの裏の保存を止める（送ったメモを表に残さないため）
  const sentRef=useRef(false);
  useEffect(()=>{
    if(!post._unsaved||!onAutoSave)return;
    const t=setTimeout(()=>{if(!sentRef.current&&!untouched())onAutoSave(draftRef.current);},800);
    return()=>clearTimeout(t);
  },[draft]);
  useEffect(()=>{
    if(!post._unsaved||!onAutoSave)return;
    const flush=()=>{if(document.visibilityState==="hidden"&&!sentRef.current&&!untouched())onAutoSave(draftRef.current);};
    const hide=()=>{if(!sentRef.current&&!untouched())onAutoSave(draftRef.current);};
    document.addEventListener("visibilitychange",flush);window.addEventListener("pagehide",hide);
    return()=>{document.removeEventListener("visibilitychange",flush);window.removeEventListener("pagehide",hide);};
  },[]);
  const [copyX,setCopyX]=useState(false),[copyNote,setCopyNote]=useState(false);
  const [notionState,setNotionState]=useState("idle"); // idle | saving | done | error
  const [localState,setLocalState]=useState("idle");   // idle | done | error
  const [insertOpen,setInsertOpen]=useState(false),[insertTab,setInsertTab]=useState("image"),[savedRange,setSavedRange]=useState(null);
  // 2026-11-07 Notion の形へ 便②：広い画面は右の機能をいつも出す（左で書く・右に機能）。最初のタブはネタならメモ、ほかは設定
  // 2026-11-10 軽量化 便1：広い画面の右は「詳細・検索」の 2 つ。詳細は 設定 → メモとリンク → コメント → ラベルとサムネ の 1 本（履歴は画面から外した。記録は表に残る）
  const [sidePanel,setSidePanel]=useState(compact?(post.status==="idea"?"meta":null):"set");
  const [sideW,setSideW]=useState(340);
  const [cmt,setCmt]=useState("");
  // 2026-11-07 便③：集中モード。右の機能とヘッダーの飾りを隠し、紙だけにする（⌘. / Ctrl+. で出し入れ）
  const [focusOn,setFocusOn]=useState(false);
  // 2026-11-08 便④：本文と「構成（箇条書き）」を切り替える（広い画面だけ）。構成の正本は思考整理くんのマップ
  const [bodyTab,setBodyTab]=useState("body");
  const [mapBusy,setMapBusy]=useState(false);
  const [smallMsg,setSmallMsg]=useState("");const smallT=useRef(null);
  const showSmall=t=>{setSmallMsg(t);clearTimeout(smallT.current);smallT.current=setTimeout(()=>setSmallMsg(""),3500);};
  const makeMap=async()=>{
    if(mapBusy)return;setMapBusy(true);
    try{const url=await createStructureMap({...post,...draftRef.current});setDraft(d=>({...d,mm_url:url}));showSmall("構成のマップを作りました。保存すると、この投稿とつながったまま残ります");}
    catch(e){showSmall(e.message||"マップを作れませんでした");}
    finally{setMapBusy(false);}
  };
  const toHeadings=hs=>{
    if(!hs.length){showSmall("一番上の段に字がありません");return;}
    const esc=t=>t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    setDraft(d=>({...d,body:(d.body||"")+hs.map(h=>`<h1>${esc(h)}</h1><p><br></p>`).join("")}));
    setBodyTab("body");showSmall(`見出しを ${hs.length} 本、本文の最後に入れました`);
  };
  useEffect(()=>{
    if(compact)return;
    const k=e=>{if((e.metaKey||e.ctrlKey)&&e.key==="."){e.preventDefault();setFocusOn(v=>!v);}
      if((e.metaKey||e.ctrlKey)&&(e.key==="s"||e.key==="S")){e.preventDefault();if(autoOnRef.current)runAuto();else saveRef.current();}};
    document.addEventListener("keydown",k);return()=>document.removeEventListener("keydown",k);
  },[compact]);
  const dragging=useRef(false);
  const bodyEditorRef=useRef(null),articleAreaRef=useRef(null),titleRef=useRef(null);

  const startResize=e=>{
    e.preventDefault();
    dragging.current=true;
    const startX=e.clientX,startW=sideW;
    const onMove=e=>{if(dragging.current)setSideW(Math.max(180,Math.min(520,startW+(startX-e.clientX))));};
    const onUp=()=>{dragging.current=false;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };

  // 窓の決まり：Esc で閉じる（差し込みの窓・型の窓が上にある間は、上の窓だけが閉じる）。Tab は窓の中で回す。
  // 開いたときのフォーカス：ネタ（idea）はメモ欄が自分で取る。それ以外は、タイトルが空ならタイトル、あれば本文の末尾
  const boxRef=useRef(null);
  useDialogFocus(boxRef,{onClose:close,canClose:!insertOpen,initialFocus:post.status==="idea"?false:()=>{
    if(!(draftRef.current.title||"").trim())return titleRef.current;
    const ed=bodyEditorRef.current;if(!ed)return titleRef.current;
    ed.focus();
    try{const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);}catch{/* カーソルを置けなくても開ける */}
    return ed;
  }});

  const openInsert=(tab)=>{
    setInsertTab(tab==="post"?"post":"image");
    const sel=window.getSelection();
    if(sel?.rangeCount>0){const r=sel.getRangeAt(0);setSavedRange(bodyEditorRef.current?.contains(r.commonAncestorContainer)?r.cloneRange():null);}
    else setSavedRange(null);
    setInsertOpen(true);
  };
  // 段 5：型の差し込み先。細い幅は「本文／メモ」の切り替え、広い幅は最後に触った側
  const memoRef=useRef(null);
  const [lastSide,setLastSide]=useState(post.status==="idea"?"memo":"body");
  const side=compact?(sidePanel==="meta"?"memo":"body"):(sidePanel==="set"?lastSide:"body");
  const handleSave=()=>{dropLocal();savedKey.current=akey(draft);onSave({...draft,history:[...(draft.history||[]),{at:nowStr(),note:"編集・保存"}]});};
  const saveRef=useRef(handleSave);saveRef.current=handleSave;
  const [titleCopied,setTitleCopied]=useState(false);
  const copyTitle=()=>{const t=(draft.title||"").trim();if(!t)return;navigator.clipboard?.writeText(t).then(()=>{setTitleCopied(true);setTimeout(()=>setTitleCopied(false),1500);},()=>{});};
  // コピー（2026-11-07）：X記事は画像の位置に【画像1】…の目印を置く（X記事は画像を貼っても入らないため）。
  // ほかの種類は文と画像をまとめて運ぶ（note の本文は、貼れば画像も入る）。mode を渡せば種類によらずその形
  const imgs=bodyImages(draft.body||"");
  const isXArticle=draft.postType==="x_article";
  const [copyNote2,setCopyNote2]=useState("");
  const doCopy=(target,mode)=>{
    const raw=draft.body||"";
    const m=mode||(isXArticle?"mark":"rich");
    const html=m==="mark"&&imgs.length?markImagesForX(raw):raw;
    const isThread=/<hr[^>]*class="thread-sep"|data-thread="true"/i.test(html);
    const plain=htmlToPlain(html, isThread);
    copyRichText(html,plain,()=>{
      if(target==="x"){setCopyX(true);setTimeout(()=>setCopyX(false),3500);}
      else{setCopyNote(true);setTimeout(()=>setCopyNote(false),3500);}
      if(imgs.length)setCopyNote2(m==="mark"?`画像 ${imgs.length} か所に【画像1】〜の目印を入れてコピーしました。画像は「…」の「画像をまとめて保存」から`:`文と画像 ${imgs.length} 枚をコピーしました`);
    });
  };
  // 画像をまとめて保存（00_サムネ・01・02…）
  const [imgSave,setImgSave]=useState(""); // "" | 保存中 | 結果の一言
  const saveImages=async()=>{
    setImgSave("保存中…");
    try{
      const r=await saveImageBundle({thumb:draft.thumb||"",images:imgs,title:draft.title,date:draft.datetime});
      setImgSave(r.saved?`${r.saved} 枚を「${r.file}」にまとめて保存しました。開くと 00_サムネ・01・02… のフォルダが出ます${r.failed?`（${r.failed} 枚は取れませんでした）`:""}`:"画像を取れませんでした。少しおいてもう一度");
    }catch(e){
      setImgSave(e?.name==="AbortError"?"":"保存できませんでした："+(e?.message||e));
    }
  };
  // サムネ（2026-11-07）：1 枚。note の見出し画像・X記事の表紙は、保存したファイルを選んで付ける
  const thumbRef=useRef(null);
  const [thumbBusy,setThumbBusy]=useState(false),[thumbErr,setThumbErr]=useState("");
  const pickThumb=async e=>{
    const f=e.target.files?.[0];if(!f)return;
    setThumbErr("");setThumbBusy(true);
    try{const url=await uploadImage(f);setDraft(d=>({...d,thumb:url}));}
    catch(err){setThumbErr("サムネを置けませんでした："+err.message);}
    finally{setThumbBusy(false);if(thumbRef.current)thumbRef.current.value="";}
  };
  const imgCount=imgs.length+(draft.thumb?1:0);

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
      const token=await auth.currentUser?.getIdToken(); // 2026-10-28：口が持ち主の確かめを求めるようになった
      const res=await fetch("/api/internal/push-to-notion",{
        method:"POST",
        headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},
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

  // 2026-10-06：アイデアメモを Notion の inbox／インプット／アウトプットへ送る。送ったメモはコンテンツくんに残さない
  const [sendTo,setSendTo]=useState(null),[sendErr,setSendErr]=useState(null);
  const canSend=!!(post._unsaved&&onSentToNotion);
  const hasMemo=!!((draft.title||"").trim()||(draft.memo||"").trim()||(draft.memoLinks||[]).length||stripHtml(draft.body||""));
  const sendToNotion=async dest=>{
    if(sendTo||!hasMemo)return;
    setSendTo(dest);setSendErr(null);
    try{
      const user=auth.currentUser;
      if(!user)throw new Error("ログインを確認できませんでした。パネルを開き直してください");
      const token=await user.getIdToken();
      const links=(draft.memoLinks||[]).map(l=>l.label&&l.label!==l.url?`${l.label} ${l.url}`:l.url);
      const bodyText=draft.body?htmlToPlain(draft.body,false).trim():"";
      const memo=[(draft.memo||"").trim(),links.join("\n"),bodyText].filter(Boolean).join("\n\n");
      const title=(draft.title||"").trim();
      const res=await fetch("/api/notion-memo",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({dest,title,memo})});
      const raw=await res.text();
      let data={};try{data=JSON.parse(raw);}catch{/* JSON でない返事は、そのまま一部を見せる */}
      if(!res.ok||!data.ok)throw new Error(data.error||`送れませんでした（${res.status}）${raw?`：${raw.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,120)}`:""}`);
      sentRef.current=true;
      dropLocal();
      onSentToNotion({id:post.id,label:data.label,url:data.url});
    }catch(e){
      setSendErr(e.message);
      setSendTo(null);
    }
  };

  // 2026-11-07 便③：種類の名前は、このアカウントの種類の一覧から引く（足した種類が「その他」と出ていた）
  const pt=getPostTypeStyle(draft.postType,postTypes);
  const ptKnown=Object.prototype.hasOwnProperty.call(postTypes,draft.postType);
  const st=STATUS[draft.status];
  // 2026-11-07 便②：サムネとラベルは、広い画面では右の「設定」、細い画面（パネル）では今までどおり「メモ」に出す
  const thumbBlock=(
                    <div>
                      <label style={{fontSize:"max(12px,0.7em)",fontWeight:700,color:"#6b6259",display:"block",marginBottom:5}}>サムネ</label>
                      {!hasThumbCol()?<div style={{fontSize:12,color:"#736a62"}}>サムネは準備中です</div>:(<>
                        <input ref={thumbRef} type="file" accept="image/*" style={{display:"none"}} onChange={pickThumb}/>
                        {draft.thumb?(
                          <div style={{background:"#fff",border:BD2,borderRadius:10,padding:6}}>
                            <img src={draft.thumb} alt="サムネ" style={{width:"100%",maxHeight:150,objectFit:"cover",borderRadius:7,display:"block"}}/>
                            <div style={{display:"flex",gap:6,marginTop:6}}>
                              <button onClick={()=>thumbRef.current?.click()} disabled={thumbBusy} style={{flex:1,border:BD2,background:"#fff",borderRadius:8,padding:"6px 0",fontSize:12,fontWeight:700,color:"#333",cursor:"pointer",fontFamily:"inherit"}}>{thumbBusy?"置いています…":"編集"}</button>
                              <button onClick={()=>setDraft(d=>({...d,thumb:""}))} style={{flex:1,border:BD2,background:"#fff",borderRadius:8,padding:"6px 0",fontSize:12,fontWeight:700,color:"#b91c1c",cursor:"pointer",fontFamily:"inherit"}}>削除</button>
                            </div>
                          </div>
                        ):(
                          <button onClick={()=>thumbRef.current?.click()} disabled={thumbBusy} style={{width:"100%",border:"2px dashed #a39a90",background:"#f8f5f1",borderRadius:9,padding:"14px 0",cursor:"pointer",color:"#6b6259",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>{thumbBusy?"置いています…":"＋ サムネの画像を選ぶ"}</button>
                        )}
                        {thumbErr&&<div role="alert" style={{fontSize:12,fontWeight:700,color:"#b91c1c",background:"#fef2f2",borderRadius:8,padding:"6px 9px",marginTop:6}}>{thumbErr}</div>}
                        <div style={{fontSize:12,color:"#736a62",marginTop:5,lineHeight:1.5}}>note の見出し画像・X記事の表紙は、「…」の「画像をまとめて保存」で出た 00_サムネ を選んで付ける</div>
                      </>)}
                    </div>
  );
  const labelBlock=(
                    <div>
                      <label style={{fontSize:"max(12px,0.7em)",fontWeight:700,color:"#6b6259",display:"block",marginBottom:5}}>ラベル</label>
                      <LabelEditor labels={draft.labels||[]} onChange={labels=>setDraft(d=>({...d,labels}))}/>
                    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:compact?0:14}}>
      {insertOpen&&<InsertModal onClose={()=>setInsertOpen(false)} savedRange={savedRange} bodyRef={bodyEditorRef} initialTab={insertTab}/>}
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label={post._unsaved?"新しい投稿を書く":"投稿を編集"} style={{background:"#fff",borderRadius:compact?0:18,width:"100%",maxWidth:1100,height:compact?"100vh":"calc(100vh - 28px)",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px #00000030"}}>

        {/* ヘッダー（細い幅）：戻る・コピー・保存の 3 つと、種類・状態・登録先・日時だけ */}
        {compact&&(
          <div style={{borderBottom:BD2,background:"#fff",flexShrink:0,padding:"8px 10px",display:"flex",flexDirection:"column",gap:7}}>
            <div style={{...S.row,gap:6}}>
              <button onClick={close} style={{background:"none",border:BD,borderRadius:20,padding:"5px 11px",fontSize:12,fontWeight:700,color:"#555",cursor:"pointer",whiteSpace:"nowrap"}}>← 一覧</button>
              <div style={{flex:1}}/>
              <TemplatePicker compact templates={templates} side={side} postType={draft.postType} postTypes={postTypes} bodyRef={bodyEditorRef} memoRef={memoRef} draft={draft} setDraft={setDraft} onManage={onManageTemplates}/>
              <button onClick={()=>doCopy("x")} style={{background:copyX?"#00ba7c":"#fff",color:copyX?"#fff":"#555",border:copyX?"1px solid #00ba7c":BD,borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"background .2s"}}>{copyX?"コピーしました":"コピー"}</button>
{canAuto&&<span role="status" aria-live="polite" style={{fontSize:12,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",fontWeight:700,whiteSpace:"nowrap",color:autoOn&&/^保存(しました|済み)/.test(autoMsg)?"#047857":autoOn&&/できません/.test(autoMsg)?"#b91c1c":"#6b6259"}}>{autoOn?autoMsg:(akey(draft)!==savedKey.current?"保存していない変更があります":"")}</span>}
              {!autoOn&&<button onClick={handleSave} style={{background:"#b45309",border:"none",borderRadius:20,padding:"6px 16px",fontSize:12,fontWeight:800,color:"#fff",cursor:"pointer"}}>保存</button>}
            </div>
            <div style={{...S.row,gap:5,flexWrap:"wrap"}}>
              <select value={draft.postType} onChange={e=>setDraft(d=>({...d,postType:e.target.value}))}
                style={{border:`1.5px solid ${pt.border}`,borderRadius:20,padding:"3px 8px",fontSize:12,fontWeight:700,color:pt.color,background:pt.bg,cursor:"pointer",fontFamily:"inherit",outline:"none",maxWidth:"100%"}}>
                {Object.entries(postTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))}
                style={{border:`1.5px solid ${st?.border}`,borderRadius:20,padding:"3px 8px",fontSize:12,fontWeight:700,color:st?.text,background:st?.chip,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              {accounts.length>1&&(
                <select value={draft.account_id||""} onChange={e=>setDraft(d=>({...d,account_id:e.target.value}))}
                  style={{background:"#fff7ed",border:"1px solid #fcd34d",borderRadius:20,padding:"3px 8px",fontSize:12,fontWeight:700,color:"#b45309",outline:"none",cursor:"pointer",fontFamily:"inherit",maxWidth:"100%"}}>
                  {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <input type="datetime-local" value={draft.datetime} onChange={e=>setDraft(d=>({...d,datetime:e.target.value}))}
                style={{border:BD,borderRadius:8,padding:"3px 6px",fontSize:12,color:"#555",fontFamily:"inherit",outline:"none",maxWidth:"100%"}}/>
            </div>
            <div style={{display:"flex",background:"#f5f0eb",borderRadius:8,padding:2,gap:2,border:BD2}}>
              {[[null,"本文"],["meta","メモ"]].map(([k,l])=>(
                <button key={l} onClick={()=>setSidePanel(k)} style={{flex:1,padding:"5px 0",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:sidePanel===k?"#fff":"transparent",color:sidePanel===k?"#111":"#736a62",boxShadow:sidePanel===k?"0 1px 2px rgba(0,0,0,.06)":"none"}}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {/* ヘッダー（広い幅）：2026-11-07 便②。左に「戻る」、右に「型・…・保存」だけ。投稿の属性は右の「設定」へ移した */}
        {!compact&&<div style={{...S.row,padding:"6px 12px",borderBottom:BD2,background:"#fff",minHeight:52,gap:6,flexShrink:0}}>
          <button className="em-btn" onClick={close} title="閉じる（Esc）">← 戻る</button>
          <span style={{fontSize:12,color:"#736a62",fontWeight:600,marginLeft:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{post._unsaved?"新しい投稿":`${ptKnown?pt.label:(draft.postType||"種類なし")}・${st?.label||""}`}</span>
          <div style={{flex:1}}/>
          <span role="status" aria-live="polite" style={{fontSize:12,color:"#047857",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:360}}>{smallMsg}</span>
          {canAuto&&<span role="status" aria-live="polite" style={{fontSize:12,fontWeight:700,whiteSpace:"nowrap",color:autoOn&&/^保存(しました|済み)/.test(autoMsg)?"#047857":autoOn&&/できません/.test(autoMsg)?"#b91c1c":"#6b6259"}}>{autoOn?autoMsg:(akey(draft)!==savedKey.current?"保存していない変更があります":"")}</span>}
          <button className="em-btn" onClick={()=>setFocusOn(v=>!v)} aria-pressed={focusOn} title="⌘.（Ctrl+.）">{focusOn?"✓ 集中を終える":"集中モード"}</button>
          {!focusOn&&<TemplatePicker templates={templates} side={side} postType={draft.postType} postTypes={postTypes} bodyRef={bodyEditorRef} memoRef={memoRef} draft={draft} setDraft={setDraft} onManage={onManageTemplates}/>}
          {!focusOn&&<MoreMenu items={[
            ...(imgs.length?[isXArticle
              ?{label:"note 用にコピー（画像つき）",onClick:()=>doCopy("note","rich"),close:true}
              :{label:"X記事用にコピー（画像の位置に目印）",onClick:()=>doCopy("note","mark"),close:true}]:[]),
            ...(imgCount?[{label:imgSave==="保存中…"?"画像を保存中…":`画像をまとめて保存（${imgCount} 枚）`,onClick:saveImages,disabled:imgSave==="保存中…",close:true}]:[]),
            ...(owner?[{label:notionState==="saving"?"Notion に保存中…":notionState==="done"?"Notion に保存しました":notionState==="error"?"Notion に保存できませんでした":"Notion に保存",onClick:saveToNotion,disabled:notionState==="saving"}]:[]), // 会員には出さない
            {label:localState==="done"?"ファイルに保存しました":localState==="error"?"ファイルに保存できませんでした":"ファイルに保存（.md）",onClick:saveLocalFile},
            // 2026-11-07 便②：プレビューの窓にあった 3 つをここへ移した（窓をなくしたため）
            ...(!post._unsaved&&onDuplicate?[{label:"複製（翌日の同じ時刻）",onClick:()=>onDuplicate({...post,...draft}),close:true}]:[]),
            ...(!post._unsaved&&onRepost?[{label:"再投稿",onClick:()=>{close();onRepost({...post,...draft});},close:true}]:[]),
            ...(!post._unsaved&&onDelete?[{label:"ゴミ箱へ移動",onClick:()=>{close();onDelete(post);},close:true}]:[]),
          ]}/>}
          {!autoOn&&<button onClick={handleSave} title="⌘S（Ctrl+S）" style={{background:"#b45309",border:"none",borderRadius:10,padding:"8px 18px",fontSize:12.5,fontWeight:800,color:"#fff",cursor:"pointer",whiteSpace:"nowrap",marginLeft:4,boxShadow:"0 1px 2px rgba(180,83,9,.25)"}}>保存</button>}
        </div>}
        <style>{`
          .em-chip{appearance:none;-webkit-appearance:none;border:none;background-color:transparent;border-radius:9px;padding:6px 10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;outline:none;max-width:180px}
          select.em-chip{padding-right:22px;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%2710%27 viewBox=%270 0 10 10%27%3E%3Cpath d=%27M2 3.5l3 3 3-3%27 fill=%27none%27 stroke=%27%23a8a09a%27 stroke-width=%271.5%27 stroke-linecap=%27round%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 7px center}
          .em-chip:hover,.em-chip:focus-visible{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.06)}
          .em-btn{background:#fff;border:1px solid #e6dfd6;border-radius:10px;padding:7px 13px;font-size:12px;font-weight:700;color:#4b4540;cursor:pointer;white-space:nowrap;font-family:inherit}
          .em-btn:hover{border-color:#d4cbbf;background:#faf7f3}
          .em-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;background:none;border-radius:9px;color:#736a62;cursor:pointer;flex-shrink:0}
          .em-icon:hover{background:#f5f0eb;color:#4b4540}
        `}</style>

        {(copyNote2||(imgSave&&imgSave!=="保存中…"))&&(
          <div role="status" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"7px 14px",background:"#ecfdf5",borderBottom:"1px solid #a7f3d0",fontSize:12,fontWeight:700,color:"#065f46",flexShrink:0}}>
            <span>{imgSave&&imgSave!=="保存中…"?imgSave:copyNote2}</span>
            <span style={{flex:1}}/>
            <button onClick={()=>{setCopyNote2("");setImgSave("");}} aria-label="この知らせを閉じる" style={{background:"none",border:"none",color:"#065f46",cursor:"pointer",fontSize:13,minWidth:28,minHeight:28}}>✕</button>
          </div>
        )}
        {restore&&(
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"8px 14px",background:"#fffbeb",borderBottom:"1px solid #fcd34d",fontSize:12,color:"#92400e",flexShrink:0}}>
            <span style={{fontWeight:700}}>保存していない書きかけがあります（{new Date(restore.at).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}）</span>
            {restore.base!==(post.updated_at||null)&&<span style={{color:"#b45309"}}>このあと別の場所で保存されています。戻すとその分を上書きします</span>}
            <span style={{flex:1}}/>
            <button onClick={()=>{setDraft(d=>({...d,...restore.fields}));setRestore(null);}} style={{background:"#b45309",color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:800,cursor:"pointer"}}>戻す</button>
            <button onClick={()=>{dropLocal();setRestore(null);}} style={{background:"#fff",color:"#92400e",border:"1px solid #fcd34d",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>捨てる</button>
          </div>
        )}
        {/* 本体 */}
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* 記事エリア */}
          <div onFocusCapture={()=>setLastSide("body")} style={{flex:1,display:compact&&sidePanel?"none":"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
            {/* 2026-11-07 便③：広い画面は書式の帯を常には出さない（「/」と、文字を選んだときの帯で呼ぶ）。細い画面は今までどおり */}
            {compact&&<div style={{overflowX:"auto",flexShrink:0}}><Toolbar onInsertOpen={openInsert}/></div>}
            <div style={{flex:1,overflowY:"auto"}}>
              <div ref={articleAreaRef} style={{padding:compact?"16px 14px 80px":"28px 32px 100px",...(focusOn&&!compact?{maxWidth:760,margin:"0 auto",paddingTop:56}:{})}}>
                {/* 2026-11-10 Naoki「タイトルもコピー可能にする」：タイトルの横に「コピー」 */}
                <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:compact?12:18,paddingBottom:compact?12:18,borderBottom:BD2}}>
                <input ref={titleRef} type="text" value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}
                  placeholder="タイトルを入力..."
                  style={{flex:1,minWidth:0,border:"none",outline:"none",fontSize:compact?20:28,fontWeight:800,lineHeight:1.25,color:"#0f1419",fontFamily:XFONT,background:"transparent",display:"block",boxSizing:"border-box"}}/>
                <button type="button" onClick={copyTitle} disabled={!draft.title} aria-label="タイトルをコピー" title={draft.title?"タイトルをコピー":"タイトルが空です"}
                  style={{flexShrink:0,marginTop:compact?0:4,height:30,padding:"0 10px",borderRadius:8,border:titleCopied?"1px solid #047857":"1px solid #a39a90",background:titleCopied?"#ecfdf5":"#fff",color:titleCopied?"#047857":"#1a1a1a",fontSize:12,fontWeight:800,cursor:draft.title?"pointer":"default",fontFamily:"inherit",whiteSpace:"nowrap",opacity:draft.title?1:.5}}>{titleCopied?"✓ コピーしました":"コピー"}</button>
                </div>
                {!compact&&<div role="tablist" aria-label="本文と構成" style={{display:"flex",alignItems:"center",gap:2,borderBottom:BD2,margin:"-6px 0 14px"}}>
                  {[["body","本文"],["outline","構成（箇条書き）"]].map(([k,l])=><button key={k} role="tab" aria-selected={bodyTab===k} onClick={()=>setBodyTab(k)} style={{border:"none",background:"none",padding:"6px 10px",fontSize:13,fontWeight:700,color:bodyTab===k?"#1a1a1a":"#6b6259",borderBottom:`2px solid ${bodyTab===k?"#f59e0b":"transparent"}`,marginBottom:-1,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>)}
                  {draft.mm_url&&<span style={{marginLeft:"auto",fontSize:12,color:"#736a62"}}>思考整理くんとつながっている</span>}
                </div>}
                {!compact&&bodyTab==="outline"?<OutlineEditor mmUrl={draft.mm_url} onMakeMap={makeMap} onHeadings={toHeadings} toast={showSmall}/>:<>
                {!compact&&!focusOn&&<div style={{fontSize:12,color:"#736a62",margin:"-4px 0 14px"}}>「/」で見出し・箇条書き・画像・スレッドの区切りなどを入れる　文字を選ぶと書式の帯（箇条書き・画像も）が出る　⌘.（Ctrl+.）で集中モード</div>}
                <BodyEditor value={draft.body} onChange={body=>setDraft(d=>({...d,body}))} editorRef={bodyEditorRef} slash={!compact} bubble={!compact} onInsertOpen={openInsert}/>
                </>}
              </div>
            </div>
            <div style={{padding:"4px 50px",borderTop:BD2,background:"#f5f0eb",fontSize:"max(12px,0.67em)",color:"#736a62",flexShrink:0}}>
              {((draft.title||"")+(draft.body||"").replace(/<[^>]+>/g,"")).length.toLocaleString()} 文字
            </div>
          </div>

          {/* サイドパネル展開 */}
          {sidePanel&&!(focusOn&&!compact)&&(
            <>
              {!compact&&<div onMouseDown={startResize}
                style={{width:4,cursor:"col-resize",background:"transparent",flexShrink:0,transition:"background .15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#e0d8ce"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}/>}
              <div onFocusCapture={()=>setLastSide("memo")} style={compact?{flex:1,minWidth:0,borderLeft:"1px solid #e6dfd6",background:"#fafafa",display:"flex",flexDirection:"column"}:{width:sideW,borderLeft:"1px solid #e6dfd6",background:"#fafafa",display:"flex",flexDirection:"column",flexShrink:0}}>
              {!compact&&<div role="tablist" aria-label="右の機能" style={{display:"flex",gap:2,padding:"6px 8px 0",borderBottom:BD2,background:"#fff"}}>
                {[["set","詳細"],["search","検索"],["tpl","型"],...(uid&&!getWorkspace()?[["req","依頼"]]:[])].map(([k,l])=>
                  <button key={k} role="tab" aria-selected={sidePanel===k} onClick={()=>setSidePanel(k)} style={{border:"none",background:"none",padding:"8px 10px",fontSize:12.5,fontWeight:700,color:sidePanel===k?"#1a1a1a":"#6b6259",borderBottom:`2px solid ${sidePanel===k?"#f59e0b":"transparent"}`,marginBottom:-1,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>)}
              </div>}
              <div style={{flex:1,overflowY:"auto",padding:sidePanel==="search"?0:13}}>
                {sidePanel==="req"&&!compact&&<RequestTab uid={uid} allPosts={allPosts} draft={draft} setDraft={setDraft} saved={allPosts.some(p=>p.id===draft.id)} templates={templates} postTypes={postTypes} toast={showSmall} onManageTemplates={onManageTemplates?()=>onManageTemplates({kind:"request"}):null}/>}
                {sidePanel==="tpl"&&!compact&&<TemplateTab templates={templates} postType={draft.postType} postTypes={postTypes} bodyRef={bodyEditorRef} memoRef={memoRef} draft={draft} setDraft={setDraft} onManage={onManageTemplates?()=>onManageTemplates():null} onEdit={onManageTemplates?(t=>onManageTemplates(t.id)):null} toast={showSmall}/>}
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
                {sidePanel==="set"&&!compact&&(()=>{
                  const lab={fontSize:12,fontWeight:700,color:"#6b6259",display:"block",marginBottom:5};
                  const fld={width:"100%",border:"1px solid #a39a90",borderRadius:8,padding:"6px 8px",fontSize:13,fontFamily:"inherit",background:"#fff",outline:"none",boxSizing:"border-box"};
                  const hasNums=post.impressions!==null&&post.impressions!==undefined;
                  return <div style={{...S.col,gap:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"64px minmax(0,1fr)",gap:"8px 10px",alignItems:"center"}}>
                      <span style={lab}>種類</span>
                      <select value={draft.postType} onChange={e=>setDraft(d=>({...d,postType:e.target.value}))} style={{...fld,color:pt.color,fontWeight:700}}>
                        {!ptKnown&&<option value={draft.postType}>{draft.postType||"種類なし"}（一覧に無い種類）</option>}
                        {Object.entries(postTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <span style={lab}>状態</span>
                      <select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))} style={{...fld,color:st?.text,fontWeight:700}}>
                        {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                      {accounts.length>0&&<><span style={lab}>登録先</span>
                      <select value={draft.account_id||""} onChange={e=>setDraft(d=>({...d,account_id:e.target.value}))} style={fld}>
                        {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                      </select></>}
                      <span style={lab}>予定</span>
                      <input type="datetime-local" value={draft.datetime} onChange={e=>setDraft(d=>({...d,datetime:e.target.value}))} style={fld}/>
                      <span style={lab}>評価</span>
                      <div role="radiogroup" aria-label="評価" style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {Object.keys(SCORE).map(k=>{const on=draft.score===k;return <button key={k} role="radio" aria-checked={on} onClick={()=>setDraft(d=>({...d,score:on?null:k}))}
                          style={{minWidth:30,height:30,borderRadius:7,border:`1.5px solid ${on?SCORE[k].bg:"#a39a90"}`,background:on?SCORE[k].bg:"#fff",color:on?"#fff":"#333",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{on?"✓ ":""}{k}</button>;})}
                      </div>
                    </div>
                    {hasNums&&<div>
                      <span style={lab}>反応の数字（Buffer から毎日）</span>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:6}}>
                        {[["表示",post.impressions],["いいね",post.reactions],["返信",post.replies],["リポスト",post.reposts],["クリック",post.clicks],...(post.auto_score?[["自動の評価",post.auto_score]]:[])].map(([l,v])=>
                          <div key={l} style={{background:"#fff",border:BD2,borderRadius:8,padding:"6px 8px"}}><div style={{fontSize:12,color:"#6b6259"}}>{l}</div><b style={{fontSize:14,fontVariantNumeric:"tabular-nums"}}>{(v===null||v===undefined)?"—":typeof v==="number"?v.toLocaleString("ja-JP"):v}</b></div>)}
                      </div>
                    </div>}
                  </div>;
                })()}
                {(sidePanel==="meta"||(sidePanel==="set"&&!compact))&&(
                  <div style={{...S.col,gap:12,...(compact?{}:{borderTop:BD2,marginTop:14,paddingTop:12})}}>
                    {compact&&thumbBlock}
                    {canSend&&(
                      <div style={{background:"#fff",border:BD2,borderRadius:10,padding:"8px 10px",display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:6}}>
                          <span style={{fontSize:"max(12px,0.7em)",fontWeight:800,color:"#6b6560"}}>Notion へ送る</span>
                          <span style={{fontSize:"max(12px,0.64em)",fontWeight:600,color:"#736a62"}}>送るとコンテンツくんには残りません</span>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:6}}>
                          {[["inbox","inbox"],["input","インプット"],["output","アウトプット"]].map(([k,l])=>{
                            const off=!hasMemo||!!sendTo;
                            return <button key={k} disabled={off} onClick={()=>sendToNotion(k)}
                              style={{border:BD2,background:"#fff",borderRadius:8,padding:"7px 4px",fontSize:12,fontWeight:800,color:off&&sendTo!==k?"#736a62":"#333",cursor:off?"default":"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{sendTo===k?"送信中…":l}</button>;
                          })}
                        </div>
                        {sendErr&&<div style={{fontSize:"max(12px,0.72em)",fontWeight:700,color:"#b91c1c",background:"#fef2f2",borderRadius:8,padding:"6px 9px"}}>{sendErr}</div>}
                      </div>
                    )}
                    <div>
                      <label style={{fontSize:"max(12px,0.7em)",fontWeight:700,color:"#6b6259",display:"block",marginBottom:5}}>概要メモ・リンク</label>
                      <MemoEditor textareaRef={memoRef} memo={draft.memo} memoLinks={draft.memoLinks} autoFocus={post.status==="idea"} onChange={({memo,memoLinks})=>setDraft(d=>({...d,memo,memoLinks}))}/>
                    </div>
                    {compact&&labelBlock}
                    <div>
                      <label style={{fontSize:"max(12px,0.7em)",fontWeight:700,color:"#6b6259",display:"block",marginBottom:5}}>コメント（{(draft.comments||[]).length}）</label>
                      {(draft.comments||[]).map((c,i)=>(
                        <div key={i} style={{background:"#fff",border:BD2,borderRadius:7,padding:"6px 9px",fontSize:"max(12px,0.77em)",color:"#444",lineHeight:1.6,marginBottom:4}}>{typeof c==="string"?c:c.text}</div>
                      ))}
                      {/* 2026-11-07 便②：プレビューの窓にあったコメントの追加をここへ。保存で残る */}
                      <div style={{display:"flex",gap:6}}>
                        <input value={cmt} onChange={e=>setCmt(e.target.value)} placeholder="コメントを追加" aria-label="コメントを追加"
                          onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing&&cmt.trim()){e.preventDefault();setDraft(d=>({...d,comments:[...(d.comments||[]),{text:cmt.trim(),at:nowStr()}]}));setCmt("");}}}
                          style={{flex:1,minWidth:0,border:"1px solid #a39a90",borderRadius:8,padding:"6px 8px",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                        <button onClick={()=>{if(!cmt.trim())return;setDraft(d=>({...d,comments:[...(d.comments||[]),{text:cmt.trim(),at:nowStr()}]}));setCmt("");}} style={{border:BD2,background:"#fff",borderRadius:8,padding:"0 10px",fontSize:12,fontWeight:700,color:"#333",cursor:"pointer",fontFamily:"inherit"}}>追加</button>
                      </div>
                    </div>
                    {!compact&&<div style={{borderTop:BD2,paddingTop:12,display:"flex",flexDirection:"column",gap:12}}><div style={{fontSize:12,fontWeight:800,color:"#1a1a1a"}}>ラベルとサムネ</div>{labelBlock}{thumbBlock}</div>}
                  </div>
                )}
              </div>
              {/* 2026-11-07 便②：コピーは右の下にいつも置く（ヘッダーから移した） */}
              {!compact&&<div style={{borderTop:BD2,background:"#fff",padding:10,display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                <button onClick={()=>doCopy("x")} style={{height:36,borderRadius:9,border:copyX?"1px solid #047857":"1px solid #a39a90",background:copyX?"#ecfdf5":"#fff",color:copyX?"#047857":"#1a1a1a",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{copyX?"✓ コピーしました":isXArticle&&imgs.length?"X記事用にコピー（画像の位置に目印）":imgs.length?"コピー（画像つき）":"コピー"}</button>
              </div>}
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
