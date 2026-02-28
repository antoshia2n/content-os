import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

// ── 定数 ──────────────────────────────────────────────
const PLATFORM = {
  x:    { label: "X",       icon: "X", color: "#1d9bf0", bg: "#e8f5fe", border: "#93d3fc" },
  note: { label: "note",    icon: "n", color: "#3ea8ff", bg: "#e8f4ff", border: "#93c9fc" },
  mail: { label: "メルマガ", icon: "M", color: "#9333ea", bg: "#f3e8ff", border: "#c4b5fd" },
};

const STATUS = {
  draft:     { label: "下書き",      chip: "#f3f4f6", text: "#6b7280", border: "#d1d5db" },
  review:    { label: "レビュー待ち", chip: "#fef3c7", text: "#d97706", border: "#fcd34d" },
  waiting:   { label: "予約待ち",    chip: "#dbeafe", text: "#2563eb", border: "#93c5fd" },
  reserved:  { label: "予約済み",    chip: "#ede9fe", text: "#7c3aed", border: "#c4b5fd" },
  published: { label: "公開済",      chip: "#d1fae5", text: "#059669", border: "#6ee7b7" },
  popular:   { label: "好評",        chip: "#ffedd5", text: "#ea580c", border: "#fdba74" },
  flop:      { label: "不評",        chip: "#fee2e2", text: "#dc2626", border: "#fca5a5" },
};

const DAYS  = ["月","火","水","木","金","土","日"];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);
const COLORS = ["#f59e0b","#3b82f6","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
const XFONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fmtTime(dt) { return dt.slice(11,16); }
function genId() { return Date.now(); }
function getWeekDates(base) {
  const d = new Date(base); const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d); mon.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate()+i); return x; });
}
function getUrlParams() {
  if (typeof window === "undefined") return { isClient: false, accountId: null };
  const p = new URLSearchParams(window.location.search);
  const accId = p.get("account");
  return { isClient: !!accId, accountId: accId };
}

// ════════════════════════════════════════════════════════
// WYSIWYG 記事エディタ（組み込み用コンポーネント群）
// ════════════════════════════════════════════════════════

// ── WYSIWYGボディエディタ ──
function ArticleBodyEditor({ value, onChange, editorRef }) {
  const isComposing = useRef(false);
  const internal    = useRef(false);

  useEffect(() => {
    if (!editorRef.current || internal.current) { internal.current = false; return; }
    if (editorRef.current.innerHTML !== (value || "")) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const emit = () => {
    if (!editorRef.current) return;
    internal.current = true;
    onChange(editorRef.current.innerHTML);
  };

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      className="article-body"
      data-ph="本文を入力…"
      onCompositionStart={() => { isComposing.current = true; }}
      onCompositionEnd={()   => { isComposing.current = false; emit(); }}
      onInput={() => { if (!isComposing.current) emit(); }}
      onPaste={e => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      onKeyDown={e => {
        if (e.isComposing || isComposing.current) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          document.execCommand("insertParagraph");
        }
      }}
      style={{
        minHeight: 320, fontSize: 15, lineHeight: 1.8,
        color: "#1a1a1a", fontFamily: XFONT,
        wordBreak: "break-word", caretColor: "#1d9bf0", outline: "none",
        padding: "4px 0",
      }}
    />
  );
}

// ── 記事ツールバー ──
function ArticleToolbar({ onInsertOpen }) {
  const exec = (cmd, val) => document.execCommand(cmd, false, val ?? null);
  const Btn = ({ title, onClick, children }) => (
    <button title={title} onMouseDown={e => { e.preventDefault(); onClick(); }}
      style={{ border:"none",background:"none",color:"#666",borderRadius:5,padding:"4px 7px",cursor:"pointer",fontSize:"0.8em",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",minWidth:26,height:26,fontFamily:"inherit" }}
      onMouseEnter={e => { e.currentTarget.style.background="#f2ede6"; e.currentTarget.style.color="#1a1a1a"; }}
      onMouseLeave={e => { e.currentTarget.style.background="none"; e.currentTarget.style.color="#666"; }}>
      {children}
    </button>
  );
  const Sep = () => <div style={{ width:1,height:16,background:"#e0d8ce",margin:"0 2px" }} />;

  return (
    <div style={{ display:"flex",alignItems:"center",gap:1,padding:"5px 10px",borderBottom:"1px solid #e8e0d6",background:"#faf7f3",flexWrap:"wrap",flexShrink:0 }}>
      <select onChange={e => { exec("formatBlock", e.target.value); e.target.value=""; }} defaultValue=""
        style={{ border:"1px solid #e0d8ce",borderRadius:5,padding:"2px 6px",fontSize:"0.75em",color:"#1a1a1a",background:"#fff",cursor:"pointer",fontFamily:"inherit",fontWeight:500,height:26 }}>
        <option value="" disabled>形式</option>
        <option value="p">本文</option>
        <option value="h1">見出し</option>
        <option value="h2">小見出し</option>
        <option value="blockquote">引用</option>
      </select>
      <Sep/>
      <Btn title="太字" onClick={() => exec("bold")}><strong style={{fontSize:"0.9em"}}>B</strong></Btn>
      <Btn title="斜体" onClick={() => exec("italic")}><em style={{fontSize:"0.9em"}}>I</em></Btn>
      <Btn title="取り消し線" onClick={() => exec("strikeThrough")}><span style={{textDecoration:"line-through",fontSize:"0.9em"}}>S</span></Btn>
      <Sep/>
      <Btn title="箇条書き" onClick={() => exec("insertUnorderedList")}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="1.5" cy="3" r="1.5"/><rect x="4" y="2" width="10" height="2" rx="1"/>
          <circle cx="1.5" cy="7" r="1.5"/><rect x="4" y="6" width="10" height="2" rx="1"/>
          <circle cx="1.5" cy="11" r="1.5"/><rect x="4" y="10" width="10" height="2" rx="1"/>
        </svg>
      </Btn>
      <Btn title="番号付きリスト" onClick={() => exec("insertOrderedList")}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
          <text x="0" y="4.5" fontSize="4.5" fontWeight="bold">1.</text><rect x="5" y="2.5" width="9" height="2" rx="1"/>
          <text x="0" y="8.5" fontSize="4.5" fontWeight="bold">2.</text><rect x="5" y="6.5" width="9" height="2" rx="1"/>
          <text x="0" y="12.5" fontSize="4.5" fontWeight="bold">3.</text><rect x="5" y="10.5" width="9" height="2" rx="1"/>
        </svg>
      </Btn>
      <Sep/>
      <Btn title="リンク" onClick={() => { const u = prompt("URL:"); if(u) exec("createLink",u); }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
      </Btn>
      <Btn title="区切り線" onClick={() => exec("insertHorizontalRule")}>—</Btn>
      <button onMouseDown={e => e.preventDefault()} onClick={onInsertOpen}
        style={{ border:"1px solid #e0d8ce",background:"none",color:"#666",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:"0.73em",fontWeight:600,height:26,display:"flex",alignItems:"center",gap:3,fontFamily:"inherit",marginLeft:2 }}
        onMouseEnter={e => { e.currentTarget.style.background="#f2ede6"; e.currentTarget.style.color="#1a1a1a"; }}
        onMouseLeave={e => { e.currentTarget.style.background="none"; e.currentTarget.style.color="#666"; }}>
        + 挿入
      </button>
      <Btn title="書式クリア" onClick={() => exec("removeFormat")}>✕</Btn>
      <div style={{ marginLeft:"auto",display:"flex",gap:8,fontSize:"0.62em",color:"#bbb",alignItems:"center" }}>
        <span>Enter = 段落</span>
        <span>⇧Enter = 改行</span>
      </div>
    </div>
  );
}

// ── 挿入モーダル ──
function ArticleInsertModal({ onClose, savedRange, bodyRef }) {
  const [tab, setTab]         = useState("image");
  const [postUrl, setPostUrl] = useState("");
  const fileRef = useRef(null);

  const insertAtCursor = (html) => {
    const editor = bodyRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (savedRange) { sel.removeAllRanges(); sel.addRange(savedRange); }
    document.execCommand("insertHTML", false, html);
  };

  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      insertAtCursor(`<p><img src="${ev.target.result}" alt="${file.name}" style="max-width:100%;border-radius:8px;display:block;" /></p>`);
      onClose();
    };
    reader.readAsDataURL(file);
  };

  const handleInsertPost = () => {
    const url = postUrl.trim();
    if (!url) return;
    const isArticle = /\/articles\/|note\.com/.test(url);
    const icon = isArticle ? "📄" : "𝕏";
    const card = `<div style="border:1.5px solid #e8e0d6;border-radius:10px;padding:10px 14px;margin:.6em 0;background:#faf7f3;display:flex;align-items:center;gap:10px;" contenteditable="false"><span>${icon}</span><a href="${url}" target="_blank" style="color:#1d9bf0;text-decoration:none;font-size:13px;word-break:break-all;">${url}</a></div><p><br></p>`;
    insertAtCursor(card);
    onClose();
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}
      onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"#fff",border:"2px solid #e8e0d6",borderRadius:14,width:"100%",maxWidth:420,boxShadow:"0 20px 60px #00000020",overflow:"hidden" }}>
        <div style={{ display:"flex",borderBottom:"1px solid #e8e0d6" }}>
          {[["image","🖼 画像"],["post","𝕏 ポスト/記事"]].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex:1,border:"none",background:"none",padding:"12px 0",fontWeight:tab===t?700:500,
              color:tab===t?"#f59e0b":"#999",borderBottom:tab===t?"2px solid #f59e0b":"2px solid transparent",
              cursor:"pointer",fontSize:"0.82em",fontFamily:"inherit",
            }}>{l}</button>
          ))}
        </div>
        <div style={{ padding:"18px 18px 8px" }}>
          {tab === "image" && (
            <>
              <div style={{ fontSize:"0.78em",color:"#888",marginBottom:12,lineHeight:1.6 }}>カーソル位置に画像を挿入します。</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageFile} />
              <button onClick={() => fileRef.current?.click()}
                style={{ width:"100%",border:"2px dashed #e0d8ce",background:"#faf7f3",borderRadius:9,padding:"28px 0",cursor:"pointer",color:"#aaa",fontSize:"0.84em",fontWeight:600,fontFamily:"inherit" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0d8ce";e.currentTarget.style.color="#aaa";}}>
                📁 クリックして画像を選択
              </button>
            </>
          )}
          {tab === "post" && (
            <>
              <div style={{ fontSize:"0.78em",color:"#888",marginBottom:10,lineHeight:1.6 }}>カーソル位置に埋め込みカードを挿入します。</div>
              <input value={postUrl} onChange={e => setPostUrl(e.target.value)} placeholder="https://x.com/..."
                style={{ width:"100%",border:"1.5px solid #e0d8ce",borderRadius:7,padding:"9px 11px",fontSize:"0.82em",fontFamily:"inherit",color:"#1a1a1a",marginBottom:10,outline:"none",boxSizing:"border-box" }}
                onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#e0d8ce"}
                onKeyDown={e => { if(e.key==="Enter") handleInsertPost(); }} />
              <button onClick={handleInsertPost} disabled={!postUrl.trim()}
                style={{ width:"100%",background:postUrl.trim()?"#f59e0b":"#f2ede6",color:postUrl.trim()?"#fff":"#bbb",border:"none",borderRadius:20,padding:"9px 0",fontWeight:700,fontSize:"0.82em",cursor:postUrl.trim()?"pointer":"default",fontFamily:"inherit" }}>
                カーソル位置に挿入
              </button>
            </>
          )}
        </div>
        <div style={{ padding:"10px 18px 16px" }}>
          <button onClick={onClose} style={{ width:"100%",border:"1px solid #e0d8ce",background:"none",color:"#888",borderRadius:7,padding:"7px",fontWeight:500,fontSize:"0.8em",cursor:"pointer",fontFamily:"inherit" }}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ── コピーヘルパー ──
function buildArticleHtml(title, body) {
  return (title ? `<h1>${title}</h1>` : "") + (body || "");
}
function copyRichText(html, plain, onDone) {
  try {
    navigator.clipboard.write([new ClipboardItem({
      "text/html":  new Blob([html],  { type:"text/html" }),
      "text/plain": new Blob([plain], { type:"text/plain" }),
    })]).then(onDone).catch(() => fallbackCopy(html, onDone));
  } catch(e) { fallbackCopy(html, onDone); }
}
function fallbackCopy(html, onDone) {
  const div = document.createElement("div");
  div.innerHTML = html; div.style.cssText = "position:fixed;left:-9999px;top:0;white-space:pre-wrap";
  document.body.appendChild(div);
  const range = document.createRange(); range.selectNodeContents(div);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  try { document.execCommand("copy"); } catch(e) {}
  sel.removeAllRanges(); document.body.removeChild(div); onDone?.();
}

// ════════════════════════════════════════════════════════
// メインアプリ
// ════════════════════════════════════════════════════════
export default function App() {
  const { isClient, accountId: urlAccountId } = getUrlParams();
  const isAdmin = !isClient;

  const [accounts,            setAccounts]            = useState([]);
  const [allPosts,            setAllPosts]            = useState({});
  const [activeAccId,         setActiveAccId]         = useState(urlAccountId || null);
  const [view,                setView]                = useState("calendar");
  const [week,                setWeek]                = useState(new Date());
  const [selected,            setSelected]            = useState(null);
  const [editing,             setEditing]             = useState(null);
  const [filterStatus,        setFilter]              = useState("all");
  const [showShare,           setShowShare]           = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [toast,               setToast]               = useState(null);
  const [loading,             setLoading]             = useState(true);

  const today     = fmtDate(new Date());
  const weekDates = getWeekDates(week);
  const activeAcc = accounts.find(a => a.id === activeAccId);
  const posts     = allPosts[activeAccId] || [];
  const filtered  = filterStatus === "all" ? posts : posts.filter(p => p.status === filterStatus);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: accs } = await supabase.from("accounts").select("*").order("created_at");
      if (accs && accs.length > 0) {
        setAccounts(accs);
        const firstId = urlAccountId || accs[0].id;
        setActiveAccId(firstId);
        const targetIds = isClient ? [firstId] : accs.map(a => a.id);
        const { data: ps } = await supabase.from("posts").select("*").in("account_id", targetIds);
        if (ps) {
          const grouped = {};
          ps.forEach(p => {
            if (!grouped[p.account_id]) grouped[p.account_id] = [];
            grouped[p.account_id].push(dbToPost(p));
          });
          setAllPosts(grouped);
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  function dbToPost(p) {
    return { ...p, threads: p.threads || [], comments: p.comments || [], body: p.body || "" };
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function save(p) {
    const record = {
      id: p.id, account_id: activeAccId, title: p.title,
      status: p.status, platform: p.platform, datetime: p.datetime,
      threads: p.threads, memo: p.memo, comments: p.comments,
      body: p.body || "",
    };
    const { error } = await supabase.from("posts").upsert(record);
    if (error) { showToast("保存に失敗しました"); return; }
    setAllPosts(prev => {
      const cur = prev[activeAccId] || [];
      const exists = cur.find(x => x.id === p.id);
      return { ...prev, [activeAccId]: exists ? cur.map(x => x.id===p.id ? p : x) : [...cur, p] };
    });
    setEditing(null); setSelected(p);
    showToast("保存しました");
  }

  async function del(id) {
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) { showToast("削除に失敗しました"); return; }
    setAllPosts(prev => ({ ...prev, [activeAccId]: (prev[activeAccId]||[]).filter(p=>p.id!==id) }));
    setSelected(null); showToast("削除しました");
  }

  async function changeStatus(id, s) {
    const { error } = await supabase.from("posts").update({ status: s }).eq("id", id);
    if (error) { showToast("更新に失敗しました"); return; }
    setAllPosts(prev => ({ ...prev, [activeAccId]: (prev[activeAccId]||[]).map(p=>p.id===id?{...p,status:s}:p) }));
    setSelected(prev => prev && prev.id===id ? { ...prev, status:s } : prev);
  }

  async function addComment(id, c) {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    const newComments = [...post.comments, c];
    const { error } = await supabase.from("posts").update({ comments: newComments }).eq("id", id);
    if (error) { showToast("コメントの保存に失敗しました"); return; }
    setAllPosts(prev => ({ ...prev, [activeAccId]: (prev[activeAccId]||[]).map(p=>p.id===id?{...p,comments:newComments}:p) }));
    setSelected(prev => prev && prev.id===id ? { ...prev, comments:newComments } : prev);
  }

  async function addAccount() {
    const id = "acc_" + Date.now();
    const acc = { id, name: "新規クライアント", handle: "@handle", color: "#6b7280" };
    const { error } = await supabase.from("accounts").insert(acc);
    if (error) { showToast("追加に失敗しました"); return; }
    setAccounts(prev => [...prev, acc]);
    setAllPosts(prev => ({ ...prev, [id]: [] }));
    setActiveAccId(id); setShowAccountSettings(true);
  }

  async function updateAccount(id, fields) {
    const { error } = await supabase.from("accounts").update(fields).eq("id", id);
    if (error) { showToast("更新に失敗しました"); return; }
    setAccounts(prev => prev.map(a => a.id===id ? { ...a, ...fields } : a));
  }

  async function deleteAccount(id) {
    if (accounts.length <= 1) { showToast("最後のアカウントは削除できません"); return; }
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) { showToast("削除に失敗しました"); return; }
    setAccounts(prev => prev.filter(a=>a.id!==id));
    setAllPosts(prev => { const n={...prev}; delete n[id]; return n; });
    setActiveAccId(accounts.find(a=>a.id!==id).id);
  }

  function copyShareLink(accId) {
    const base = window.location.href.split("?")[0];
    const url = `${base}?account=${accId}`;
    navigator.clipboard.writeText(url).then(()=>showToast("共有リンクをコピーしました")).catch(()=>showToast("コピー完了"));
  }

  function openNew(datetime) {
    setEditing({ id: genId(), title: "", status: "draft", platform: "x", datetime: datetime||`${today}T07:00`, threads: [""], memo: "", comments: [], body: "" });
  }

  const postsBySlot = {};
  filtered.forEach(p => {
    const key = `${p.datetime.slice(0,10)}_${p.datetime.slice(11,13)}`;
    (postsBySlot[key] = postsBySlot[key] || []).push(p);
  });

  if (loading) return (
    <div style={{ height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f2ede6",fontFamily:"'Hiragino Sans', sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:20,fontWeight:900,color:"#1a1a1a",marginBottom:8 }}>Content<span style={{color:"#f59e0b"}}>OS</span></div>
        <div style={{ fontSize:13,color:"#aaa" }}>読み込み中…</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily:"'Hiragino Sans','Noto Sans JP',sans-serif",background:"#f2ede6",minHeight:"100vh",color:"#1a1a1a" }}>
      {/* WYSIWYG グローバルCSS */}
      <style>{`
        .article-body{outline:none;}
        .article-body:empty:before,.article-body[data-ph]:empty:before{content:attr(data-ph);color:#bbb;pointer-events:none;}
        .article-body p{font-size:15px;line-height:1.8;color:#1a1a1a;margin:0 0 1.3em;}
        .article-body p:last-child{margin-bottom:0;}
        .article-body br{display:block;height:0;}
        .article-body h1{font-size:22px;font-weight:800;line-height:1.3;margin:1.2em 0 .5em;color:#1a1a1a;}
        .article-body h2{font-size:18px;font-weight:700;line-height:1.4;margin:1em 0 .4em;color:#1a1a1a;}
        .article-body ul{list-style:disc;padding-left:1.5em;margin:.6em 0 1.2em;}
        .article-body ol{list-style:decimal;padding-left:1.5em;margin:.6em 0 1.2em;}
        .article-body li{font-size:15px;line-height:1.8;color:#1a1a1a;margin:.1em 0;}
        .article-body blockquote{border-left:3px solid #e0d8ce;padding:4px 0 4px 14px;margin:.8em 0 1.2em;color:#888;font-style:italic;font-size:15px;line-height:1.8;}
        .article-body a{color:#1d9bf0;text-decoration:underline;}
        .article-body hr{border:none;border-top:1px solid #e8e0d6;margin:1.5em 0;}
        .article-body strong,.article-body b{font-weight:700;}
        .article-body em,.article-body i{font-style:italic;}
        .article-body s{text-decoration:line-through;}
        .article-body img{max-width:100%;border-radius:8px;margin:.6em 0;display:block;}
      `}</style>

      {/* Header */}
      <div style={{ background:"#fff",borderBottom:"2px solid #e8e0d6",padding:"0 18px",display:"flex",alignItems:"center",gap:12,height:54,boxShadow:"0 1px 4px #0000000a" }}>
        <span style={{ fontWeight:900,fontSize:17,letterSpacing:"-0.5px",flexShrink:0 }}>
          Content<span style={{color:"#f59e0b"}}>OS</span>
        </span>

        {isAdmin && (
          <div style={{ display:"flex",gap:3,background:"#f2ede6",borderRadius:10,padding:3,overflow:"auto",maxWidth:560 }}>
            {accounts.map(acc => (
              <button key={acc.id} onClick={() => { setActiveAccId(acc.id); setSelected(null); }}
                style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:activeAccId===acc.id?"#fff":"transparent",color:activeAccId===acc.id?"#1a1a1a":"#aaa",boxShadow:activeAccId===acc.id?"0 1px 4px #0000001a":"none",whiteSpace:"nowrap" }}>
                <span style={{ width:7,height:7,borderRadius:"50%",background:activeAccId===acc.id?acc.color:"#ddd",display:"inline-block" }} />
                {acc.name}
              </button>
            ))}
            <button onClick={addAccount}
              style={{ padding:"5px 10px",borderRadius:7,border:"1px dashed #ccc",cursor:"pointer",fontSize:12,background:"transparent",color:"#bbb",whiteSpace:"nowrap" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#ccc";e.currentTarget.style.color="#bbb";}}>
              + 追加
            </button>
          </div>
        )}

        {isClient && (
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:activeAcc&&activeAcc.color,display:"inline-block" }} />
            <span style={{ fontWeight:700,fontSize:14 }}>{activeAcc&&activeAcc.name}</span>
            <span style={{ fontSize:11,color:"#3ea8ff",background:"#e8f4ff",border:"1px solid #93c9fc",padding:"2px 8px",borderRadius:10 }}>共有リンク</span>
          </div>
        )}

        <div style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:7 }}>
          <TabBar value={view} onChange={setView} tabs={[{value:"calendar",label:"カレンダー"},{value:"list",label:"リスト"}]} />
          <select value={filterStatus} onChange={e=>setFilter(e.target.value)}
            style={{ background:"#f8f4ef",border:"1.5px solid #e0d8ce",borderRadius:7,padding:"5px 9px",fontSize:12,color:"#666",outline:"none",cursor:"pointer" }}>
            <option value="all">すべてのステータス</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          {isAdmin && (
            <>
              <Btn onClick={()=>setShowAccountSettings(true)}>設定</Btn>
              <div style={{ position:"relative" }}>
                <Btn onClick={()=>setShowShare(s=>!s)}>共有</Btn>
                {showShare && (
                  <div style={{ position:"absolute",right:0,top:"calc(100% + 8px)",background:"#fff",border:"1.5px solid #e8e0d6",borderRadius:12,padding:16,zIndex:50,width:300,boxShadow:"0 8px 24px #0000001a" }}>
                    <div style={{ fontSize:13,fontWeight:800,marginBottom:6 }}>クライアント共有リンク</div>
                    <div style={{ fontSize:12,color:"#888",marginBottom:12,lineHeight:1.6 }}>リンクを送ると編集・コメント・投稿が可能です。</div>
                    {accounts.map(acc => (
                      <div key={acc.id} style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"8px 10px",background:"#faf7f3",borderRadius:8,border:"1px solid #e8e0d6" }}>
                        <span style={{ width:7,height:7,borderRadius:"50%",background:acc.color,flexShrink:0 }} />
                        <span style={{ fontSize:13,fontWeight:700,flex:1 }}>{acc.name}</span>
                        <button onClick={()=>copyShareLink(acc.id)}
                          style={{ background:"#f59e0b",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer" }}>
                          コピー
                        </button>
                      </div>
                    ))}
                    <Btn onClick={()=>setShowShare(false)} style={{width:"100%",marginTop:4}}>閉じる</Btn>
                  </div>
                )}
              </div>
            </>
          )}
          <Btn primary onClick={()=>openNew()}>+ 新規作成</Btn>
        </div>
      </div>

      {/* Week Nav */}
      {view === "calendar" && (
        <div style={{ background:"#fff",borderBottom:"1px solid #e8e0d6",padding:"6px 18px",display:"flex",alignItems:"center",gap:9 }}>
          {activeAcc && <span style={{ width:8,height:8,borderRadius:"50%",background:activeAcc.color,display:"inline-block" }} />}
          <span style={{ fontWeight:800,fontSize:13,color:"#444" }}>{activeAcc&&activeAcc.name}</span>
          <Btn onClick={()=>{const d=new Date(week);d.setDate(d.getDate()-7);setWeek(d);}}>‹</Btn>
          <span style={{ fontWeight:700,fontSize:13,minWidth:170,textAlign:"center",color:"#555" }}>
            {weekDates[0].getMonth()+1}月{weekDates[0].getDate()}日 〜 {weekDates[6].getMonth()+1}月{weekDates[6].getDate()}日
          </span>
          <Btn onClick={()=>{const d=new Date(week);d.setDate(d.getDate()+7);setWeek(d);}}>›</Btn>
          <Btn onClick={()=>setWeek(new Date())}>今週</Btn>
          <div style={{ marginLeft:"auto",display:"flex",gap:5 }}>
            {Object.entries(PLATFORM).map(([k,v])=>(
              <span key={k} style={{ fontSize:11,color:v.color,background:v.bg,border:`1px solid ${v.border}`,padding:"2px 9px",borderRadius:20,fontWeight:700 }}>{v.icon} {v.label}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:"flex" }}>
        {view === "calendar" && (
          <div style={{ flex:1,overflowX:"auto",overflowY:"auto",maxHeight:"calc(100vh - 112px)" }}>
            <div style={{ display:"grid",gridTemplateColumns:"48px repeat(7, 1fr)",minWidth:860 }}>
              <div style={{ background:"#fff",position:"sticky",top:0,zIndex:20,borderRight:"1px solid #e8e0d6",borderBottom:"2px solid #e8e0d6" }} />
              {weekDates.map((date,i) => {
                const isToday = fmtDate(date) === today;
                const cnt = filtered.filter(p=>p.datetime.startsWith(fmtDate(date))).length;
                return (
                  <div key={i} style={{ background:"#fff",padding:"7px 5px 5px",textAlign:"center",borderBottom:"2px solid #e8e0d6",borderRight:"1px solid #e8e0d6",position:"sticky",top:0,zIndex:20 }}>
                    <div style={{ fontSize:11,fontWeight:700,color:isToday?"#f59e0b":i>=5?"#ef4444":"#9ca3af" }}>{DAYS[i]}</div>
                    <div style={{ width:29,height:29,borderRadius:"50%",background:isToday?"#f59e0b":"transparent",display:"flex",alignItems:"center",justifyContent:"center",margin:"2px auto",fontSize:14,fontWeight:800,color:isToday?"#fff":"#1a1a1a" }}>{date.getDate()}</div>
                    {cnt > 0 && <div style={{ fontSize:10,color:"#f59e0b",fontWeight:700 }}>{cnt}件</div>}
                  </div>
                );
              })}
              {HOURS.map(hour => (
                <>
                  <div key={"h"+hour} style={{ borderTop:"1px solid #ede8e0",padding:"3px 5px 0",fontSize:10,color:"#c8bfb4",textAlign:"right",background:"#faf7f3",borderRight:"1px solid #e8e0d6" }}>{hour}:00</div>
                  {weekDates.map((date,di) => {
                    const key = fmtDate(date)+"_"+String(hour).padStart(2,"0");
                    const sp = postsBySlot[key] || [];
                    const isEmpty = sp.length === 0;
                    return (
                      <div key={hour+"-"+di}
                        onClick={isAdmin&&isEmpty?()=>openNew(`${fmtDate(date)}T${String(hour).padStart(2,"0")}:00`):undefined}
                        style={{ borderTop:"1px solid #ede8e0",borderRight:"1px solid #e8e0d6",padding:"3px 3px",minHeight:40,background:fmtDate(date)===today?"#fffcf5":"#fff",cursor:isAdmin&&isEmpty?"pointer":"default",transition:"background 0.1s" }}
                        onMouseEnter={isAdmin&&isEmpty?e=>{e.currentTarget.style.background=fmtDate(date)===today?"#fff8e8":"#faf7f3";}:undefined}
                        onMouseLeave={isAdmin&&isEmpty?e=>{e.currentTarget.style.background=fmtDate(date)===today?"#fffcf5":"#fff";}:undefined}>
                        {isEmpty ? null : sp.length===1
                          ? <CalCard post={sp[0]} onClick={()=>setSelected(sp[0])} />
                          : <MultiSlot posts={sp} onSelect={setSelected} />
                        }
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        )}

        {view === "list" && (
          <div style={{ flex:1,padding:20,overflowY:"auto",maxHeight:"calc(100vh - 56px)" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
              {activeAcc && <span style={{ width:8,height:8,borderRadius:"50%",background:activeAcc.color,display:"inline-block" }} />}
              <span style={{ fontWeight:800,fontSize:14 }}>{activeAcc&&activeAcc.name} の投稿</span>
              <span style={{ fontSize:12,color:"#aaa" }}>{filtered.length}件</span>
            </div>
            {Object.entries(STATUS).map(([sk]) => {
              const grp = filtered.filter(p=>p.status===sk);
              if (!grp.length) return null;
              return (
                <div key={sk} style={{ marginBottom:22 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:9 }}>
                    <StatusChip status={sk} />
                    <span style={{ fontSize:11,color:"#bbb" }}>{grp.length}件</span>
                  </div>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(295px,1fr))",gap:9 }}>
                    {grp.sort((a,b)=>a.datetime.localeCompare(b.datetime)).map(p=>(
                      <ListCard key={p.id} post={p} onClick={()=>setSelected(p)} />
                    ))}
                  </div>
                </div>
              );
            })}
            {filtered.length===0 && <div style={{ textAlign:"center",color:"#ccc",padding:60,fontSize:13 }}>投稿がありません</div>}
          </div>
        )}

        {selected && (
          <DetailPanel post={selected} isAdmin={true}
            onClose={()=>setSelected(null)}
            onEdit={p=>setEditing({...p,threads:[...p.threads]})}
            onDelete={del}
            onStatusChange={changeStatus}
            onAddComment={addComment}
          />
        )}
      </div>

      {editing && <EditorModal post={editing} onChange={setEditing} onSave={save} onClose={()=>setEditing(null)} />}
      {showAccountSettings && isAdmin && (
        <AccountSettings accounts={accounts} onUpdate={updateAccount} onDelete={deleteAccount} onAdd={addAccount} onCopyLink={copyShareLink} onClose={()=>setShowAccountSettings(false)} />
      )}

      {toast && (
        <div style={{ position:"fixed",bottom:22,left:"50%",transform:"translateX(-50%)",background:"#1a1a1a",color:"#fff",padding:"9px 20px",borderRadius:24,fontSize:13,fontWeight:600,zIndex:500,boxShadow:"0 4px 16px #00000033",whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// エディタモーダル（記事エディタタブ統合版）
// ════════════════════════════════════════════════════════
function EditorModal({ post, onChange, onSave, onClose }) {
  const refs = useRef([]);
  const pc   = PLATFORM[post.platform];

  // 記事エディタ用
  const [editorTab,  setEditorTab]  = useState("threads"); // "threads" | "article"
  const [copyX,      setCopyX]      = useState(false);
  const [copyNote,   setCopyNote]   = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [savedRange, setSavedRange] = useState(null);
  const bodyEditorRef = useRef(null);
  const articleAreaRef = useRef(null);

  useEffect(() => {
    refs.current.forEach(el => { if(el){ el.style.height="auto"; el.style.height=el.scrollHeight+"px"; } });
  }, [post.threads]);

  function addThread() { onChange(p=>({...p,threads:[...p.threads,""]})); }
  function updThread(i,v) { onChange(p=>{ const t=[...p.threads]; t[i]=v; return {...p,threads:t}; }); }
  function delThread(i) { onChange(p=>({...p,threads:p.threads.filter((_,j)=>j!==i)})); }

  const openInsert = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (bodyEditorRef.current?.contains(range.commonAncestorContainer)) {
        setSavedRange(range.cloneRange());
      } else { setSavedRange(null); }
    } else { setSavedRange(null); }
    setInsertOpen(true);
  };

  const doCopy = (target) => {
    const html  = buildArticleHtml(post.title, post.body);
    const plain = articleAreaRef.current?.innerText || "";
    copyRichText(html, plain, () => {
      if (target==="x") { setCopyX(true); setTimeout(()=>setCopyX(false),3500); }
      else               { setCopyNote(true); setTimeout(()=>setCopyNote(false),3500); }
    });
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"#00000066",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
      {insertOpen && <ArticleInsertModal onClose={()=>setInsertOpen(false)} savedRange={savedRange} bodyRef={bodyEditorRef} />}

      <div style={{ background:"#fff",border:"2px solid #e8e0d6",borderRadius:17,width:"100%",maxWidth:980,maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000025" }}>

        {/* ヘッダー */}
        <div style={{ padding:"13px 22px",borderBottom:"1px solid #e8e0d6",display:"flex",alignItems:"center",justifyContent:"space-between",background:pc.bg }}>
          <span style={{ fontSize:15,fontWeight:900 }}>投稿エディタ</span>
          <div style={{ display:"flex",gap:7 }}>
            <Btn primary onClick={()=>{ if(!post.title.trim()){alert("タイトルを入力してください");return;} onSave(post); }}>保存</Btn>
            <Btn onClick={onClose}>キャンセル</Btn>
          </div>
        </div>

        <div style={{ flex:1,overflowY:"auto",display:"flex" }}>
          {/* 左パネル：メタ情報 */}
          <div style={{ width:265,borderRight:"1px solid #e8e0d6",padding:17,display:"flex",flexDirection:"column",gap:13,flexShrink:0,background:"#faf7f3" }}>
            <Fld label="タイトル（管理用）">
              <input value={post.title} onChange={e=>onChange(p=>({...p,title:e.target.value}))} placeholder="管理用タイトル" style={INP} />
            </Fld>
            <Fld label="プラットフォーム">
              <div style={{ display:"flex",gap:5 }}>
                {Object.entries(PLATFORM).map(([k,v])=>(
                  <button key={k} onClick={()=>onChange(p=>({...p,platform:k}))}
                    style={{ flex:1,padding:"7px 3px",borderRadius:8,border:"1.5px solid "+(post.platform===k?v.color:"#e0d8ce"),background:post.platform===k?v.bg:"#fff",color:post.platform===k?v.color:"#bbb",fontSize:12,cursor:"pointer",fontWeight:post.platform===k?800:400 }}>
                    {v.icon}<br/><span style={{fontSize:10}}>{v.label}</span>
                  </button>
                ))}
              </div>
            </Fld>
            <Fld label="投稿日時">
              <input type="datetime-local" value={post.datetime} onChange={e=>onChange(p=>({...p,datetime:e.target.value}))} style={INP} />
            </Fld>
            <Fld label="ステータス">
              <select value={post.status} onChange={e=>onChange(p=>({...p,status:e.target.value}))} style={{...INP,color:STATUS[post.status].text}}>
                {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </Fld>
            <Fld label="概要メモ">
              <textarea value={post.memo} onChange={e=>onChange(p=>({...p,memo:e.target.value}))} placeholder="執筆の意図・注意点など" rows={5} style={{...INP,resize:"vertical",lineHeight:1.7}} />
            </Fld>
            {post.comments.length > 0 && (
              <Fld label={"コメント（"+post.comments.length+"）"}>
                <div style={{ display:"flex",flexDirection:"column",gap:4,maxHeight:130,overflowY:"auto" }}>
                  {post.comments.map((c,i)=><div key={i} style={{ background:"#fff",border:"1px solid #e8e0d6",borderRadius:5,padding:"5px 9px",fontSize:11,color:"#555" }}>{c}</div>)}
                </div>
              </Fld>
            )}
          </div>

          {/* 右パネル：タブ切り替え */}
          <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>

            {/* タブバー */}
            <div style={{ display:"flex",borderBottom:"2px solid #e8e0d6",background:"#fff",flexShrink:0 }}>
              <button onClick={()=>setEditorTab("threads")}
                style={{ padding:"11px 22px",border:"none",background:"none",fontWeight:editorTab==="threads"?800:500,color:editorTab==="threads"?"#1a1a1a":"#aaa",borderBottom:editorTab==="threads"?"2px solid #f59e0b":"2px solid transparent",cursor:"pointer",fontSize:13,fontFamily:"inherit",marginBottom:-2 }}>
                スレッド <span style={{ fontSize:11,color:"#bbb",fontWeight:400 }}>({post.threads.length}件)</span>
              </button>
              <button onClick={()=>setEditorTab("article")}
                style={{ padding:"11px 22px",border:"none",background:"none",fontWeight:editorTab==="article"?800:500,color:editorTab==="article"?"#1a1a1a":"#aaa",borderBottom:editorTab==="article"?"2px solid #1d9bf0":"2px solid transparent",cursor:"pointer",fontSize:13,fontFamily:"inherit",marginBottom:-2 }}>
                記事エディタ
                {post.body ? <span style={{ marginLeft:5,fontSize:10,background:"#1d9bf0",color:"#fff",borderRadius:10,padding:"1px 6px",fontWeight:700 }}>●</span> : null}
              </button>

              {/* 記事タブ選択時：コピーボタン */}
              {editorTab === "article" && (
                <div style={{ marginLeft:"auto",display:"flex",gap:6,alignItems:"center",paddingRight:14 }}>
                  <button onClick={()=>doCopy("note")}
                    style={{ background:copyNote?"#00ba7c":"#41c9b4",color:"#fff",border:"none",borderRadius:16,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap" }}>
                    {copyNote?"✅ コピー完了！":"note にコピー"}
                  </button>
                  <button onClick={()=>doCopy("x")}
                    style={{ background:copyX?"#00ba7c":"#1d9bf0",color:"#fff",border:"none",borderRadius:16,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap" }}>
                    {copyX?"✅ コピー完了！":"𝕏 にコピー"}
                  </button>
                </div>
              )}
            </div>

            {/* ── スレッドタブ ── */}
            {editorTab === "threads" && (
              <div style={{ flex:1,overflowY:"auto",padding:22 }}>
                <div style={{ fontSize:12,color:"#aaa",fontWeight:700,marginBottom:14 }}>スレッド編集（{post.threads.length}件）</div>
                {post.threads.map((thread,i)=>(
                  <div key={i} style={{ display:"flex",gap:11,marginBottom:4 }}>
                    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0 }}>
                      <div style={{ width:36,height:36,borderRadius:"50%",background:pc.bg,border:"2px solid "+pc.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:pc.color,fontWeight:800 }}>{pc.icon}</div>
                      {i < post.threads.length-1 && <div style={{ width:2,flex:1,background:"#e8e0d6",margin:"3px 0" }} />}
                    </div>
                    <div style={{ flex:1,background:"#faf7f3",border:"1.5px solid "+pc.border,borderRadius:12,padding:"11px 14px",marginBottom:8 }}>
                      <div style={{ fontSize:10,color:"#bbb",marginBottom:5 }}>ポスト {i+1}</div>
                      <textarea ref={el=>refs.current[i]=el} value={thread}
                        onChange={e=>{ updThread(i,e.target.value); e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; }}
                        placeholder={i===0?"最初のポストを書く…":"続きを書く…"}
                        style={{ width:"100%",background:"transparent",border:"none",color:"#1a1a1a",fontSize:14,outline:"none",resize:"none",lineHeight:1.8,minHeight:100,boxSizing:"border-box",fontFamily:"inherit" }}
                      />
                      <div style={{ display:"flex",justifyContent:"space-between",borderTop:"1px solid #e8e0d6",paddingTop:5,marginTop:4 }}>
                        <span style={{ fontSize:11,color:thread.length>130?"#f59e0b":"#ccc" }}>{thread.length} 文字</span>
                        {post.threads.length > 1 && <button onClick={()=>delThread(i)} style={{ background:"transparent",border:"none",color:"#f87171",cursor:"pointer",fontSize:12 }}>削除</button>}
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addThread}
                  style={{ marginLeft:47,background:"#fff",border:"2px dashed #e0d8ce",borderRadius:9,padding:"8px 16px",color:"#bbb",cursor:"pointer",fontSize:13,transition:"all 0.15s" }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=pc.color;e.currentTarget.style.color=pc.color;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0d8ce";e.currentTarget.style.color="#bbb";}}>
                  + ポストを追加
                </button>
              </div>
            )}

            {/* ── 記事エディタタブ ── */}
            {editorTab === "article" && (
              <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
                {/* 記事ツールバー */}
                <ArticleToolbar onInsertOpen={openInsert} />

                {/* 編集エリア */}
                <div style={{ flex:1,overflowY:"auto",background:"#fff" }}>
                  <div ref={articleAreaRef} style={{ maxWidth:640,margin:"0 auto",padding:"28px 36px 80px" }}>
                    {/* タイトル表示（左パネルの管理用タイトルを流用） */}
                    <div style={{ fontSize:22,fontWeight:800,lineHeight:1.25,color:"#1a1a1a",marginBottom:20,paddingBottom:20,borderBottom:"1px solid #e8e0d6",fontFamily:XFONT,opacity: post.title ? 1 : 0.3 }}>
                      {post.title || "（タイトルを左パネルで入力）"}
                    </div>
                    {/* WYSIWYG本文 */}
                    <ArticleBodyEditor
                      value={post.body}
                      onChange={body => onChange(p => ({...p, body}))}
                      editorRef={bodyEditorRef}
                    />
                  </div>
                </div>

                {/* ステータスバー */}
                <div style={{ padding:"4px 36px",borderTop:"1px solid #e8e0d6",background:"#faf7f3",fontSize:"0.68em",color:"#bbb",flexShrink:0 }}>
                  {((post.title||"")+(post.body||"").replace(/<[^>]+>/g,"")).length.toLocaleString()} 文字
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// 残りのコンポーネント（変更なし）
// ════════════════════════════════════════════════════════
function CalCard({ post, onClick }) {
  const pc = PLATFORM[post.platform];
  return (
    <div onClick={onClick}
      style={{ background:pc.bg,border:"1.5px solid "+pc.border,borderRadius:7,padding:"5px 7px",cursor:"pointer",transition:"transform 0.1s, box-shadow 0.1s",marginBottom:2 }}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 3px 8px #0000001a";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <span style={{ fontSize:10,color:"#aaa" }}>{fmtTime(post.datetime)}</span>
        <span style={{ fontSize:11,color:pc.color,fontWeight:800 }}>{pc.icon}</span>
      </div>
      <div style={{ fontSize:11,fontWeight:600,color:"#1a1a1a",lineHeight:1.4,margin:"2px 0" }}>{post.title.slice(0,18)}{post.title.length>18?"…":""}</div>
      <StatusChip status={post.status} small />
    </div>
  );
}

function MultiSlot({ posts, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const platforms = [...new Set(posts.map(p=>p.platform))];
  if (!expanded) return (
    <div onClick={()=>setExpanded(true)}
      style={{ background:"#fff",border:"1.5px solid #e0d8ce",borderRadius:7,padding:"5px 7px",cursor:"pointer" }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px #0000001a"}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{ fontSize:10,color:"#bbb",marginBottom:3 }}>{fmtTime(posts[0].datetime)} · {posts.length}件</div>
      <div style={{ display:"flex",gap:3,alignItems:"center" }}>
        {platforms.map(pk=>(
          <span key={pk} style={{ fontSize:11,color:PLATFORM[pk].color,background:PLATFORM[pk].bg,border:"1px solid "+PLATFORM[pk].border,borderRadius:4,padding:"1px 5px",fontWeight:700 }}>{PLATFORM[pk].icon}</span>
        ))}
        <span style={{ fontSize:10,color:"#ccc" }}>同時公開</span>
      </div>
    </div>
  );
  return (
    <div>
      <div onClick={()=>setExpanded(false)} style={{ fontSize:10,color:"#bbb",marginBottom:2,cursor:"pointer",padding:"2px 4px" }}>▲ まとめる</div>
      {posts.map(p=><CalCard key={p.id} post={p} onClick={()=>onSelect(p)} />)}
    </div>
  );
}

function ListCard({ post, onClick }) {
  const pc = PLATFORM[post.platform];
  return (
    <div onClick={onClick}
      style={{ background:"#fff",border:"1.5px solid "+pc.border,borderTop:"3px solid "+pc.color,borderRadius:10,padding:"11px 13px",cursor:"pointer",transition:"box-shadow 0.15s" }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px #0000001a"}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5 }}>
        <span style={{ fontSize:11,color:pc.color,fontWeight:700 }}>{pc.icon} {pc.label}</span>
        <StatusChip status={post.status} />
      </div>
      <div style={{ fontSize:14,fontWeight:800,marginBottom:3 }}>{post.title}</div>
      <div style={{ fontSize:11,color:"#aaa" }}>
        {post.datetime.replace("T"," ")} · {post.threads.length}スレッド
        {post.body ? " · 記事あり" : ""}
        {post.comments.length ? " · コメント"+post.comments.length : ""}
      </div>
      {post.memo && <div style={{ fontSize:11,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:5,padding:"4px 8px",marginTop:5 }}>{post.memo.slice(0,50)}{post.memo.length>50?"…":""}</div>}
    </div>
  );
}

function DetailPanel({ post, isAdmin, onClose, onEdit, onDelete, onStatusChange, onAddComment }) {
  const [cmt, setCmt] = useState("");
  const pc = PLATFORM[post.platform];
  return (
    <div style={{ width:365,background:"#fff",borderLeft:"2px solid #e8e0d6",overflowY:"auto",maxHeight:"calc(100vh - 112px)",display:"flex",flexDirection:"column",flexShrink:0 }}>
      <div style={{ padding:"13px 17px",borderBottom:"1px solid #e8e0d6",background:pc.bg,position:"sticky",top:0,zIndex:5 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11,color:pc.color,fontWeight:700,marginBottom:3 }}>{pc.icon} {pc.label}</div>
            <div style={{ fontSize:15,fontWeight:800,lineHeight:1.3 }}>{post.title}</div>
            <div style={{ fontSize:11,color:"#aaa",marginTop:3 }}>{post.datetime.replace("T"," ")}</div>
          </div>
          <button onClick={onClose} style={{ background:"transparent",border:"none",fontSize:18,color:"#bbb",cursor:"pointer" }}>x</button>
        </div>
      </div>
      <div style={{ padding:17,flex:1,display:"flex",flexDirection:"column",gap:17 }}>
        <Sec title="ステータス">
          {isAdmin&&onStatusChange ? (
            <div style={{ display:"flex",flexWrap:"wrap",gap:5 }}>
              {Object.entries(STATUS).map(([k,v])=>(
                <button key={k} onClick={()=>onStatusChange(post.id,k)}
                  style={{ padding:"4px 11px",borderRadius:20,border:"1.5px solid "+(post.status===k?v.border:"#e0d8ce"),background:post.status===k?v.chip:"#f8f4ef",color:post.status===k?v.text:"#bbb",fontSize:12,cursor:"pointer",fontWeight:post.status===k?700:400 }}>
                  {v.label}
                </button>
              ))}
            </div>
          ) : <StatusChip status={post.status} />}
        </Sec>
        {post.memo && (
          <Sec title="概要メモ">
            <div style={{ background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#92400e",lineHeight:1.7 }}>{post.memo}</div>
          </Sec>
        )}
        <Sec title={"スレッドプレビュー（"+post.threads.length+"件）"}>
          {post.threads.map((t,i)=>(
            <div key={i} style={{ display:"flex",gap:9,marginBottom:7 }}>
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0 }}>
                <div style={{ width:31,height:31,borderRadius:"50%",background:pc.bg,border:"1.5px solid "+pc.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:pc.color,fontWeight:800 }}>{pc.icon}</div>
                {i < post.threads.length-1 && <div style={{ width:2,flex:1,background:"#e8e0d6",margin:"2px 0" }} />}
              </div>
              <div style={{ flex:1,background:"#faf7f3",border:"1.5px solid #e8e0d6",borderRadius:9,padding:"8px 11px" }}>
                <div style={{ fontSize:13,color:"#1a1a1a",lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-all" }}>{t||<span style={{color:"#ccc"}}>（空）</span>}</div>
                <div style={{ fontSize:10,color:"#ccc",textAlign:"right",marginTop:2 }}>{t.length}文字</div>
              </div>
            </div>
          ))}
        </Sec>
        {post.body && (
          <Sec title="記事プレビュー">
            <div style={{ background:"#f7f9f9",border:"1px solid #e8e0d6",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#1a1a1a",lineHeight:1.7,maxHeight:180,overflowY:"auto" }}
              dangerouslySetInnerHTML={{ __html: post.body }} />
          </Sec>
        )}
        <Sec title={"コメント（"+post.comments.length+"）"}>
          {post.comments.map((c,i)=>(
            <div key={i} style={{ background:"#faf7f3",border:"1px solid #e8e0d6",borderRadius:7,padding:"7px 11px",fontSize:13,color:"#444",lineHeight:1.6,marginBottom:5 }}>{c}</div>
          ))}
          <div style={{ display:"flex",gap:6,marginTop:4 }}>
            <input value={cmt} onChange={e=>setCmt(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&cmt.trim()&&(onAddComment(post.id,cmt),setCmt(""))}
              placeholder="コメントを追加…"
              style={{ flex:1,background:"#faf7f3",border:"1.5px solid #e8e0d6",borderRadius:7,padding:"7px 11px",fontSize:13,outline:"none" }} />
            <Btn primary onClick={()=>{ if(cmt.trim()){onAddComment(post.id,cmt);setCmt("");} }}>追加</Btn>
          </div>
        </Sec>
      </div>
      {isAdmin && (
        <div style={{ padding:13,borderTop:"1px solid #e8e0d6",display:"flex",gap:7 }}>
          <Btn primary style={{flex:1}} onClick={()=>onEdit(post)}>編集</Btn>
          <Btn danger onClick={()=>{ if(confirm("削除しますか？")) onDelete(post.id); }}>削除</Btn>
        </div>
      )}
    </div>
  );
}

function AccountSettings({ accounts, onUpdate, onDelete, onAdd, onCopyLink, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const [draft,     setDraft]     = useState({});
  function startEdit(acc) { setEditingId(acc.id); setDraft({ name:acc.name, handle:acc.handle, color:acc.color }); }
  function commitEdit() { onUpdate(editingId, draft); setEditingId(null); }
  return (
    <div style={{ position:"fixed",inset:0,background:"#00000066",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
      <div style={{ background:"#fff",border:"2px solid #e8e0d6",borderRadius:17,width:"100%",maxWidth:520,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #00000025" }}>
        <div style={{ padding:"15px 22px",borderBottom:"1px solid #e8e0d6",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#faf7f3" }}>
          <div>
            <div style={{ fontSize:15,fontWeight:900 }}>クライアント管理</div>
            <div style={{ fontSize:11,color:"#aaa",marginTop:2 }}>名前・URLを編集できます</div>
          </div>
          <Btn onClick={onClose}>閉じる</Btn>
        </div>
        <div style={{ flex:1,overflowY:"auto",padding:20 }}>
          {accounts.map(acc=>(
            <div key={acc.id} style={{ background:"#faf7f3",border:"1.5px solid #e8e0d6",borderRadius:12,padding:"14px 16px",marginBottom:10 }}>
              {editingId===acc.id ? (
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  <div style={{ display:"flex",gap:8 }}>
                    <div style={{ flex:1 }}><label style={{ fontSize:11,color:"#999",fontWeight:700,display:"block",marginBottom:4 }}>クライアント名</label><input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} style={INP} /></div>
                    <div style={{ flex:1 }}><label style={{ fontSize:11,color:"#999",fontWeight:700,display:"block",marginBottom:4 }}>ハンドル</label><input value={draft.handle} onChange={e=>setDraft(d=>({...d,handle:e.target.value}))} style={INP} placeholder="@handle" /></div>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:"#999",fontWeight:700,display:"block",marginBottom:6 }}>カラー</label>
                    <div style={{ display:"flex",gap:6 }}>
                      {COLORS.map(c=><button key={c} onClick={()=>setDraft(d=>({...d,color:c}))} style={{ width:26,height:26,borderRadius:"50%",background:c,border:draft.color===c?"3px solid #1a1a1a":"3px solid transparent",cursor:"pointer" }} />)}
                    </div>
                  </div>
                  <div style={{ display:"flex",gap:7 }}><Btn primary onClick={commitEdit} style={{flex:1}}>保存</Btn><Btn onClick={()=>setEditingId(null)}>キャンセル</Btn></div>
                </div>
              ) : (
                <div>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
                    <span style={{ width:10,height:10,borderRadius:"50%",background:acc.color,display:"inline-block" }} />
                    <span style={{ fontWeight:800,fontSize:14 }}>{acc.name}</span>
                    <span style={{ fontSize:12,color:"#bbb" }}>{acc.handle}</span>
                  </div>
                  <div style={{ background:"#fff",border:"1px solid #e8e0d6",borderRadius:7,padding:"6px 10px",fontSize:11,color:"#bbb",fontFamily:"monospace",marginBottom:10,wordBreak:"break-all" }}>
                    {typeof window!=="undefined"?window.location.href.split("?")[0]:"https://your-app.vercel.app/"}?account={acc.id}
                  </div>
                  <div style={{ display:"flex",gap:6 }}>
                    <Btn onClick={()=>startEdit(acc)} style={{flex:1}}>編集</Btn>
                    <button onClick={()=>onCopyLink(acc.id)} style={{ flex:1,background:"#f59e0b",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer" }}>リンクをコピー</button>
                    {accounts.length>1 && <Btn danger onClick={()=>{ if(confirm(acc.name+"を削除しますか？")) onDelete(acc.id); }}>削除</Btn>}
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={onAdd}
            style={{ width:"100%",background:"#fff",border:"2px dashed #e0d8ce",borderRadius:10,padding:"11px",color:"#bbb",cursor:"pointer",fontSize:13,transition:"all 0.15s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.color="#f59e0b";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0d8ce";e.currentTarget.style.color="#bbb";}}>
            + クライアントを追加
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status, small }) {
  const s = STATUS[status]; if(!s) return null;
  return <span style={{ fontSize:small?9:11,background:s.chip,color:s.text,border:"1px solid "+s.border,padding:small?"1px 5px":"2px 9px",borderRadius:20,fontWeight:600,whiteSpace:"nowrap" }}>{s.label}</span>;
}
function Btn({ children, onClick, primary, danger, style }) {
  const t = primary?{background:"#f59e0b",borderColor:"#f59e0b",color:"#fff"}:danger?{background:"#fff",borderColor:"#fca5a5",color:"#ef4444"}:{background:"#fff",borderColor:"#e0d8ce",color:"#555"};
  return <button onClick={onClick} style={{ border:"1.5px solid",borderRadius:8,padding:"6px 13px",cursor:"pointer",fontSize:12,fontWeight:700,transition:"opacity 0.1s",...t,...style }} onMouseEnter={e=>e.currentTarget.style.opacity=".82"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>{children}</button>;
}
function Sec({ title, children }) { return <div><div style={{ fontSize:11,fontWeight:700,color:"#bbb",letterSpacing:0.5,marginBottom:7,textTransform:"uppercase" }}>{title}</div>{children}</div>; }
function Fld({ label, children }) { return <div><label style={{ fontSize:11,fontWeight:700,color:"#999",display:"block",marginBottom:4 }}>{label}</label>{children}</div>; }
const INP = { width:"100%",background:"#fff",border:"1.5px solid #e0d8ce",borderRadius:8,padding:"7px 10px",color:"#1a1a1a",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit" };
function TabBar({ value, onChange, tabs }) {
  return (
    <div style={{ display:"flex",background:"#f2ede6",borderRadius:9,padding:3,gap:2 }}>
      {tabs.map(t=><button key={t.value} onClick={()=>onChange(t.value)} style={{ padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:value===t.value?"#fff":"transparent",color:value===t.value?"#1a1a1a":"#aaa",boxShadow:value===t.value?"0 1px 4px #0000001a":"none" }}>{t.label}</button>)}
    </div>
  );
}
