// 2026-11-10 依頼（content_requests）：チェックで作る初稿の依頼。ChatGPT の予定タスクが 1 時間ごとに読み、初稿を書き戻す
// Naoki「OK」13:20（作る前の 1 枚）。表は作業 69、GPT の口は shia2n-mcp v1.72.0 の /content/mcp
export const REQUEST_KINDS=[
  ['quote_figure','引用の図解'],
  ['article_figure','記事内の図解'],
  ['thumbnail','サムネ'],
  ['text','本文'],
];
export const REQUEST_KIND_LABEL=Object.fromEntries(REQUEST_KINDS);
export const REQUEST_STATUS={
  queued:   {label:'未着手',  color:'#6b6259',bg:'#f3f0ec'},
  drafting: {label:'作成中',  color:'#1d4ed8',bg:'#dbeafe'},
  review:   {label:'確認待ち',color:'#b45309',bg:'#fef3c7'},
  waiting:  {label:'引用元待ち',color:'#0369a1',bg:'#e0f2fe'},
  done:     {label:'格納済み',color:'#047857',bg:'#d1fae5'},
  cancelled:{label:'取り消し',color:'#8a8076',bg:'#f3f0ec'},
};
export const MEDIA_LABEL={x_article:'X記事',note:'note',x_post:'Xポスト'};
// 投稿の種類から媒体を決める（メンシプ・有料は note と同じ扱い）
export function mediaOf(postType){
  if(postType==='x_article')return 'x_article';
  if(postType==='note'||postType==='membership'||postType==='paid')return 'note';
  return 'x_post';
}
// 依頼の型（kind=request）から、作るもの × 投稿の種類に合うものを 1 つ選ぶ。種類まで合うものを先に
export function pickRequestTemplate(templates,make,postType){
  const rs=(templates||[]).filter(t=>t.kind==='request'&&!t.replaces_id&&(t.make===make||!t.make)).sort((a,b)=>a.sort_order-b.sort_order);
  const score=t=>(t.make===make?2:0)+(t.post_type===postType?1:t.post_type?-9:0);
  return rs.filter(t=>score(t)>=0).sort((a,b)=>score(b)-score(a))[0]||null;
}
// 「今すぐ GPT で作る」：ChatGPT を、依頼の文が入った状態で開く（?q= の下書き）。長すぎる本文は切る
export function requestPromptText({make,media,instruction,template,title,bodyText}){
  const head=template?.content?String(template.content):`${MEDIA_LABEL[media]||''}の${REQUEST_KIND_LABEL[make]||''}の初稿を作ってください。`;
  const body=String(bodyText||'').slice(0,4000);
  return [head,instruction?`指示：${instruction}`:'',`題：${title||'（無題）'}`,`本文：\n${body}`].filter(Boolean).join('\n\n');
}
// 2026-11-12 直し：本文まで ?q= に入れると住所が 50KB を超え、ChatGPT が「Exceeded maximum HTTP header buffer size of 100KB」で開けなかった。
// ?q= には依頼の番号だけを入れ、GPT にコンテンツくんの口（content_os__list_requests）で本文と型を読ませる。全文はコピーしておき、口が使えないときの控えにする
export function requestShortPrompt({id,title}){
  return `コンテンツくんの依頼を1件作ってください。content_os__list_requests を id=${id} で呼び、返ってきた依頼の型（template.content）どおりに作り、content_os__put_result で戻してください。題：${String(title||'（無題）').slice(0,80)}`;
}
export function chatgptUrl(text){
  return 'https://chatgpt.com/?q='+encodeURIComponent(String(text).slice(0,1500));
}

// 2026-11-10 予約（kind=schedule）：Buffer に入れる依頼。GPT ではなく、こちらの 30 分ごとの見回りが入れる
export const BUFFER_ACCOUNTS=['acc_1'];
export const statusLabel=(r)=>r.kind==='schedule'&&r.status==='done'?'予約済み':(REQUEST_STATUS[r.status]||REQUEST_STATUS.queued).label;
// 予約できない理由（空なら予約できる）。parts は threadParts の返り値（{text, images}）
export function scheduleBlock(post,parts,{xLen,now=new Date()}={}){
  if(!BUFFER_ACCOUNTS.includes(post.account_id))return 'このアカウントには Buffer の窓口がありません';
  const t=post.postType||'x_post';
  if(t!=='x_post'&&t!=='x_quote')return '予約できるのは Xポストと X引用だけです';
  if(!post.datetime)return '日時を入れると予約できます（詳細タブ）';
  if(new Date(post.datetime+':00+09:00').getTime()<now.getTime()+2*60*1000)return '日時が過ぎています';
  const ps=(parts||[]).map(p=>typeof p==='string'?{text:p,images:[]}:p);
  if(!ps.length)return '本文が空です';
  if(ps.length>25)return 'スレッドが長すぎます（25 本まで）';
  if(ps.some(p=>p.localImg))return '置き場に上がっていない画像があります（貼り直してください）';
  if(ps.some(p=>p.extra))return '画像は 1 本に 4 枚までです';
  if(t==='x_quote'&&ps.length>1)return '引用はスレッドにできません（1 本にしてください）';
  if(t==='x_quote'&&ps[0].images.length)return '引用に画像は付けられません';
  if(xLen&&ps.some(p=>xLen(p.text)>280))return '280 を超えているポストがあります（日本語は 1 字 2）';
  return '';
}
