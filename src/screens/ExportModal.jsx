import React, { useState, useRef, useEffect, useCallback } from "react";
import { POST_TYPE, STATUS, SCORE, BD, BD2, S, fmtDate, fmtTime, stripHtml } from "../constants.js";
import { Btn } from "../components/shared.jsx";

export function postToMarkdown(p){
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

export function sanitizeFilename(s){
  return (s||"untitled").replace(/[\\/:*?"<>|]/g,"_").slice(0,60);
}

// ════════════════════════════════════════════════════════
// AIコンテキスト出力モーダル
// ════════════════════════════════════════════════════════
export function postsToAIContext(posts, accountName, {scores, postTypes, includeBody, includeMemo, includeLinks, prompt}){
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

export function postsToCSV(posts, postTypes){
  const esc=v=>`"${String(v||"").replace(/"/g,'""')}"`; 
  const header=["日時","タイトル","ステータス","種類","スコア","ラベル","メモ","リンク","文字数"];
  const rows=posts.map(p=>([
    esc(p.datetime.replace("T"," ")),
    esc(p.title||""),
    esc(STATUS[p.status]?.label||p.status),
    esc((postTypes[p.postType||"x_post"]||POST_TYPE[p.postType||"x_post"])?.label||p.postType),
    esc(p.score||""),
    esc((p.labels||[]).join(" / ")),
    esc(p.memo||""),
    esc((p.memoLinks||[]).map(l=>typeof l==="string"?l:l.url).join(" / ")),
    esc(p.body?p.body.replace(/<[^>]+>/g,"").length:"0"),
  ].join(",")));
  return [header.join(","),...rows].join("\n");
}

export function ExportModal({tab:initialTab="ai",posts,accountName,allPostTypes=POST_TYPE,onClose}){
  const [tab,setTab]=useState(initialTab);
  useEffect(()=>setTab(initialTab),[initialTab]);

  // ── AI出力タブ state ──
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

  // ── ファイル保存タブ state ──
  const [format,setFormat]=useState("md");
  const [scope,setScope]=useState("all");
  const [statusFilter,setStatusFilter]=useState("all");
  const [folderHandle,setFolderHandle]=useState(null);
  const [progress,setProgress]=useState(null);
  const [done,setDone]=useState(false);

  const toggle=(arr,setArr,v)=>setArr(prev=>prev.includes(v)?prev.filter(x=>x!==v):[...prev,v]);

  const setPreset=preset=>{
    const d=new Date();
    if(preset==="all"){setDateFrom("");setDateTo(today);return;}
    if(preset==="7"){d.setDate(d.getDate()-7);setDateFrom(fmtDate(d));setDateTo(today);return;}
    if(preset==="30"){d.setDate(d.getDate()-30);setDateFrom(fmtDate(d));setDateTo(today);return;}
    if(preset==="90"){d.setDate(d.getDate()-90);setDateFrom(fmtDate(d));setDateTo(today);return;}
  };

  const filteredByDate=React.useMemo(()=>posts.filter(p=>{
    if(dateFrom&&p.datetime.slice(0,10)<dateFrom)return false;
    if(dateTo&&p.datetime.slice(0,10)>dateTo)return false;
    return true;
  }),[posts,dateFrom,dateTo]);

  const aiPreview=React.useMemo(()=>postsToAIContext(
    filteredByDate,accountName,{scores,postTypes,includeBody,includeMemo,includeLinks,prompt}
  ),[filteredByDate,accountName,scores,postTypes,includeBody,includeMemo,includeLinks,prompt]);

  const targetCount=filteredByDate.filter(p=>{
    const scoreOk=scores.length===0||scores.includes(p.score);
    const typeOk=postTypes.length===0||postTypes.includes(p.postType||"x_post");
    return scoreOk&&typeOk;
  }).length;

  const filePosts=React.useMemo(()=>scope==="all"?posts:posts.filter(p=>p.status===statusFilter),[posts,scope,statusFilter]);

  const handleCopy=()=>{
    navigator.clipboard.writeText(aiPreview).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),3000);});
  };

  const handleDownloadAI=()=>{
    const blob=new Blob([aiPreview],{type:"text/markdown;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`${sanitizeFilename(accountName)}_ai_context.md`;a.click();URL.revokeObjectURL(url);
  };

  const handleDownloadCSV=()=>{
    const csv=postsToCSV(posts,allPostTypes);
    const bom="\uFEFF"; // Excel対応BOM
    const blob=new Blob([bom+csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`${sanitizeFilename(accountName)}_export.csv`;a.click();URL.revokeObjectURL(url);
  };

  const pickFolder=async()=>{
    try{const h=await window.showDirectoryPicker({mode:"readwrite"});setFolderHandle(h);}
    catch(e){if(e.name!=="AbortError")alert("フォルダの取得に失敗しました: "+e.message);}
  };

  const runExport=async()=>{
    setProgress({done:0,total:filePosts.length,errors:[]});setDone(false);
    if(FS_SUPPORTED&&folderHandle){
      const errors=[];
      for(let i=0;i<filePosts.length;i++){
        const p=filePosts[i];
        try{
          const name=`${p.datetime.slice(0,10)}_${sanitizeFilename(p.title)}.${format}`;
          const content=format==="md"?postToMarkdown(p):JSON.stringify(p,null,2);
          const fh=await folderHandle.getFileHandle(name,{create:true});
          const w=await fh.createWritable();await w.write(content);await w.close();
        }catch(e){errors.push(p.title||"(無題)");}
        setProgress({done:i+1,total:filePosts.length,errors});
      }
    }else{
      const content=format==="md"
        ?filePosts.map(p=>`${"=".repeat(60)}\n${postToMarkdown(p)}`).join("\n\n")
        :JSON.stringify(filePosts,null,2);
      const blob=new Blob([content],{type:"text/plain;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;
      a.download=`${sanitizeFilename(accountName)}_export.${format==="md"?"txt":"json"}`;
      a.click();URL.revokeObjectURL(url);
      setProgress({done:filePosts.length,total:filePosts.length,errors:[]});
    }
    setDone(true);
  };

  const chipBtn=(label,active,onClick,color)=>(
    <button onClick={onClick}
      style={{padding:"2px 9px",borderRadius:99,border:`1.5px solid ${active?(color||"#111"):"#e0d8ce"}`,background:active?(color||"#111"):"#fff",color:active?"#fff":"#555",fontSize:10.5,fontWeight:active?700:500,cursor:"pointer",whiteSpace:"nowrap",transition:"all .12s"}}>
      {label}
    </button>
  );

  const TABS=[["ai","AI出力"],["file","ファイル保存"],["csv","CSV"]];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:tab==="ai"?860:500,maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.15)",border:BD2,transition:"max-width .2s"}}>

        {/* ヘッダー */}
        <div style={{padding:"14px 20px 0",borderBottom:BD2,flexShrink:0}}>
          <div style={{...S.rowB,marginBottom:12}}>
            <div style={{fontWeight:800,fontSize:15,letterSpacing:"-.3px"}}>エクスポート</div>
            <Btn onClick={onClose}>閉じる</Btn>
          </div>
          {/* タブ */}
          <div style={{...S.row,gap:0}}>
            {TABS.map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{padding:"7px 18px",border:"none",background:"none",borderBottom:`2.5px solid ${tab===id?"#f59e0b":"transparent"}`,fontSize:13,fontWeight:tab===id?700:500,color:tab===id?"#f59e0b":"#888",cursor:"pointer"}}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── AI出力タブ ── */}
        {tab==="ai"&&(
          <div style={{flex:1,display:"flex",overflow:"hidden"}}>
            {/* 左：フィルター */}
            <div style={{width:260,borderRight:BD2,padding:16,...S.col,gap:14,overflowY:"auto",flexShrink:0}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>期間</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                  {[["all","全期間"],["7","7日"],["30","30日"],["90","90日"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setPreset(v)}
                      style={{padding:"3px 9px",borderRadius:99,border:`1.5px solid ${v==="all"?(!dateFrom?"#111":"#e0d8ce"):dateFrom===fmtDate(new Date(new Date().setDate(new Date().getDate()-Number(v))))?"#111":"#e0d8ce"}`,background:v==="all"?(!dateFrom?"#111":"#fff"):dateFrom===fmtDate(new Date(new Date().setDate(new Date().getDate()-Number(v))))?"#111":"#fff",color:v==="all"?(!dateFrom?"#fff":"#555"):dateFrom===fmtDate(new Date(new Date().setDate(new Date().getDate()-Number(v))))?"#fff":"#555",fontSize:11,fontWeight:500,cursor:"pointer",transition:"all .12s"}}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{...S.row,gap:6}}>
                  <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                    style={{flex:1,border:BD,borderRadius:7,padding:"5px 7px",fontSize:11,outline:"none",color:"#333"}}/>
                  <span style={{fontSize:11,color:"#aaa"}}>〜</span>
                  <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                    style={{flex:1,border:BD,borderRadius:7,padding:"5px 7px",fontSize:11,outline:"none",color:"#333"}}/>
                </div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>スコア</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {chipBtn("全て",scores.length===0,()=>setScores([]))}
                  {Object.entries(SCORE).map(([k,v])=>chipBtn(k,scores.includes(k),()=>toggle(scores,setScores,k),v.bg))}
                </div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>投稿種類</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {chipBtn("全て",postTypes.length===0,()=>setPostTypes([]))}
                  {Object.entries(allPostTypes).map(([k,v])=>chipBtn(v.label,postTypes.includes(k),()=>toggle(postTypes,setPostTypes,k),v.color))}
                </div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>含める情報</div>
                <div style={{...S.col,gap:6}}>
                  {[["本文（長くなります）",includeBody,setIncludeBody],["メモ",includeMemo,setIncludeMemo],["リンク",includeLinks,setIncludeLinks]].map(([label,val,setter])=>(
                    <label key={label} style={{...S.row,gap:8,cursor:"pointer",fontSize:12,color:"#444"}}>
                      <input type="checkbox" checked={val} onChange={e=>setter(e.target.checked)} style={{accentColor:"#111",width:14,height:14}}/>
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>依頼文（任意）</div>
                <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
                  placeholder={"例：Sランク記事を参考に来週の投稿アイデアを5つ提案して"}
                  rows={4}
                  style={{width:"100%",border:BD,borderRadius:8,padding:"8px 10px",fontSize:11.5,outline:"none",resize:"vertical",lineHeight:1.6,boxSizing:"border-box",color:"#333"}}/>
              </div>
              <div style={{background:"#f5f0eb",borderRadius:8,padding:"8px 12px",fontSize:11.5,color:"#555"}}>
                対象: <strong>{targetCount}件</strong>
              </div>
              <div style={{...S.col,gap:6}}>
                <button onClick={handleCopy}
                  style={{background:copied?"#10b981":"#111",border:"none",borderRadius:9,padding:"10px 0",fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer",transition:"background .15s"}}>
                  {copied?"✓ コピーしました":"クリップボードにコピー"}
                </button>
                <button onClick={handleDownloadAI}
                  style={{background:"#fff",border:BD,borderRadius:9,padding:"9px 0",fontSize:13,fontWeight:600,color:"#333",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f5f0eb"}
                  onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                  MDファイルでダウンロード
                </button>
              </div>
            </div>
            {/* 右：プレビュー */}
            <div style={{flex:1,...S.col,overflow:"hidden"}}>
              <div style={{padding:"10px 16px",borderBottom:BD2,fontSize:11,color:"#a8a09a",fontWeight:600,flexShrink:0}}>プレビュー</div>
              <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
                <pre style={{fontSize:11.5,lineHeight:1.7,color:"#333",whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0}}>{aiPreview}</pre>
              </div>
            </div>
          </div>
        )}

        {/* ── ファイル保存タブ ── */}
        {tab==="file"&&(
          <div style={{flex:1,overflowY:"auto",padding:20,...S.col,gap:16}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>ファイル形式</div>
              <div style={{display:"flex",gap:6}}>
                {[["md","Markdown (.md)"],["json","JSON (.json)"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setFormat(v)}
                    style={{flex:1,border:`1.5px solid ${format===v?"#f59e0b":"#e0d8ce"}`,borderRadius:9,padding:"10px 0",background:format===v?"#fef3c7":"#fff",color:format===v?"#d97706":"#555",fontWeight:format===v?700:500,fontSize:12,cursor:"pointer"}}>
                    {l}
                  </button>
                ))}
              </div>
              {format==="md"&&<div style={{fontSize:10,color:"#aaa",marginTop:5}}>frontmatter付き。タイトル・本文・ステータス・リンクを含む</div>}
              {format==="json"&&<div style={{fontSize:10,color:"#aaa",marginTop:5}}>全フィールド保存。バックアップ向け</div>}
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>対象</div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                {[["all","すべて"],["filter","ステータス絞り込み"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setScope(v)}
                    style={{flex:1,border:`1.5px solid ${scope===v?"#f59e0b":"#e0d8ce"}`,borderRadius:9,padding:"8px 0",background:scope===v?"#fef3c7":"#fff",color:scope===v?"#d97706":"#555",fontWeight:scope===v?700:500,fontSize:12,cursor:"pointer"}}>
                    {l}
                  </button>
                ))}
              </div>
              {scope==="filter"&&(
                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                  style={{width:"100%",border:BD,borderRadius:8,padding:"7px 10px",fontSize:12,color:"#555",outline:"none",cursor:"pointer",background:"#fff"}}>
                  {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              )}
              <div style={{fontSize:11,color:"#555",marginTop:6,background:"#f8f5f1",border:BD2,borderRadius:7,padding:"6px 10px"}}>
                対象: <strong>{filePosts.length}件</strong>
              </div>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7}}>保存先フォルダ</div>
              {FS_SUPPORTED?(
                <div style={{...S.row,gap:8}}>
                  <button onClick={pickFolder}
                    style={{flex:1,border:`1.5px solid ${folderHandle?"#10b981":"#e0d8ce"}`,borderRadius:9,padding:"10px 14px",background:folderHandle?"#d1fae5":"#fff",color:folderHandle?"#059669":"#555",fontSize:12,fontWeight:600,cursor:"pointer",textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {folderHandle?`📁 ${folderHandle.name}`:"📁 フォルダを選択…"}
                  </button>
                  {folderHandle&&<button onClick={()=>setFolderHandle(null)} style={{border:"none",background:"none",color:"#aaa",cursor:"pointer",fontSize:16,padding:"4px"}}>×</button>}
                </div>
              ):(
                <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 12px",fontSize:11,color:"#92400e",lineHeight:1.6}}>
                  このブラウザはフォルダ選択非対応。<br/>全件をひとつのファイルでダウンロードします。
                </div>
              )}
            </div>
            {progress&&(
              <div style={{background:"#f8f5f1",border:BD2,borderRadius:9,padding:"12px 14px"}}>
                <div style={{...S.rowB,fontSize:12,fontWeight:700,marginBottom:6,color:done?"#059669":"#555"}}>
                  <span>{done?"✅ 完了":"⏳ 書き出し中…"}</span>
                  <span>{progress.done} / {progress.total}</span>
                </div>
                <div style={{height:6,background:"#e6dfd6",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",background:done?"#10b981":"#f59e0b",borderRadius:3,width:`${(progress.done/progress.total)*100}%`,transition:"width .2s"}}/>
                </div>
                {progress.errors.length>0&&<div style={{marginTop:8,fontSize:10,color:"#ef4444"}}>失敗: {progress.errors.join(", ")}</div>}
              </div>
            )}
            <button onClick={runExport}
              disabled={FS_SUPPORTED&&!folderHandle||filePosts.length===0||!!progress&&!done}
              style={{background:(FS_SUPPORTED&&!folderHandle)||filePosts.length===0?"#d1d5db":"#f59e0b",border:"none",borderRadius:9,padding:"11px 0",fontSize:13,fontWeight:800,color:"#fff",cursor:(FS_SUPPORTED&&!folderHandle)||filePosts.length===0?"default":"pointer",transition:"background .15s"}}>
              {done?"もう一度":"書き出す"}
            </button>
          </div>
        )}

        {/* ── CSVタブ ── */}
        {tab==="csv"&&(
          <div style={{flex:1,overflowY:"auto",padding:20,...S.col,gap:16}}>
            <div style={{background:"#f5f0eb",borderRadius:10,padding:"14px 16px",fontSize:12,color:"#555",lineHeight:1.8}}>
              <div style={{fontWeight:700,marginBottom:6,color:"#333"}}>出力フィールド</div>
              日時、タイトル、ステータス、種類、スコア、ラベル、メモ、リンク、文字数
            </div>
            <div style={{background:"#f5f0eb",borderRadius:8,padding:"8px 12px",fontSize:11.5,color:"#555"}}>
              対象: <strong>{posts.length}件</strong>（全件）
            </div>
            <div style={{fontSize:11,color:"#aaa",lineHeight:1.7}}>
              Excelで開く場合はUTF-8 BOM付きで出力するので文字化けしません。
            </div>
            <button onClick={handleDownloadCSV}
              style={{background:"#111",border:"none",borderRadius:9,padding:"12px 0",fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer"}}>
              CSVをダウンロード
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
