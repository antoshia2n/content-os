import React from 'react';
import {STATUS,POST_TYPE,getPostTypeStyle,BD2,fmtDate} from '../constants.js';
import {CK_CSS} from './StockView.jsx';
// 2026-10-23 3便：上に「メモ／探す／今週」の 3 つ。メモは受け箱へ（⌘＋Enter）、探すは投稿・スワイプ・思考整理をまとめて。

// 2026-10-05 段 4：拡張機能のサイドパネル（幅 360px 前後）で開く細い画面。住所は /panel。
// 拡張機能は枠だけで、機能はすべてここに置く（直すたびに拡張機能を入れ直さないため）。
const WD=['日','月','火','水','木','金','土'];

export function PanelView({ws=null,posts,accounts=[],account,onAccount,postTypes=POST_TYPE,onAddIdea,onOpen,onQuick,renderFind}){
  const today=fmtDate(new Date());
  const [tab,setTabRaw]=React.useState(()=>{try{return localStorage.getItem('contentos.panel.tab')||'memo';}catch{return 'memo';}});
  const setTab=t=>{setTabRaw(t);try{localStorage.setItem('contentos.panel.tab',t);}catch{/* 覚えられなくても動く */}};
  const [cap,setCap]=React.useState('');
  const inbox=React.useMemo(()=>posts.filter(p=>p.status==='idea'&&!p.genre&&(p.postType||'x_post')==='x_post'&&!(p.labels||[]).includes('寝かせ')).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')||b.id-a.id).slice(0,8),[posts]);
  const capRef=React.useRef(null);
  const send=async()=>{const t=cap.trim();if(!t){capRef.current?.focus();return;}if(!onQuick)return;const [first,...rest]=t.split('\n');if(await onQuick({title:first.trim(),memo:rest.join('\n').trim()}))setCap('');};
  const days=React.useMemo(()=>{
    const list=[];
    for(let i=0;i<7;i++){
      const d=new Date();d.setDate(d.getDate()+i);
      list.push({key:fmtDate(d),date:d,i});
    }
    return list;
  },[today]);
  const byDay=React.useMemo(()=>{
    const m={};
    posts.forEach(p=>{
      const k=(p.datetime||'').slice(0,10);
      if(!k)return;
      (m[k]=m[k]||[]).push(p);
    });
    Object.values(m).forEach(a=>a.sort((x,y)=>x.datetime.localeCompare(y.datetime)));
    return m;
  },[posts]);
  const total=days.reduce((n,d)=>n+(byDay[d.key]||[]).length,0);

  return(
    <div className="cpanel">
      <style>{`
        .cpanel{min-height:100vh;display:flex;flex-direction:column;background:#f5f0eb;overflow-x:hidden}
        .cpanel-head{position:sticky;top:0;z-index:5;background:#fff;border-bottom:${BD2};padding:8px 12px;display:flex;flex-direction:column;gap:8px}
        .cpanel-headrow{display:flex;align-items:center;gap:8px}
        .cpanel-headrow .cpanel-tabs{flex:1}
        .cpanel-brand{font-weight:900;font-size:14px;color:#111;white-space:nowrap}
        .cpanel-add{background:#fff;border:${BD2};color:#b45309;border-radius:8px;height:32px;padding:0 10px;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;font-family:inherit}
        .cpanel-add:hover{background:#fffbeb;border-color:#fcd34d}
        .cpanel-add kbd{font-family:inherit;font-size:12px;font-weight:700;color:#736a62;border:${BD2};border-radius:4px;padding:0 4px}
        .cpanel-body{flex:1;padding:10px 10px 4px;display:flex;flex-direction:column;gap:8px}
        .cpanel-cap{display:flex;justify-content:space-between;align-items:baseline;padding:0 2px;font-size:12px;font-weight:700;color:#6b6560}
        .cpanel-cap span:last-child{font-weight:600;color:#736a62}
        .cpanel-day{background:#fff;border:${BD2};border-radius:10px;overflow:hidden}
        .cpanel-dayhead{display:flex;align-items:center;gap:6px;padding:7px 10px;font-size:12px;font-weight:800;color:#555;border-bottom:${BD2};background:#fcfaf8}
        .cpanel-day.is-empty .cpanel-dayhead{border-bottom:none}
        .cpanel-dayhead .tag{font-size:12px;font-weight:800;color:#b45309;background:#fef3c7;border-radius:99px;padding:1px 7px}
        .cpanel-dayhead .n{margin-left:auto;font-size:12px;font-weight:600;color:#736a62}
        .cpanel-row{display:grid;grid-template-columns:38px minmax(0,1fr);gap:2px 8px;width:100%;text-align:left;border:none;border-top:${BD2};background:#fff;padding:8px 10px;cursor:pointer;font-family:inherit}
        .cpanel-row:first-of-type{border-top:none}
        .cpanel-row:hover{background:#fffbeb}
        .cpanel-time{grid-row:1 / span 2;font-size:12px;font-weight:700;color:#555;padding-top:1px;font-variant-numeric:tabular-nums}
        .cpanel-title{font-size:12.5px;font-weight:700;color:#111;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}
        .cpanel-title.is-empty{color:#736a62;font-weight:600}
        .cpanel-meta{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
        .cpanel-pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500;color:#6b6259;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
        .cpanel-pill i{width:7px;height:7px;border-radius:50%;flex:none}
        .cpanel-dot{color:#c2b8ad}
        .cpanel-title{font-size:13.5px!important}
        .cpanel-day.is-empty{background:transparent;border-style:dashed}
        .cpanel-day.is-empty .cpanel-dayhead{background:transparent;padding:5px 10px;color:#736a62;font-weight:700}
        .cpanel-acc{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
        .cpanel-acc button{display:flex;align-items:center;gap:5px;flex:0 0 auto;border:1px solid transparent;background:transparent;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600;color:#6b6259;cursor:pointer;white-space:nowrap;font-family:inherit}
        .cpanel-acc button.is-on{background:#fff;border-color:#e6dfd6;color:#111}
        .cpanel-acc i{width:6px;height:6px;border-radius:50%;display:inline-block}
        .cpanel-tabs{display:flex;gap:2px;background:#f5f0eb;border:${BD2};border-radius:9px;padding:2px}
        .cpanel-tabs button{flex:1;border:none;background:transparent;border-radius:7px;padding:5px 0;font-size:12.5px;font-weight:700;color:#6b6259;cursor:pointer;font-family:inherit}
        .cpanel-tabs button.is-on{background:#fff;color:#111;box-shadow:0 1px 2px rgba(0,0,0,.06)}
        .cpanel-cap2{background:#fff;border:${BD2};border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 1px 2px rgba(26,26,26,.04)}
        .cpanel-cap2:focus-within{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2)}
        .cpanel-cap2 textarea{border:0;outline:none;resize:none;font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:14px;line-height:1.65;min-height:64px;background:transparent;width:100%;box-sizing:border-box;padding:10px 12px 6px}
        .cpanel-capft{display:flex;align-items:center;gap:6px;font-size:12px;color:#736a62;border-top:1px solid #f3eee8;background:#f7f3ee;padding:6px 8px 6px 12px}
        .cpanel-capft button{margin-left:auto;background:#b45309;color:#fff;border:none;border-radius:8px;height:30px;padding:0 12px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
        .cpanel-foot{padding:10px 12px 14px;text-align:center}
        .cpanel-foot a{font-size:12px;font-weight:700;color:#6b6560;text-decoration:none;border:${BD2};background:#fff;border-radius:99px;padding:6px 14px;display:inline-block}
        .cpanel-foot a:hover{color:#111;border-color:#d4cbbf}
      `}</style>
      {/* 2026-11-02：アプリ名はシアニンパネルの帯に出ているので外し、切り替えと「＋ アイデア」を 1 行に。アカウントはその下に小さく */}
      <div className="cpanel-head">
        <div className="cpanel-headrow">
          <div className="cpanel-tabs">{[['memo','メモ'],['find','探す'],['week','今週']].map(([k,l])=><button key={k} className={tab===k?'is-on':''} aria-pressed={tab===k} onClick={()=>setTab(k)}>{l}</button>)}</div>
          <button className="cpanel-add" onClick={onAddIdea} title="ネタを書いて開く（N）">＋ ネタ<kbd>N</kbd></button>
        </div>
        {ws}
        {accounts.length>1&&(
          <div className="cpanel-acc">
            {accounts.map(a=><button key={a.id} className={account?.id===a.id?'is-on':''} aria-pressed={account?.id===a.id} onClick={()=>onAccount(a.id)}><i style={{background:account?.id===a.id?a.color:'#a39a90'}}/>{a.name}</button>)}
          </div>
        )}
      </div>
      <div className="cpanel-body">
        {tab==='memo'&&<>
          <div className="cpanel-cap2">
            <textarea ref={capRef} value={cap} onChange={e=>setCap(e.target.value)} placeholder="思いついたことを書く" autoFocus
              onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
            <div className="cpanel-capft"><span>Enter は改行・⌘／Ctrl＋Enter で受け箱へ</span><button onClick={send}>受け箱へ</button></div>
          </div>
          <div className="cpanel-cap"><span>受け箱の新しい順</span><span>{inbox.length} 件</span></div>
          <div className="cpanel-day">{inbox.map(p=><button key={p.id} className="cpanel-row" style={{gridTemplateColumns:'minmax(0,1fr)'}} onClick={()=>onOpen(p)}>
            <span className={`cpanel-title ${p.title?'':'is-empty'}`}>{p.title||(p.memo||'').split('\n')[0]||'（空のネタ）'}</span></button>)}
            {!inbox.length&&<div style={{padding:'10px 12px',fontSize:12,color:'#736a62'}}>受け箱は空っぽ</div>}</div>
        </>}
        {tab==='find'&&renderFind&&<div className="ck" style={{background:'transparent'}}><style>{CK_CSS}</style>{renderFind()}</div>}
        {tab==='week'&&<><div className="cpanel-cap"><span>今後 7 日</span><span>{total} 件</span></div>
        {days.map(d=>{
          const rows=byDay[d.key]||[];
          const dow=d.date.getDay();
          return(
            <div key={d.key} className={`cpanel-day ${rows.length?'':'is-empty'}`}>
              <div className="cpanel-dayhead">
                <span style={{color:dow===0||dow===6?'#ef4444':undefined}}>{d.date.getMonth()+1}/{d.date.getDate()} {WD[dow]}</span>
                {d.i===0&&<span className="tag">今日</span>}
                {d.i===1&&<span className="tag" style={{color:'#6b6560',background:'#f5f0eb'}}>明日</span>}
                <span className="n">{rows.length?`${rows.length} 件`:'予定なし'}</span>
              </div>
              {rows.map(p=>{
                const st=STATUS[p.status]||STATUS.draft,pt=getPostTypeStyle(p.postType,postTypes);
                return(
                  <button key={p.id} className="cpanel-row" onClick={()=>onOpen(p)}>
                    <span className="cpanel-time">{p.datetime.slice(11,16)}</span>
                    <span className={`cpanel-title ${p.title?'':'is-empty'}`}>{p.title||'（タイトルなし）'}</span>
                    <span className="cpanel-meta">
                      <span className="cpanel-pill"><i style={{background:st.text}}/>{st.label}</span>
                      <span className="cpanel-dot" aria-hidden="true">·</span>
                      <span className="cpanel-pill">{postTypes[p.postType]?.label||pt.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}</>}
      </div>
      <div className="cpanel-foot"><a href="https://content-os.shia2n.jp/" target="_blank" rel="noopener noreferrer">全部を開く ↗</a></div>
    </div>
  );
}
