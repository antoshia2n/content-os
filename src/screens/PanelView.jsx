import React from 'react';
import {STATUS,POST_TYPE,getPostTypeStyle,BD2,fmtDate} from '../constants.js';
import {auth} from '../firebase.js';

// 2026-10-05 段 4：拡張機能のサイドパネル（幅 360px 前後）で開く細い画面。住所は /panel。
// 拡張機能は枠だけで、機能はすべてここに置く（直すたびに拡張機能を入れ直さないため）。
const WD=['日','月','火','水','木','金','土'];

// 2026-10-06：Notion へ送るメモ。コンテンツくんの表には入れず、送り先の DB へ直接 1 件書く。
// 1 行目がタイトル、2 行目から下が本文。URL があれば最初の 1 本を URL の列へ入れる（inbox・インプット）。
const DESTS=[['inbox','inbox'],['input','インプット'],['output','アウトプット']];
const DRAFT_KEY='cpanel-notion-memo';
function NotionMemo(){
  const [memo,setMemo]=React.useState(()=>{try{return localStorage.getItem(DRAFT_KEY)||'';}catch{return '';}});
  const [busy,setBusy]=React.useState(null);
  const [msg,setMsg]=React.useState(null);
  React.useEffect(()=>{try{memo?localStorage.setItem(DRAFT_KEY,memo):localStorage.removeItem(DRAFT_KEY);}catch{}},[memo]);
  const send=async dest=>{
    if(!memo.trim()||busy)return;
    setBusy(dest);setMsg(null);
    try{
      const user=auth.currentUser;
      if(!user)throw new Error('ログインを確認できませんでした。パネルを開き直してください');
      const token=await user.getIdToken();
      const res=await fetch('/api/notion-memo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({dest,memo})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.ok)throw new Error(data.error||`送れませんでした（${res.status}）`);
      setMemo('');
      setMsg({ok:true,text:`${data.label} に入れました`,url:data.url});
    }catch(e){
      setMsg({ok:false,text:e.message});
    }finally{setBusy(null);}
  };
  const empty=!memo.trim();
  return(
    <div className="cpanel-memo">
      <div className="cpanel-cap"><span>Notion へメモ</span><span>1 行目がタイトル</span></div>
      <textarea value={memo} onChange={e=>{setMemo(e.target.value);if(msg)setMsg(null);}} placeholder={'タイトル\n本文（URL を書くと URL の列にも入ります）'} rows={4}/>
      <div className="cpanel-dests">
        {DESTS.map(([k,label])=><button key={k} disabled={empty||!!busy} onClick={()=>send(k)}>{busy===k?'送信中…':label}</button>)}
      </div>
      {msg&&<div className={`cpanel-msg ${msg.ok?'is-ok':'is-ng'}`}>{msg.text}{msg.ok&&msg.url&&<> <a href={msg.url} target="_blank" rel="noopener noreferrer">開く ↗</a></>}</div>}
    </div>
  );
}

export function PanelView({posts,accounts=[],account,onAccount,postTypes=POST_TYPE,onAddIdea,onOpen}){
  const today=fmtDate(new Date());
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
        .cpanel-head{position:sticky;top:0;z-index:5;background:#fff;border-bottom:${BD2};padding:10px 12px;display:flex;align-items:center;gap:8px}
        .cpanel-brand{font-weight:900;font-size:14px;color:#111;white-space:nowrap}
        .cpanel-add{margin-left:auto;background:#f59e0b;border:none;color:#fff;border-radius:10px;padding:8px 14px;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}
        .cpanel-add:hover{background:#e08c00}
        .cpanel-add kbd{font-family:inherit;font-size:9.5px;font-weight:700;background:rgba(255,255,255,.25);border-radius:4px;padding:1px 4px;margin-left:6px}
        .cpanel-body{flex:1;padding:10px 10px 4px;display:flex;flex-direction:column;gap:8px}
        .cpanel-cap{display:flex;justify-content:space-between;align-items:baseline;padding:0 2px;font-size:11px;font-weight:700;color:#6b6560}
        .cpanel-cap span:last-child{font-weight:600;color:#a8a09a}
        .cpanel-day{background:#fff;border:${BD2};border-radius:10px;overflow:hidden}
        .cpanel-dayhead{display:flex;align-items:center;gap:6px;padding:7px 10px;font-size:11.5px;font-weight:800;color:#555;border-bottom:${BD2};background:#fcfaf8}
        .cpanel-day.is-empty .cpanel-dayhead{border-bottom:none}
        .cpanel-dayhead .tag{font-size:9.5px;font-weight:800;color:#b45309;background:#fef3c7;border-radius:99px;padding:1px 7px}
        .cpanel-dayhead .n{margin-left:auto;font-size:10px;font-weight:600;color:#a8a09a}
        .cpanel-row{display:grid;grid-template-columns:38px minmax(0,1fr);gap:2px 8px;width:100%;text-align:left;border:none;border-top:${BD2};background:#fff;padding:8px 10px;cursor:pointer;font-family:inherit}
        .cpanel-row:first-of-type{border-top:none}
        .cpanel-row:hover{background:#fffbeb}
        .cpanel-time{grid-row:1 / span 2;font-size:11.5px;font-weight:700;color:#555;padding-top:1px;font-variant-numeric:tabular-nums}
        .cpanel-title{font-size:12.5px;font-weight:700;color:#111;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}
        .cpanel-title.is-empty{color:#b8afa5;font-weight:600}
        .cpanel-meta{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
        .cpanel-pill{display:inline-block;border-radius:99px;padding:1px 7px;font-size:9.5px;font-weight:700;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
        .cpanel-acc{display:flex;gap:2px;background:#f5f0eb;border:${BD2};border-radius:8px;padding:2px;overflow-x:auto}
        .cpanel-acc button{display:flex;align-items:center;gap:5px;flex:1 0 auto;border:none;background:transparent;border-radius:6px;padding:4px 9px;font-size:11.5px;font-weight:600;color:#a8a09a;cursor:pointer;white-space:nowrap;font-family:inherit}
        .cpanel-acc button.is-on{background:#fff;color:#111;box-shadow:0 1px 2px rgba(0,0,0,.06)}
        .cpanel-acc i{width:6px;height:6px;border-radius:50%;display:inline-block}
        .cpanel-memo{background:#fff;border:${BD2};border-radius:10px;padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px}
        .cpanel-memo .cpanel-cap{padding:0}
        .cpanel-memo textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:72px;border:${BD2};border-radius:8px;padding:7px 9px;font-size:12.5px;line-height:1.5;font-family:inherit;color:#111;background:#fcfaf8;outline:none}
        .cpanel-memo textarea:focus{border-color:#f59e0b;background:#fff}
        .cpanel-dests{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
        .cpanel-dests button{border:${BD2};background:#fff;border-radius:8px;padding:7px 4px;font-size:12px;font-weight:800;color:#333;cursor:pointer;font-family:inherit;white-space:nowrap}
        .cpanel-dests button:hover:not(:disabled){border-color:#f59e0b;color:#b45309;background:#fffbeb}
        .cpanel-dests button:disabled{color:#c8bfb5;cursor:default}
        .cpanel-msg{font-size:11.5px;font-weight:700;border-radius:8px;padding:6px 9px}
        .cpanel-msg.is-ok{color:#047857;background:#ecfdf5}
        .cpanel-msg.is-ng{color:#b91c1c;background:#fef2f2}
        .cpanel-msg a{color:inherit}
        .cpanel-foot{padding:10px 12px 14px;text-align:center}
        .cpanel-foot a{font-size:11.5px;font-weight:700;color:#6b6560;text-decoration:none;border:${BD2};background:#fff;border-radius:99px;padding:6px 14px;display:inline-block}
        .cpanel-foot a:hover{color:#111;border-color:#d4cbbf}
      `}</style>
      <div className="cpanel-head">
        <span className="cpanel-brand">コンテンツ<span style={{color:'#f59e0b'}}>くん</span></span>
        <button className="cpanel-add" onClick={onAddIdea}>ネタを足す<kbd>N</kbd></button>
      </div>
      <div className="cpanel-body">
        {accounts.length>1&&(
          <div className="cpanel-acc">
            {accounts.map(a=><button key={a.id} className={account?.id===a.id?'is-on':''} onClick={()=>onAccount(a.id)}><i style={{background:account?.id===a.id?a.color:'#ccc'}}/>{a.name}</button>)}
          </div>
        )}
        <NotionMemo/>
        <div className="cpanel-cap"><span>今後 7 日</span><span>{total} 件</span></div>
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
                      <span className="cpanel-pill" style={{color:st.text,background:st.chip,border:`1px solid ${st.border}`}}>{st.label}</span>
                      <span className="cpanel-pill" style={{color:pt.color,background:pt.bg,border:`1px solid ${pt.border}`}}>{postTypes[p.postType]?.label||pt.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="cpanel-foot"><a href="https://content-os.shia2n.jp/" target="_blank" rel="noopener noreferrer">全部を開く ↗</a></div>
    </div>
  );
}
