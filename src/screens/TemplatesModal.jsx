import React, {useState,useEffect,useRef} from 'react';
import {BD,BD2,POST_TYPE} from '../constants.js';
import {dbAddTemplate,dbUpdateTemplate,dbRemoveTemplate} from '../lib/supabase.js';
import {TEMPLATE_KINDS,CURSOR_MARK,PROMPT_VARS} from '../lib/templates.js';
import {REQUEST_KINDS,REQUEST_KIND_LABEL} from '../lib/requests.js';
import {RefPicker,RefChips} from '../components/RefPicker.jsx';
import {useDialogFocus} from '../lib/useDialogFocus.js';

// 型の管理（2026-11-10 Naoki「型のところは別途管理画面があるとよさそう」→ デモに OK 11:36）
// 左＝種類（本文・締め・メモ・プロンプト）、真ん中＝一覧（名前で探す・並べ替え）、右＝中身。書く画面の右の「型」タブは、ここで作ったものを使う場所
const REQUEST_STARTERS=[
  {name:'結論と根拠3つの図解',make:'quote_figure',content:'引用ポストに付ける図解を1枚。\n・結論を1行、根拠を3つの箱で\n・文字は30字以内\n・16:9、色はシアニンの青と白'},
  {name:'見出しごとの要点図解',make:'article_figure',content:'記事の中に置く図解。見出しごとに要点を1枚ずつ（最大3枚）。\n・箱と矢印で、文字は少なめ\n・16:9、色はシアニンの青と白'},
  {name:'大きな文字1行のサムネ',make:'thumbnail',content:'見出し画像を1枚。題を短く言い換えた大きな文字1行。16:9。色はシアニンの青と白。'},
  {name:'結論から書く初稿',make:'text',content:'題と本文のメモを材料に、本文の初稿を書く。\n・冒頭で結論\n・見出しは3〜5個\n・シアニンの口調（です・ます、短い文）'},
];
const HINT={
  body:'書く画面の右の「型」から、本文のカーソルの位置に差し込みます。',
  closing:'本文の末尾に足します（CTA・メンシプへの案内など）。',
  memo:'メモに差し込みます。「- 」と半角スペース 2 つで 1 階層の箇条書きのまま入ります。',
  prompt:'AI に渡す文。{タイトル}{本文}{メモ}{種類} を、書いている中身に置き換えてコピーします。',
  request:'書く画面の「AI依頼」で使う、GPT への依頼の文（パターン）。「作るもの」（引用の図解・サムネなど）ごとに、名前の違うパターンをいくつでも持てます。作るもの × 投稿の種類が合う型が自動で付きます。GPT は投稿の題と本文をいっしょに受け取ります。',
};

function Field({value,onSave,multiline,placeholder,style,inputRef,label}){
  const [v,setV]=useState(value||'');
  const timer=useRef(null);
  useEffect(()=>setV(value||''),[value]);
  const commit=(x=v)=>{clearTimeout(timer.current);if(x!==(value||''))onSave(x);};
  // 打つ手を止めて 3 秒で保存（書く画面と同じ間）。外へ出たときもすぐ保存
  const change=e=>{const x=e.target.value;setV(x);clearTimeout(timer.current);timer.current=setTimeout(()=>commit(x),3000);};
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const common={value:v,placeholder,onChange:change,'aria-label':label,
    style:{width:'100%',boxSizing:'border-box',border:'1px solid #a39a90',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',color:'#1a1a1a',background:'#fff',outline:'none',...style},
    onFocus:e=>e.target.style.borderColor='#f59e0b'};
  return multiline
    ?<textarea ref={inputRef} {...common} onBlur={e=>{e.target.style.borderColor='';commit();}} style={{...common.style,resize:'vertical',lineHeight:1.7,minHeight:style?.minHeight??260}}/>
    :<input ref={inputRef} {...common} onBlur={e=>{e.target.style.borderColor='';commit();}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>;
}

// 2026-11-10 型の持ち帰り 便1：AI（Claude・GPT）がチャットから書き込んだ型は「候補」の印つきで入る
const MADE_BY_LABEL={claude:'Claude',gpt:'GPT'};
const fmtAt=s=>{if(!s)return'';const d=new Date(s);return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;};
const chip={display:'inline-flex',alignItems:'center',fontSize:11,fontWeight:700,color:'#1d4ed8',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'1px 6px',whiteSpace:'nowrap'};
const badge={display:'inline-flex',alignItems:'center',fontSize:11,fontWeight:800,color:'#b45309',background:'#fef3c7',border:'1px solid #fcd34d',borderRadius:99,padding:'1px 8px',whiteSpace:'nowrap'};

export function TemplatesModal({uid,templates,setTemplates,postTypes=POST_TYPE,onClose,initialKind='body',initialId=null,posts=[],onOpenPost}){
  const first=initialId&&templates.find(t=>t.id===initialId);
  const [kind,setKind]=useState(first?first.kind:initialKind);
  const [selId,setSelId]=useState(first?first.id:null);
  const [q,setQ]=useState('');
  const [error,setError]=useState('');
  const [saved,setSaved]=useState('');
  const busy=useRef(false),area=useRef(null);
  const all=templates.filter(t=>t.kind===kind).sort((a,b)=>a.sort_order-b.sort_order);
  const items=q.trim()?all.filter(t=>(t.name+'\n'+t.content).toLowerCase().includes(q.trim().toLowerCase())):all;
  const cur=items.find(t=>t.id===selId)||items[0]||null;
  // Esc は窓の決まり（いちばん上の窓だけが閉じる）に任せる。後ろの編集画面は閉じない
  const box=useRef(null);
  useDialogFocus(box,{onClose});

  async function run(fn){
    if(busy.current)return;busy.current=true;setError('');
    try{await fn();}catch(e){const m=e.message||String(e);setError(/check constraint|violates|make|refs/i.test(m)?'この種類の置き場はまだ準備中です（表の準備が済むと使えます）':m);}
    finally{busy.current=false;}
  }
  const put=row=>setTemplates(ts=>ts.some(t=>t.id===row.id)?ts.map(t=>t.id===row.id?row:t):[...ts,row]);
  const add=()=>run(async()=>{
    const order=all.length?Math.max(...all.map(t=>t.sort_order))+1:0;
    const row=await dbAddTemplate(uid,{name:'新しい'+(TEMPLATE_KINDS.find(([k])=>k===kind)||[,''])[1],kind,post_type:null,content:kind==='closing'||kind==='prompt'||kind==='request'?'':CURSOR_MARK,sort_order:order,...(kind==='request'?{make:'quote_figure'}:{})});
    put(row);setSelId(row.id);setQ('');
  });
  // 2026-11-10 依頼の型が 0 件のとき、作るもの 4 つ分のひな形を 1 回で入れる（そのあと中身を直して使う）
  const addStarters=()=>run(async()=>{
    let last=null;
    for(let i=0;i<REQUEST_STARTERS.length;i++){const row=await dbAddTemplate(uid,{...REQUEST_STARTERS[i],kind:'request',post_type:null,sort_order:i});put(row);last=last||row;}
    if(last)setSelId(last.id);
  });
  const update=(t,fields)=>run(async()=>{put(await dbUpdateTemplate(uid,t.id,fields));const d=new Date();setSaved(`保存しました ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`);});
  // 2026-11-10 改訂案を採用：中身・参考・出どころを元の型へ移し、改訂案の行は消す（元の型の名前・並び・使う種類はそのまま）
  const adopt=(c,target)=>run(async()=>{
    const row=await dbUpdateTemplate(uid,target.id,{content:c.content,refs:Array.isArray(c.refs)?c.refs:[],why:c.why||'',source_post_id:c.source_post_id??null,made_by:c.made_by||null,made_in:c.made_in||''});
    put(row);await dbRemoveTemplate(uid,c.id);setTemplates(ts=>ts.filter(x=>x.id!==c.id));setSelId(target.id);
    const d=new Date();setSaved(`採用しました ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`);
  });
  // 確かめの窓（window.confirm）はやめ、2 回押しで消す（1 回目でボタンの字が変わる）
  const [armed,setArmed]=useState(null);
  const remove=t=>{if(armed!==t.id){setArmed(t.id);setTimeout(()=>setArmed(x=>x===t.id?null:x),4000);return;}setArmed(null);run(async()=>{await dbRemoveTemplate(uid,t.id);setTemplates(ts=>ts.filter(x=>x.id!==t.id));setSelId(null);});};
  const duplicate=t=>run(async()=>{const row=await dbAddTemplate(uid,{name:(t.name||'')+'（コピー）',kind:t.kind,post_type:t.post_type,content:t.content,...(t.kind==='request'?{make:t.make||null}:{}),sort_order:Math.max(...all.map(x=>x.sort_order))+1});put(row);setSelId(row.id);});
  const move=(i,dir)=>{
    if(!all[i+dir])return;
    const next=[...all];[next[i],next[i+dir]]=[next[i+dir],next[i]];
    run(async()=>{for(let n=0;n<next.length;n++){if(next[n].sort_order!==n)put(await dbUpdateTemplate(uid,next[n].id,{sort_order:n}));}});
  };
  // 差し込める言葉を、中身の欄のカーソルの位置へ入れる
  const putVar=w=>{const el=area.current;if(!el||!cur)return;const s=el.selectionStart??el.value.length,e=el.selectionEnd??s;const v=el.value.slice(0,s)+w+el.value.slice(e);update(cur,{content:v});setTimeout(()=>{el.focus();el.setSelectionRange(s+w.length,s+w.length);},0);};
  const ix=cur?all.findIndex(t=>t.id===cur.id):-1;
  const sb={border:'1px solid #e6dfd6',background:'#fff',borderRadius:8,padding:'6px 10px',fontSize:12,fontWeight:700,color:'#1a1a1a',cursor:'pointer',fontFamily:'inherit',minHeight:30};

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:14}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="templates-modal-title" style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:1080,height:'min(760px, calc(100vh - 28px))',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 60px #00000030'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:BD2}}>
          <span id="templates-modal-title" style={{fontWeight:800,fontSize:16,color:'#111'}}>型の管理</span>
          <span role="status" style={{fontSize:12,color:'#736a62'}}>{saved}</span>
          <button onClick={onClose} style={{marginLeft:'auto',background:'none',border:BD,borderRadius:20,padding:'5px 12px',fontSize:12,fontWeight:700,color:'#6b6259',cursor:'pointer'}}>閉じる</button>
        </div>
        <div style={{flex:1,minHeight:0,display:'grid',gridTemplateColumns:'190px 300px minmax(0,1fr)'}}>
          <div role="tablist" aria-label="型の種類" style={{background:'#f7f3ee',borderRight:BD2,padding:'10px 0',overflowY:'auto'}}>
            <div style={{fontSize:12,fontWeight:800,color:'#736a62',padding:'4px 14px 6px'}}>種類</div>
            {TEMPLATE_KINDS.map(([k,l])=>(
              <button key={k} role="tab" aria-selected={kind===k} onClick={()=>{setKind(k);setSelId(null);setQ('');}}
                style={{display:'flex',alignItems:'center',width:'100%',textAlign:'left',border:'none',padding:'9px 14px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',background:kind===k?'#fef3c7':'transparent',color:kind===k?'#b45309':'#6b6259'}}>
                {l}{templates.some(t=>t.kind===k&&t.status==='candidate')&&<span style={{...badge,marginLeft:6}} title="AI が書いた候補の数">候補 {templates.filter(t=>t.kind===k&&t.status==='candidate').length}</span>}<span style={{marginLeft:'auto',fontWeight:600,color:'#736a62',fontSize:12}}>{templates.filter(t=>t.kind===k).length}</span>
              </button>
            ))}
            <div style={{fontSize:12,color:'#736a62',lineHeight:1.7,padding:'14px'}}>{HINT[kind]}</div>
          </div>
          <div style={{borderRight:BD2,display:'flex',flexDirection:'column',minHeight:0}}>
            <div style={{display:'flex',gap:6,padding:'10px 12px',borderBottom:BD2}}>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="名前・中身で探す" aria-label="型を探す" style={{flex:1,minWidth:0,border:'1px solid #a39a90',borderRadius:8,padding:'6px 9px',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
              <button onClick={add} style={{border:'1px solid #b45309',background:'#b45309',color:'#fff',borderRadius:8,padding:'6px 10px',fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>＋ 追加</button>
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              {items.map(t=>(
                <button key={t.id} onClick={()=>setSelId(t.id)} aria-current={cur&&cur.id===t.id?'true':undefined}
                  style={{display:'flex',flexDirection:'column',gap:3,width:'100%',textAlign:'left',border:'none',borderBottom:'1px solid #f1ebe4',padding:'10px 12px',cursor:'pointer',fontFamily:'inherit',background:cur&&cur.id===t.id?'#fffaf0':'#fff',boxShadow:cur&&cur.id===t.id?'inset 3px 0 0 #f59e0b':'none'}}>
                  <span style={{display:'flex',alignItems:'center',gap:6,fontSize:13,fontWeight:700,color:'#1a1a1a'}}>{t.status==='candidate'&&<span style={badge}>{t.replaces_id?'改訂案':'候補'}</span>}{t.kind==='request'&&<span style={chip}>{REQUEST_KIND_LABEL[t.make]||'作るもの未設定'}</span>}<span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name||'（名前なし）'}</span></span>
                  <span style={{fontSize:12,color:'#736a62',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.post_type?(postTypes[t.post_type]?.label||t.post_type):'すべての種類'} · {(t.content||'').replace(/\n/g,' ')}</span>
                </button>
              ))}
              {!items.length&&<div style={{color:'#736a62',fontSize:12.5,padding:'20px 14px',lineHeight:1.7}}>{q?'当てはまる型はありません':`${(TEMPLATE_KINDS.find(([k])=>k===kind)||[,''])[1]}の型はまだありません。上の「＋ 追加」で作れます`}
                {!q&&kind==='request'&&<button onClick={addStarters} style={{display:'block',marginTop:10,border:'none',borderRadius:8,padding:'8px 12px',fontSize:12.5,fontWeight:800,background:'#f59e0b',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>ひな形を 4 つ入れる</button>}</div>}
            </div>
          </div>
          <div style={{padding:16,display:'flex',flexDirection:'column',gap:10,overflowY:'auto',minWidth:0}}>
            {cur?<>
              {(cur.status==='candidate'||cur.why||cur.source_post_id||cur.made_by)&&(()=>{
                const src=cur.source_post_id!=null?posts.find(p=>String(p.id)===String(cur.source_post_id)):null;
                const target=cur.replaces_id?templates.find(t=>t.id===cur.replaces_id):null;
                const where=`${cur.made_by?`${MADE_BY_LABEL[cur.made_by]||cur.made_by} のチャット`:'チャット'}で作成${cur.created_at?` · ${fmtAt(cur.created_at)}`:''}`;
                const pre={margin:0,whiteSpace:'pre-wrap',wordBreak:'break-word',fontFamily:'inherit',fontSize:12.5,lineHeight:1.7,color:'#1a1a1a',background:'#fff',border:'1px solid #e6dfd6',borderRadius:8,padding:'8px 10px',maxHeight:240,overflowY:'auto'};
                return <div style={{border:'1px solid #fcd34d',background:'#fffbeb',borderRadius:10,padding:'10px 12px',display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    {cur.status==='candidate'&&<span style={badge}>{cur.replaces_id?'改訂案':'候補'}</span>}
                    <span style={{fontSize:12,color:'#6b6259'}}>{where}</span>
                    {/^https?:\/\//.test(cur.made_in||'')?<a href={cur.made_in} target="_blank" rel="noopener noreferrer" style={{fontSize:12,fontWeight:700,color:'#b45309'}}>作ったチャットを開く</a>:cur.made_in?<span style={{fontSize:12,color:'#736a62'}}>（{cur.made_in}）</span>:null}
                    {cur.source_post_id!=null&&(src&&onOpenPost
                      ?<button onClick={()=>onOpenPost(src)} style={{...sb,marginLeft:'auto',color:'#b45309'}}>元の投稿：{(src.title||'（題なし）').slice(0,24)} を開く</button>
                      :<span style={{marginLeft:'auto',fontSize:12,color:'#736a62'}}>元の投稿 #{cur.source_post_id}（いまの表示には無い投稿）</span>)}
                  </div>
                  {cur.replaces_id&&(target
                    ?<>
                      <div style={{fontSize:12.5,fontWeight:700,color:'#6b6259'}}>「{target.name||'（名前なし）'}」の改訂案。採用すると、元の型の中身と参考がこの案に置き換わります</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        <div><div style={{fontSize:12,fontWeight:700,color:'#736a62',marginBottom:4}}>いまの型</div><pre style={pre}>{target.content}</pre></div>
                        <div><div style={{fontSize:12,fontWeight:700,color:'#b45309',marginBottom:4}}>改訂案</div><pre style={pre}>{cur.content}</pre></div>
                      </div>
                      <div><button onClick={()=>adopt(cur,target)} style={{border:'1px solid #b45309',background:'#b45309',color:'#fff',borderRadius:8,padding:'7px 12px',fontSize:12.5,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>採用して元の型に反映</button></div>
                    </>
                    :<div style={{fontSize:12,color:'#736a62'}}>直す先の型が見つかりません（消された可能性があります）。この案を新しい型として使えます</div>)}
                  <label style={{fontSize:12,fontWeight:700,color:'#6b6259'}}>なぜ効いたか</label>
                  <Field key={cur.id+'w'} multiline value={cur.why||''} label="なぜ効いたか" placeholder="成果が出た理由（主観と数字）" onSave={v=>update(cur,{why:v})} style={{minHeight:70,background:'#fff'}}/>
                </div>;
              })()}
              <label style={{fontSize:12,fontWeight:700,color:'#6b6259'}}>{kind==='request'?'パターンの名前（作るものの名前とは別に、中身が分かる名前）':'名前'}</label>
              <Field key={cur.id+'n'} value={cur.name} label="型の名前" placeholder="型の名前" onSave={v=>update(cur,{name:v})} style={{fontWeight:700}}/>
              {kind==='request'&&<>
                <label style={{fontSize:12,fontWeight:700,color:'#6b6259'}}>作るもの</label>
                <select value={cur.make||''} onChange={e=>update(cur,{make:e.target.value||null})} style={{border:'1px solid #a39a90',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',background:'#fff',maxWidth:260}}>
                  <option value="">どれにも使う</option>
                  {REQUEST_KINDS.map(([k,l])=><option key={k} value={k}>{l}</option>)}
                </select>
              </>}
              <label style={{fontSize:12,fontWeight:700,color:'#6b6259'}}>使う投稿の種類</label>
              <select value={cur.post_type||''} onChange={e=>update(cur,{post_type:e.target.value||null})} style={{border:'1px solid #a39a90',borderRadius:8,padding:'8px 10px',fontSize:13,fontFamily:'inherit',background:'#fff',maxWidth:260}}>
                <option value="">すべての種類</option>
                {cur.post_type&&!postTypes[cur.post_type]&&<option value={cur.post_type}>{cur.post_type}</option>}
                {Object.entries(postTypes).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              {kind==='request'&&<>
                <label style={{fontSize:12,fontWeight:700,color:'#6b6259'}}>いつも付ける参考（この型で依頼すると毎回 GPT に渡る・5 件まで）</label>
                <RefChips refs={Array.isArray(cur.refs)?cur.refs:[]} onRemove={r=>update(cur,{refs:(cur.refs||[]).filter(x=>!(x.k===r.k&&x.id===r.id))})}/>
                <details><summary style={{fontSize:12.5,fontWeight:700,color:'#6b6259',cursor:'pointer'}}>参考を探して付ける</summary>
                  <div style={{marginTop:6}}><RefPicker value={Array.isArray(cur.refs)?cur.refs:[]} onChange={v=>update(cur,{refs:v})}/></div></details>
              </>}
              <label style={{fontSize:12,fontWeight:700,color:'#6b6259'}}>中身</label>
              <Field key={cur.id+'c'} multiline inputRef={area} value={cur.content} label="型の中身" placeholder={kind==='memo'?'- 主題\n  - 理由':kind==='prompt'?'例：次の記事の冒頭を 3 案出して。\nタイトル：{タイトル}\n本文：{本文}':kind==='request'?'例：X記事の引用用の図解を1枚。\n・結論を1行、根拠を3つの箱で\n・文字は30字以内\n・色はシアニンの青と白':'中身'} onSave={v=>update(cur,{content:v})}/>
              {kind==='prompt'
                ?<div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}><span style={{fontSize:12,color:'#736a62'}}>差し込める言葉：</span>{PROMPT_VARS.map(w=><button key={w} onMouseDown={e=>e.preventDefault()} onClick={()=>putVar(w)} style={{...sb,borderRadius:99}}>{w}</button>)}</div>
                :kind!=='closing'&&kind!=='request'&&<div style={{fontSize:12,color:'#736a62'}}><code style={{background:'#fef3c7',color:'#b45309',borderRadius:4,padding:'0 4px'}}>{CURSOR_MARK}</code> と書いた所に、差し込んだあとカーソルが来ます（1 つだけ）</div>}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
                <button disabled={ix<=0} onClick={()=>move(ix,-1)} aria-label="上へ" style={{...sb,opacity:ix<=0?.45:1}}>▲ 上へ</button>
                <button disabled={ix<0||ix>=all.length-1} onClick={()=>move(ix,1)} aria-label="下へ" style={{...sb,opacity:ix<0||ix>=all.length-1?.45:1}}>▼ 下へ</button>
                <button onClick={()=>duplicate(cur)} style={sb}>複製</button>
                <button onClick={()=>remove(cur)} style={{...sb,color:'#b91c1c',fontWeight:800}} aria-live="polite">{armed===cur.id?'もう一度押すと削除':'削除'}</button>
              </div>
              <div style={{fontSize:12,color:'#736a62'}}>打つ手を止めて 3 秒で自動保存</div>
            </>:<div style={{color:'#736a62',fontSize:13,lineHeight:1.7}}>左の一覧から型を選ぶと、ここで編集できます。</div>}
          </div>
        </div>
        {error&&<div role="alert" style={{padding:'8px 14px',background:'#fef2f2',color:'#b91c1c',fontSize:12,borderTop:'1px solid #fca5a5'}}>保存できませんでした：{error}</div>}
      </div>
    </div>
  );
}
