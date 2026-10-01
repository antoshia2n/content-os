import React, {useState,useEffect,useMemo,useRef} from 'react';
import {STATUS,POST_TYPE,fmtDate,genId} from '../constants.js';
import {dbFetchSheetRows,dbCountSheetGroup,dbFetchSheetGenres,dbAddSheetGenre,dbRemoveSheetGenre,dbSaveSheetRow,dbAddSheetIdea,sheetGroupConditions} from '../lib/supabase.js';

// 個人の本文・タイトル・ID は記録しない。直近50回を1操作で取り出せる。
function recordSheetEvent(event) {
  const entry = {at:new Date().toISOString(),...event};
  console.info('[ContentOS sheet]',entry);
  try {
    const old = JSON.parse(localStorage.getItem('contentos.sheet.events')||'[]');
    localStorage.setItem('contentos.sheet.events',JSON.stringify([...old,entry].slice(-50)));
  } catch { /* 開発者ツールの記録は残る */ }
}
export function sheetDatePatch(row,datetime) {
  let status=row.status;
  if (datetime && status==='idea') status='draft';
  else if (datetime && status==='waiting') status='reserved';
  else if (!datetime && status==='reserved') status='waiting';
  return {datetime:datetime||null,status};
}
function CellText({value,onSave,label}) {
  const [draft,setDraft]=useState(value||'');
  useEffect(()=>setDraft(value||''),[value]);
  return <input aria-label={label} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==(value||''))onSave(draft);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setDraft(value||'');e.currentTarget.blur();}}}/>;
}
function TitleCell({row,onEdit,onSave}) {
  const [editing,setEditing]=useState(false);
  return <div style={{display:'flex',alignItems:'center',gap:4}}>{editing?<CellText value={row.title} label="タイトル" onSave={v=>{onSave(v);setEditing(false);}}/>:<button style={{border:0,padding:0,background:'transparent',textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:190}} onClick={()=>onEdit(row.id)}>{row.title||'（タイトルなし）'}</button>}<button aria-label="タイトルをその場で書き換える" onClick={()=>setEditing(!editing)}>✎</button></div>;
}
export function SheetView({uid,accountIds,targetAccId,postTypes=POST_TYPE,revision,onChanged,onEdit}) {
  const [tab,setTab]=useState('schedule'),[month,setMonth]=useState(()=>fmtDate(new Date()).slice(0,7));
  const [groupBy,setGroupBy]=useState('week'),[status,setStatus]=useState('all'),[search,setSearch]=useState(''),[query,setQuery]=useState('');
  const [genres,setGenres]=useState([]),[groups,setGroups]=useState([]),[rows,setRows]=useState([]),[expanded,setExpanded]=useState({}),[groupRows,setGroupRows]=useState({});
  const [busy,setBusy]=useState(true),[loadFailed,setLoadFailed]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[newGenre,setNewGenre]=useState(''),[saving,setSaving]=useState({});
  const [adding,setAdding]=useState(false),[showGenres,setShowGenres]=useState(false),[diagnostic,setDiagnostic]=useState(null);
  const epoch=useRef(0),pending=useRef(new Set()),lastScope=useRef(null),expandedRef=useRef({});
  expandedRef.current=expanded;
  const ids=JSON.stringify(accountIds.filter(Boolean));
  const options=useMemo(()=>({uid,accountIds:JSON.parse(ids),tab,month,status,search:query}),[uid,ids,tab,month,status,query]);
  const seminar=Object.keys(POST_TYPE).filter(k=>/セミナー|seminar/i.test(k+' '+POST_TYPE[k].label));
  useEffect(()=>{const t=setTimeout(()=>setQuery(search.trim()),200);return()=>clearTimeout(t);},[search]);
  useEffect(()=>{
    const token=++epoch.current,started=performance.now();let cancelled=false;
    setBusy(true);setLoadFailed(false);setError('');
    const scope=JSON.stringify([options,groupBy]);
    const keep=lastScope.current===scope?expandedRef.current:{};
    lastScope.current=scope;setExpanded(keep);setGroupRows({});setGroups([]);setRows([]);
    (async()=>{
      const gs=await dbFetchSheetGenres(uid);
      if(cancelled)return;setGenres(gs);
      let count;
      if(!options.accountIds.length){count=0;}
      else if(tab==='schedule') {
        const data=await dbFetchSheetRows(options);if(cancelled)return;setRows(data);count=data.length;
      } else {
        const field=groupBy==='genre'?'genre':groupBy==='type'?'post_type':'status';
        const values=field==='genre'?gs.map(g=>g.name):field==='post_type'?Object.keys(postTypes):['idea','waiting'];
        const definitions=sheetGroupConditions(field,values);
        const result=await Promise.all(definitions.map(async g=>({...g,count:await dbCountSheetGroup({...options,condition:g.condition}),label:g.key==='__empty__'?'未設定':g.key==='__other__'?'未登録':field==='post_type'?(postTypes[g.key]?.label||g.key):field==='status'?STATUS[g.key]?.label:g.key})));
        if(cancelled)return;setGroups(result.filter(g=>g.count>0));count=result.reduce((n,g)=>n+g.count,0);
        const opened=await Promise.all(result.filter(g=>keep[g.key]&&g.count>0).map(async g=>[g.key,await dbFetchSheetRows({...options,condition:g.condition})]));
        if(cancelled)return;setGroupRows(Object.fromEntries(opened));
      }
      if(cancelled)return;setBusy(false);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(cancelled||token!==epoch.current)return;
        const ms=Math.round(performance.now()-started);
        const event={operation:tab==='schedule'?'month':'idea-counts',month:tab==='schedule'?month:null,groupBy,count,ms,ok:true};
        recordSheetEvent(event);setDiagnostic(event);
        if(ms>2000)setError(`表示時間が2秒を超えました（${ms}ms）。測定結果を開発部へ共有してください。`);
      }));
    })().catch(e=>{if(cancelled)return;setBusy(false);setLoadFailed(true);setError(e.message||String(e));recordSheetEvent({operation:'load',ok:false,code:e.code||'LOAD_ERROR'});});
    return()=>{cancelled=true;};
  },[options,groupBy,reload,revision,postTypes]);
  const scheduleGroups=useMemo(()=>{
    const map=new Map();
    rows.forEach(row=>{
      let key,label;
      if(groupBy==='week') {
        const date=new Date(row.datetime.slice(0,10)+'T12:00:00');date.setDate(date.getDate()-((date.getDay()+6)%7));key=fmtDate(date);label=key+' の週';
      } else if(groupBy==='genre'){key=row.genre||'__empty__';label=row.genre||'未設定';}
      else {key=row.post_type;label=postTypes[key]?.label||key;}
      if(!map.has(key))map.set(key,{key,label,rows:[]});map.get(key).rows.push(row);
    });
    return [...map.values()];
  },[rows,groupBy,postTypes]);
  async function toggle(group) {
    if(tab==='schedule'){setExpanded(x=>({...x,[group.key]:x[group.key]===false}));return;}
    if(expanded[group.key]){setExpanded(x=>({...x,[group.key]:false}));return;}
    setExpanded(x=>({...x,[group.key]:true}));
    if(groupRows[group.key])return;
    const token=epoch.current;
    try {
      const data=await dbFetchSheetRows({...options,condition:group.condition});
      if(token===epoch.current)setGroupRows(x=>({...x,[group.key]:data}));
      recordSheetEvent({operation:'expand',count:data.length,ok:true});
    }catch(e){if(token===epoch.current){setError(e.message||String(e));setExpanded(x=>({...x,[group.key]:false}));}recordSheetEvent({operation:'expand',ok:false,code:e.code||'LOAD_ERROR'});}
  }
  async function update(row,fields) {
    if(pending.current.has(row.id))return;
    const token=epoch.current;pending.current.add(row.id);setSaving(x=>({...x,[row.id]:true}));setError('');
    try {const saved=await dbSaveSheetRow(uid,row.id,fields);onChanged(saved);if(token===epoch.current)setReload(x=>x+1);recordSheetEvent({operation:'update',count:1,ok:true});}
    catch(e){setError(e.message||String(e));recordSheetEvent({operation:'update',ok:false,code:e.code||'SAVE_ERROR'});}
    finally{pending.current.delete(row.id);setSaving(x=>({...x,[row.id]:false}));}
  }
  async function addIdea() {
    if(!targetAccId||adding)return;setAdding(true);setError('');
    try {const row=await dbAddSheetIdea(uid,targetAccId,genId());onChanged(row);setTab('ideas');setGroupBy('genre');setSearch('');setQuery('');setReload(x=>x+1);recordSheetEvent({operation:'add-idea',count:1,ok:true});}
    catch(e){setError(e.message||String(e));}finally{setAdding(false);}
  }
  async function addGenre(e){e.preventDefault();if(!newGenre.trim())return;try{await dbAddSheetGenre(uid,newGenre.trim(),genres.length);setNewGenre('');setReload(x=>x+1);}catch(err){setError(err.message||String(err));}}
  async function removeGenre(g){try{await dbRemoveSheetGenre(uid,g.id);setReload(x=>x+1);}catch(e){setError(e.message||String(e));}}
  function moveMonth(n){const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+n);setMonth(fmtDate(d).slice(0,7));}
  function changeTab(next){setTab(next);setGroupBy(next==='ideas'?'genre':'week');}
  function renderRow(row) {
    const st=STATUS[row.status]||STATUS.draft;
    return <tr key={row.id} data-sheet-row={row.id}>
      <td><input aria-label="予定日" type="datetime-local" disabled={saving[row.id]} value={(row.datetime||'').slice(0,16)} onChange={e=>update(row,sheetDatePatch(row,e.target.value))}/></td>
      <td><select aria-label="状態" disabled={saving[row.id]} style={{color:st.text,background:st.chip}} value={row.status} onChange={e=>update(row,{status:e.target.value==='idea'&&row.datetime?'draft':e.target.value})}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></td>
      <td><select aria-label="投稿タイプ" disabled={saving[row.id]} value={row.post_type} onChange={e=>update(row,{post_type:e.target.value})}>{!postTypes[row.post_type]&&<option value={row.post_type}>{row.post_type}</option>}{Object.entries(postTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></td>
      <td><select aria-label="ジャンル" disabled={saving[row.id]} value={row.genre||''} onChange={e=>update(row,{genre:e.target.value||null})}><option value="">未設定</option>{row.genre&&!genres.some(g=>g.name===row.genre)&&<option value={row.genre}>{row.genre}（未登録）</option>}{genres.map(g=><option key={g.id} value={g.name}>{g.name}</option>)}</select></td>
      <td><CellText value={row.theme} label="テーマ" onSave={v=>update(row,{theme:v})}/></td>
      <td><TitleCell row={row} onEdit={onEdit} onSave={v=>update(row,{title:v})}/></td>
      <td><CellText value={row.mm_url} label="MMの住所" onSave={v=>update(row,{mm_url:v})}/></td>
      <td>{[row.status!=='idea'&&row.datetime?'シート':null,row.manabu?'学ぶくん':null].filter(Boolean).join('・')}</td>
      <td>{(!seminar.length||seminar.includes(row.post_type))&&<input aria-label="学ぶくん" type="checkbox" checked={!!row.manabu} disabled={saving[row.id]} onChange={e=>update(row,{manabu:e.target.checked})}/>}</td>
    </tr>;
  }
  const visibleGroups=tab==='schedule'?scheduleGroups:groups;
  return <section className="content-sheet" aria-label="シート" style={{padding:'20px 28px'}}>
    <style>{`.content-sheet{font-size:12px}.content-sheet button,.content-sheet select{cursor:pointer;font-family:inherit}.content-sheet button{border:1px solid #e6dfd6;border-radius:6px;background:#fff;padding:5px 10px;color:#57534e}.content-sheet input,.content-sheet select{font:inherit;color:inherit}.content-sheet table{border-collapse:collapse;width:100%;min-width:1230px;background:#fff}.content-sheet th{padding:8px;text-align:left;background:#f5f0eb;color:#78716c;font-weight:500}.content-sheet td{height:34px;padding:0 8px;border-bottom:1px solid #f1ede8;max-width:240px}.content-sheet td input:not([type=checkbox]),.content-sheet td select{border:0;outline:none;background:transparent;width:100%;min-width:60px;padding:4px 0}.content-sheet td input:focus{box-shadow:0 1px #f59e0b}.content-sheet td input[type=checkbox]{accent-color:#f59e0b}.content-sheet .group-button{width:100%;text-align:left;border-radius:0;border:0;padding:8px 12px;background:#faf7f2;font-weight:600}.content-sheet tbody tr:hover{background:#fffbeb}.content-sheet select:disabled{cursor:wait;opacity:.6}`}</style>
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:14}}>
      {['schedule','ideas'].map(t=><button key={t} onClick={()=>changeTab(t)} style={{background:tab===t?'#ffedd5':'#fff',fontWeight:700}}>{t==='schedule'?'予定':'ネタ帳'}</button>)}
      {tab==='schedule'&&<><button aria-label="前の月" onClick={()=>moveMonth(-1)}>←</button><strong>{month.replace('-','年')}月</strong><button aria-label="次の月" onClick={()=>moveMonth(1)}>→</button></>}
      <select aria-label="まとめ方" value={groupBy} onChange={e=>setGroupBy(e.target.value)}>{(tab==='schedule'?[['week','週ごと'],['genre','ジャンルごと'],['type','投稿タイプごと']]:[['genre','ジャンルごと'],['type','投稿タイプごと'],['status','状態ごと']]).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      {tab==='schedule'&&<select aria-label="状態で絞る" value={status} onChange={e=>setStatus(e.target.value)}>{[['all','すべて'],['draft','下書き'],['review','レビュー待ち'],['reserved','予約済み'],['published','公開済']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}
      <input aria-label="テーマとタイトルで探す" placeholder="テーマ・タイトルで探す" value={search} onChange={e=>setSearch(e.target.value)} style={{padding:6,border:'1px solid #e6dfd6',borderRadius:6}}/>
      <button disabled={!targetAccId||adding} onClick={addIdea}>＋ アイデアを追加</button><button onClick={()=>setShowGenres(!showGenres)}>ジャンルを管理</button>
    </div>
    {showGenres&&<div style={{background:'#fff',padding:12,marginBottom:12,borderRadius:8}}><form onSubmit={addGenre}><input aria-label="新しいジャンル" value={newGenre} onChange={e=>setNewGenre(e.target.value)} placeholder="新しいジャンル"/><button>追加</button></form><div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>{genres.map(g=><span key={g.id}>{g.name} <button aria-label={`${g.name}を選択肢から外す`} onClick={()=>removeGenre(g)}>外す</button></span>)}</div></div>}
    {error&&<div role="alert" style={{color:'#b91c1c',padding:12,background:'#fef2f2',marginBottom:10}}>{error} <button onClick={()=>setReload(x=>x+1)}>再読み込み</button></div>}
    {busy?<p role="status">読み込み中…</p>:loadFailed?<p>読み込みに失敗しました。再読み込みしてください。</p>:<div style={{overflowX:'auto'}}><table data-sheet-ready="true"><thead><tr>{['予定日','状態','投稿タイプ','ジャンル','テーマ','タイトル','MM','流れる先','学ぶくん'].map(c=><th key={c}>{c}</th>)}</tr></thead>{visibleGroups.map(g=>{const open=tab==='schedule'?expanded[g.key]!==false:!!expanded[g.key];const data=tab==='schedule'?g.rows:groupRows[g.key];return <tbody key={g.key}><tr><td colSpan={9}><button className="group-button" aria-expanded={open} onClick={()=>toggle(g)}>{open?'▾':'▸'} {g.label} <span style={{color:'#a8a29e',marginLeft:8}}>{tab==='schedule'?g.rows.length:g.count}件</span></button></td></tr>{open&&(data?data.map(renderRow):<tr><td colSpan={9}>読み込み中…</td></tr>)}</tbody>;})}{visibleGroups.length===0&&<tbody><tr><td colSpan={9} style={{padding:20,color:'#a8a29e'}}>該当する行はありません</td></tr></tbody>}</table></div>}
    {diagnostic&&<div style={{marginTop:10,color:'#a8a29e',display:'flex',gap:12,alignItems:'center'}}><span>{diagnostic.count}件 · {diagnostic.ms}ms</span><button onClick={()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([localStorage.getItem('contentos.sheet.events')||'[]'],{type:'application/json'}));a.href=url;a.download='contentos-sheet-events.json';a.click();URL.revokeObjectURL(url);}}>診断記録を保存</button></div>}
  </section>;
}
