// src/constants.js
// ContentOS 定数・ユーティリティ関数
// App.jsx から切り出し (Phase 3 モノリス解消)

// ── ポータル連携設定 ──────────────────────────────────
export const PORTAL_APP_ID  = "content-os";
export const PORTAL_URL     = "https://portal.shia2n.jp";

// ── 投稿タイプ定数 ────────────────────────────────────
export const POST_TYPE = {
  x_post:    { label:"Xポスト",  color:"#1d9bf0", bg:"#e8f5fe", border:"#93d3fc", dot:"#1d9bf0" },
  x_quote:   { label:"X引用",   color:"#0ea5e9", bg:"#e0f2fe", border:"#7dd3fc", dot:"#0ea5e9" },
  x_article: { label:"X記事",   color:"#2563eb", bg:"#dbeafe", border:"#93c5fd", dot:"#2563eb" },
  note:      { label:"note",   color:"#41c9b4", bg:"#d1faf5", border:"#6ee7da", dot:"#41c9b4" },
  membership:{ label:"メンシプ", color:"#8b5cf6", bg:"#ede9fe", border:"#c4b5fd", dot:"#8b5cf6" },
  paid:      { label:"有料",    color:"#f59e0b", bg:"#fef3c7", border:"#fcd34d", dot:"#f59e0b" },
  other:     { label:"その他",  color:"#6b7280", bg:"#f3f4f6", border:"#d1d5db", dot:"#9ca3af" },
};

// ── ステータス定数 ────────────────────────────────────
export const STATUS = {
  draft:     { label:"下書き",      chip:"#f3f4f6", text:"#6b7280", border:"#d1d5db" },
  review:    { label:"レビュー待ち", chip:"#fef3c7", text:"#d97706", border:"#fcd34d" },
  waiting:   { label:"予約待ち",    chip:"#dbeafe", text:"#2563eb", border:"#93c5fd" },
  reserved:  { label:"予約済み",    chip:"#ede9fe", text:"#7c3aed", border:"#c4b5fd" },
  published: { label:"公開済",      chip:"#d1fae5", text:"#059669", border:"#6ee7b7" },
  popular:   { label:"好評",        chip:"#ffedd5", text:"#ea580c", border:"#fdba74" },
  flop:      { label:"不評",        chip:"#fee2e2", text:"#dc2626", border:"#fca5a5" },
};

// ── スコア定数 ────────────────────────────────────────
export const SCORE = {
  S:{label:"S",color:"#fff",bg:"#7c3aed",border:"#7c3aed"},
  A:{label:"A",color:"#fff",bg:"#2563eb",border:"#2563eb"},
  B:{label:"B",color:"#fff",bg:"#059669",border:"#059669"},
  C:{label:"C",color:"#fff",bg:"#d97706",border:"#d97706"},
  D:{label:"D",color:"#fff",bg:"#dc2626",border:"#dc2626"},
};

// ── UI定数 ────────────────────────────────────────────
export const DAYS   = ["月","火","水","木","金","土","日"];
export const HOURS  = Array.from({length:24},(_,i)=>i);
export const COLORS = ["#f59e0b","#3b82f6","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
export const XFONT  = "'Geist','Hiragino Sans','Noto Sans JP',sans-serif";
export const STORAGE_BUCKET = "contentos";
export const BD  = "1px solid #e0d8ce";
export const BD2 = "1px solid #e6dfd6";

// ── スタイル定数 ─────────────────────────────────────
export const S = {
  row: {display:"flex",alignItems:"center"},
  col: {display:"flex",flexDirection:"column"},
  rowC:{display:"flex",alignItems:"center",justifyContent:"center"},
  rowB:{display:"flex",alignItems:"center",justifyContent:"space-between"},
  chip:{display:"inline-flex",alignItems:"center",borderRadius:99,fontWeight:600,fontSize:11},
  inp: {border:BD,borderRadius:8,outline:"none",boxSizing:"border-box",background:"#fff",color:"#333",fontSize:13},
};

// ── その他定数 ────────────────────────────────────────
export const OVERDUE_STATUS = "reserved";

// レンダー内で再生成されないようモジュールレベルで定義
export const IMG_SIZES_OPTS  = [["small","小 (25%)"],["medium","中 (50%)"],["large","大 (75%)"],["full","全幅"]];
export const IMG_ALIGNS_OPTS = [["left","左"],["center","中央"],["right","右"]];
export const REPOST_REPEATS  = [["none","繰り返しなし"],["weekly","毎週"],["biweekly","隔週"],["monthly","毎月"],["bimonthly","2ヶ月ごと"],["quarterly","3ヶ月ごと"]];
export const SLOT_DOWS       = [[1,"月"],[2,"火"],[3,"水"],[4,"木"],[5,"金"],[6,"土"],[7,"日"]];
export const SLOT_NTHS       = [[1,"第1"],[2,"第2"],[3,"第3"],[4,"第4"]];
export const SLOT_TYPES      = [["weekly","毎週"],["daily","毎日"],["nth_weekday","第N曜日"]];
export const TOOLBAR_BLOCK_LABELS = {"p":"本文","h1":"見出し","h2":"小見出し","blockquote":"引用","li":"リスト"};

// ── ユーティリティ関数 ────────────────────────────────
export function fmtDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
export function fmtTime(s){return s?s.slice(11,16):"";}
export function slotTime(s){return s.time||(s.hour!=null?String(s.hour).padStart(2,"0")+":00":"00:00");}
export function genId(){return Date.now()*1000+Math.floor(Math.random()*1000);}
export function nowStr(){return new Date().toISOString();}
export function stripHtml(h){return (h||"").replace(/<[^>]+>/g,"");}
export function isUrl(s){try{new URL(s);return s.startsWith("http");}catch{return false;}}
export function nextDaySameTime(dt){
  const d=new Date(dt.length===16?dt+":00":dt);
  d.setDate(d.getDate()+1);
  return fmtDate(d)+"T"+dt.slice(11,16);
}
export function getWeekDates(base){
  const d=new Date(base),day=d.getDay(),mon=new Date(d);
  mon.setDate(d.getDate()+(day===0?-6:1-day));
  return Array.from({length:7},(_,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return x;});
}
export function dbToPost(p){
  const rawLinks=p.memo_links||[];
  return{...p,
    postType:p.post_type||"x_post",
    comments:p.comments||[],
    body:p.body||"",
    memo:p.memo||"",
    memoLinks:rawLinks.map(l=>typeof l==="string"?{label:"",url:l}:l),
    history:p.history||[],
    score:p.score||null,
    labels:p.labels||[],
  };
}
export function getUrlParams(){
  if(typeof window==="undefined")return{isClient:false,accountId:null};
  const p=new URLSearchParams(window.location.search);
  const accId=p.get("account");
  return{isClient:!!accId,accountId:accId};
}
