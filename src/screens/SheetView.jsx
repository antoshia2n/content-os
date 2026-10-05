import React, {useState,useEffect,useMemo,useRef} from 'react';
import {STATUS,POST_TYPE,getPostTypeStyle,BD,BD2,fmtDate,genId} from '../constants.js';
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
function CellText({value,onSave,label,placeholder,disabled,type='text',className='',children}) {
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(value||'');
  const cancelled=useRef(false);
  useEffect(()=>setDraft(value||''),[value]);
  function finish(){setEditing(false);if(!cancelled.current&&draft!==(value||''))onSave(draft);}
  return editing?<input autoFocus className={`cell-input ${className}`} aria-label={label} type={type} disabled={disabled} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={finish} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){cancelled.current=true;setDraft(value||'');e.currentTarget.blur();}}}/>:<button className={`cell-text ${className} ${value?'':'cell-empty'}`} aria-label={`${label}を書き換える`} disabled={disabled} onClick={()=>{cancelled.current=false;setDraft(value||'');setEditing(true);}}>{children||value||placeholder}</button>;
}
function CellSelect({value,label,disabled,onSave,style,children,options}) {
  const [editing,setEditing]=useState(false);
  return editing?<select autoFocus className="cell-input" aria-label={label} disabled={disabled} value={value} onBlur={()=>setEditing(false)} onKeyDown={e=>{if(e.key==='Escape')setEditing(false);}} onChange={e=>{onSave(e.target.value);setEditing(false);}}>{options}</select>:<button className="sheet-pill" aria-label={`${label}を選ぶ`} disabled={disabled} style={style} onClick={()=>setEditing(true)}>{children}</button>;
}
function TitleCell({row,onEdit,onDelete,onSave,disabled}) {
  return <div className="title-cell"><CellText value={row.title} label="タイトル" placeholder="（タイトルなし）" className="title-text" disabled={disabled} onSave={onSave}/><button className="row-edit" onClick={()=>onEdit(row.id)}>編集</button>{onDelete&&<button className="row-delete" aria-label="この行を削除する" disabled={disabled} onClick={()=>onDelete(row)}>削除</button>}</div>;
}
function datePresentation(value) {
  if(!value)return {label:'日付を入れる',color:'#b8afa5'};
  const date=new Date(value.slice(0,10)+'T12:00:00'),day=date.getDay();
  return {label:`${date.getMonth()+1}/${date.getDate()} ${['日','月','火','水','木','金','土'][day]} ${value.slice(11,16)}`,color:value.slice(0,10)===fmtDate(new Date())?'#f59e0b':day===0||day===6?'#ef4444':'#555'};
}
function weekPresentation(key) {
  const start=new Date(key+'T12:00:00'),end=new Date(start),today=new Date();
  end.setDate(end.getDate()+6);today.setDate(today.getDate()-((today.getDay()+6)%7));
  return {label:`${start.getMonth()+1}/${start.getDate()} 〜 ${end.getMonth()+1}/${end.getDate()}`,current:key===fmtDate(today)};
}
export function SheetView({uid,accountIds,targetAccId,postTypes=POST_TYPE,revision,onChanged,onEdit,onDelete}) {
  const [tab,setTab]=useState('schedule'),[month,setMonth]=useState(()=>fmtDate(new Date()).slice(0,7));
  const [groupBy,setGroupBy]=useState('week'),[status,setStatus]=useState('all'),[search,setSearch]=useState(''),[query,setQuery]=useState('');
  const [genres,setGenres]=useState([]),[groups,setGroups]=useState([]),[rows,setRows]=useState([]),[expanded,setExpanded]=useState({}),[groupRows,setGroupRows]=useState({});
  const [busy,setBusy]=useState(true),[loadFailed,setLoadFailed]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[newGenre,setNewGenre]=useState(''),[saving,setSaving]=useState({});
  const [adding,setAdding]=useState(false),[showGenres,setShowGenres]=useState(false),[diagnostic,setDiagnostic]=useState(null);
  const [tabCounts,setTabCounts]=useState({});
  useEffect(()=>{if(diagnostic)setTabCounts(x=>({...x,[diagnostic.operation==='month'?'schedule':'ideas']:diagnostic.count}));},[diagnostic]);
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
    const st=STATUS[row.status]||STATUS.draft,pt=getPostTypeStyle(row.post_type,postTypes),date=datePresentation(row.datetime),disabled=!!saving[row.id];
    return <tr key={row.id} data-sheet-row={row.id} style={{'--type-color':pt.color}}>
      <td style={{color:date.color}}><CellText value={(row.datetime||'').slice(0,16)} label="予定日" type="datetime-local" disabled={disabled} onSave={v=>update(row,sheetDatePatch(row,v))}>{date.label}</CellText></td>
      <td><select className="status-select" aria-label="状態" disabled={disabled} style={{color:st.text,background:st.chip,border:`1px solid ${st.border}`}} value={row.status} onChange={e=>update(row,{status:e.target.value==='idea'&&row.datetime?'draft':e.target.value})}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></td>
      <td><CellSelect label="投稿タイプ" disabled={disabled} value={row.post_type} style={{color:pt.color,background:pt.bg,border:`1px solid ${pt.border}`}} onSave={v=>update(row,{post_type:v})} options={<>{!postTypes[row.post_type]&&<option value={row.post_type}>{row.post_type}</option>}{Object.entries(postTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</>}>{postTypes[row.post_type]?.label||row.post_type||pt.label}</CellSelect></td>
      <td><CellSelect label="ジャンル" disabled={disabled} value={row.genre||''} style={{background:row.genre?'#f5f0eb':'transparent',color:row.genre?'#555':'#b8afa5',border:row.genre?'1px solid transparent':BD2}} onSave={v=>update(row,{genre:v||null})} options={<><option value="">＋ ジャンル</option>{row.genre&&!genres.some(g=>g.name===row.genre)&&<option value={row.genre}>{row.genre}（未登録）</option>}{genres.map(g=><option key={g.id} value={g.name}>{g.name}</option>)}</>}>{row.genre||'＋ ジャンル'}</CellSelect></td>
      <td className="theme-cell"><CellText value={row.theme} label="テーマ" placeholder="テーマ" disabled={disabled} onSave={v=>update(row,{theme:v})}/></td>
      <td><TitleCell row={row} disabled={disabled} onEdit={onEdit} onDelete={onDelete} onSave={v=>update(row,{title:v})}/></td>
      <td><div className="mm-cell">{row.mm_url&&<a className="sheet-pill mm-pill" href={row.mm_url} target="_blank" rel="noopener noreferrer">MM</a>}<CellText value={row.mm_url} label="MMの住所" placeholder="＋" className={row.mm_url?'mm-edit':'mm-add'} disabled={disabled} onSave={v=>update(row,{mm_url:v})}>{row.mm_url?'変更':'＋'}</CellText></div></td>
      <td><div className="flow-cell">{row.status!=='idea'&&row.datetime&&<span className="sheet-pill sheet-flow">シート</span>}{(!seminar.length||seminar.includes(row.post_type))?<button className={`sheet-pill manabu-pill ${row.manabu?'is-on':''}`} aria-label="学ぶくん" aria-pressed={!!row.manabu} disabled={disabled} onClick={()=>update(row,{manabu:!row.manabu})}>学ぶ</button>:row.manabu&&<span className="sheet-pill manabu-pill is-on">学ぶ</span>}</div></td>
    </tr>;
  }
  const visibleGroups=tab==='schedule'?scheduleGroups:groups;
  return <section className="content-sheet" aria-label="シート" style={{padding:'20px 28px',background:'#f5f0eb'}}>
    <style>{`
      .content-sheet{font-size:12px;color:#555}
      .content-sheet button,.content-sheet input,.content-sheet select{font:inherit;color:inherit}
      .content-sheet button,.content-sheet select{cursor:pointer}
      .content-sheet button{border:${BD2};border-radius:7px;background:#fff;padding:5px 10px}
      .content-sheet button:disabled,.content-sheet input:disabled,.content-sheet select:disabled{cursor:wait;opacity:.6}
      .content-sheet button:focus-visible,.content-sheet a:focus-visible{outline:2px solid #f59e0b;outline-offset:2px}
      .content-sheet .sheet-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
      .content-sheet .sheet-tabs{display:flex;gap:1px;background:#f5f0eb;border:${BD2};border-radius:8px;padding:2px}
      .content-sheet .sheet-tabs button{border:0;background:transparent;border-radius:6px;padding:4px 10px;font-size:11.5px;font-weight:600;color:#a8a09a;white-space:nowrap}
      .content-sheet .sheet-tabs button[aria-pressed=true]{background:#fff;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.08)}
      .content-sheet .tab-count{font-size:10px;color:#a8a09a;margin-left:5px}
      .content-sheet .month-nav{display:flex;gap:5px;align-items:center}
      .content-sheet .month-nav button{border:0;background:transparent;padding:3px 6px;font-size:16px}
      .content-sheet .month-nav .this-month{font-size:11px;border:${BD2};border-radius:5px;background:#fff}
      .content-sheet .month-label{font-size:12px;font-weight:600;white-space:nowrap}
      .content-sheet .add-idea{border:0;border-radius:20px;background:#f59e0b;color:white;font-size:11px;font-weight:700;padding:6px 12px;white-space:nowrap}
      .content-sheet .sheet-filters{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .content-sheet .sheet-filters input,.content-sheet .sheet-filters select{background:#f8f4ef;border:${BD};border-radius:7px;font-size:12px;color:#666;padding:6px 9px;max-width:100%}
      .content-sheet .sheet-filters input{width:170px}
      .content-sheet .genre-toggle{border:0;background:transparent;padding:4px 0;font-size:10px;color:#a8a09a;white-space:nowrap}
      .content-sheet .sheet-table-wrap{overflow-x:auto;border:${BD2};border-radius:10px;background:#fff}
      .content-sheet table{border-collapse:collapse;table-layout:fixed;width:100%;min-width:1150px;background:#fff}
      .content-sheet th{padding:9px 10px;text-align:left;background:#faf7f3;color:#a8a09a;font-size:10px;font-weight:600;border-bottom:1px solid #f3eee8}
      .content-sheet td{height:40px;padding:0 10px;border-bottom:1px solid #f3eee8}
      .content-sheet tr[data-sheet-row]:hover{background:#fffbf5}
      .content-sheet tr[data-sheet-row] td:first-child{border-left:3px solid var(--type-color)}
      .content-sheet .cell-text{display:block;border:0;background:transparent;padding:4px 0;text-align:left;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .content-sheet .cell-empty{color:#b8afa5}
      .content-sheet .cell-input{box-sizing:border-box;width:100%;min-width:0;border:1px solid #f59e0b;border-radius:5px;padding:4px;background:#fff;outline:none}
      .content-sheet .sheet-pill{display:inline-block;border-radius:20px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap;text-decoration:none;max-width:100%;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;vertical-align:middle}
      .content-sheet .status-select{max-width:100%;border-radius:5px;font-size:10px;font-weight:700;padding:3px 5px}
      .content-sheet .status-select:focus{outline:1px solid #f59e0b}
      .content-sheet .theme-cell{font-size:11.5px;color:#666}
      .content-sheet .title-cell{display:flex;align-items:center;gap:6px;min-width:0}
      .content-sheet .title-text{font-size:12.5px;font-weight:700;min-width:0;flex:1}
      .content-sheet .row-edit{visibility:hidden;border:0;background:#f59e0b;color:#fff;border-radius:5px;padding:3px 8px;font-size:9px;font-weight:700;flex-shrink:0}
      .content-sheet .row-delete{visibility:hidden;border:1px solid #e8dfd6;background:#fff;color:#b8afa5;border-radius:5px;padding:2px 7px;font-size:9px;font-weight:700;flex-shrink:0;cursor:pointer}
      .content-sheet .row-delete:hover,.content-sheet .row-delete:focus{color:#ef4444;border-color:#fca5a5}
      .content-sheet tr[data-sheet-row]:hover .row-edit,.content-sheet tr[data-sheet-row]:focus-within .row-edit,.content-sheet .row-edit:focus,.content-sheet tr[data-sheet-row]:hover .row-delete,.content-sheet tr[data-sheet-row]:focus-within .row-delete,.content-sheet .row-delete:focus{visibility:visible}
      @media (hover:none){.content-sheet .row-edit,.content-sheet .row-delete{visibility:visible}}
      .content-sheet .mm-cell,.content-sheet .flow-cell{display:flex;align-items:center;gap:5px}
      .content-sheet .flow-cell{justify-content:flex-end}
      .content-sheet .mm-pill{color:#7c3aed;background:#ede9fe;border:1px solid #c4b5fd}
      .content-sheet .mm-edit{width:auto;font-size:9px;color:#a8a09a;text-decoration:underline}
      .content-sheet .mm-add{width:auto;border:1px dashed #d8d0c6;border-radius:20px;color:#b8afa5;padding:2px 9px}
      .content-sheet .sheet-flow{color:#2563eb;background:#dbeafe;border:1px solid #93c5fd;font-size:10px}
      .content-sheet .manabu-pill{color:#b8afa5;background:transparent;border:${BD2};font-size:10px}
      .content-sheet .manabu-pill.is-on{color:#059669;background:#d1fae5;border:1px solid #6ee7b7}
      .content-sheet .group-cell{padding:0;height:auto}
      .content-sheet .group-button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border-radius:0;border:0;border-bottom:1px solid #e6dfd6;padding:10px 12px;background:#faf7f2;font-weight:600}
      .content-sheet .group-button.current-week{border-bottom-color:#f59e0b}
      .content-sheet .week-badge{font-size:9px;color:#f59e0b;background:#fff3df;border-radius:5px;padding:2px 5px}
      .content-sheet .group-count{margin-left:auto;color:#b8afa5;font-size:10px;font-weight:400}
      .content-sheet .sheet-diagnostic{margin-top:10px;color:#b8afa5;display:flex;gap:12px;align-items:center;justify-content:flex-end;font-size:10px}
      .content-sheet .sheet-diagnostic button{font-size:10px;color:#b8afa5;border:0;background:transparent;padding:0;text-decoration:underline}
    `}</style>
    <div className="sheet-toolbar">
      <div className="sheet-tabs" aria-label="表示するシート">{['schedule','ideas'].map(t=><button key={t} aria-pressed={tab===t} onClick={()=>changeTab(t)}>{t==='schedule'?'予定':'ネタ帳'}<span className="tab-count" title="最後に読み込んだ条件での件数。未読は —">{tabCounts[t]??'—'}</span></button>)}</div>
      {tab==='schedule'&&<div className="month-nav"><button aria-label="前の月" onClick={()=>moveMonth(-1)}>‹</button><span className="month-label">{month.replace('-','年')}月</span><button aria-label="次の月" onClick={()=>moveMonth(1)}>›</button><button className="this-month" onClick={()=>setMonth(fmtDate(new Date()).slice(0,7))}>今月</button></div>}
      <button className="add-idea" disabled={!targetAccId||adding} onClick={addIdea}>＋ アイデア</button>
      <div className="sheet-filters">
        <input aria-label="テーマとタイトルで探す" placeholder="テーマ・タイトルで探す" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select aria-label="まとめ方" value={groupBy} onChange={e=>setGroupBy(e.target.value)}>{(tab==='schedule'?[['week','週ごと'],['genre','ジャンルごと'],['type','投稿タイプごと']]:[['genre','ジャンルごと'],['type','投稿タイプごと'],['status','状態ごと']]).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        {tab==='schedule'&&<select aria-label="状態で絞る" value={status} onChange={e=>setStatus(e.target.value)}>{[['all','すべてのステータス'],['draft','下書き'],['review','レビュー待ち'],['reserved','予約済み'],['published','公開済']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}
        <button className="genre-toggle" onClick={()=>setShowGenres(!showGenres)}>ジャンルを管理</button>
      </div>
    </div>
    {showGenres&&<div style={{background:'#fff',padding:12,marginBottom:12,borderRadius:8}}><form onSubmit={addGenre}><input aria-label="新しいジャンル" value={newGenre} onChange={e=>setNewGenre(e.target.value)} placeholder="新しいジャンル"/><button>追加</button></form><div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>{genres.map(g=><span key={g.id}>{g.name} <button aria-label={`${g.name}を選択肢から外す`} onClick={()=>removeGenre(g)}>外す</button></span>)}</div></div>}
    {error&&<div role="alert" style={{color:'#b91c1c',padding:12,background:'#fef2f2',marginBottom:10}}>{error} <button onClick={()=>setReload(x=>x+1)}>再読み込み</button></div>}
    {busy?<p role="status">読み込み中…</p>:loadFailed?<p>読み込みに失敗しました。再読み込みしてください。</p>:<div className="sheet-table-wrap"><table data-sheet-ready="true"><colgroup>{[170,110,125,125,110,240,100,130].map((width,i)=><col key={i} style={{width}}/>)}</colgroup><thead><tr>{['予定日','状態','投稿タイプ','ジャンル','テーマ','タイトル','MM','流れる先'].map(c=><th key={c}>{c}</th>)}</tr></thead>{visibleGroups.map(g=>{const open=tab==='schedule'?expanded[g.key]!==false:!!expanded[g.key];const data=tab==='schedule'?g.rows:groupRows[g.key];const week=tab==='schedule'&&groupBy==='week'?weekPresentation(g.key):null;return <tbody key={g.key}><tr><td className="group-cell" colSpan={8}><button className={`group-button ${week?.current?'current-week':''}`} aria-expanded={open} onClick={()=>toggle(g)}><span>{open?'▾':'▸'}</span><span>{week?.label||g.label}</span>{week?.current&&<span className="week-badge">今週</span>}<span className="group-count">{tab==='schedule'?g.rows.length:g.count}件</span></button></td></tr>{open&&(data?data.map(renderRow):<tr><td colSpan={8}>読み込み中…</td></tr>)}</tbody>;})}{visibleGroups.length===0&&<tbody><tr><td colSpan={8} style={{padding:20,color:'#a8a29e'}}>該当する行はありません</td></tr></tbody>}</table></div>}
    {diagnostic&&<div className="sheet-diagnostic"><span>{diagnostic.count}件 · {diagnostic.ms}ms</span><button onClick={()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([localStorage.getItem('contentos.sheet.events')||'[]'],{type:'application/json'}));a.href=url;a.download='contentos-sheet-events.json';a.click();URL.revokeObjectURL(url);}}>診断記録を保存</button></div>}
  </section>;
}
