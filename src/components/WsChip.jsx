/**
 * 場所（ワークスペース）の切り替え（2026-11-04・スワイプくん・X攻略くんと同じ形）
 *
 * 自分の場所＝これまでのデータ。みんなの場所＝入っている人だけが読み書きできる（例：おかぜり案件）。
 * どの場所で開いているかは shia2n-core がブラウザに覚え、表の読み書きの見出し X-Workspace で送る。入っているかの判断はサーバーだけ。
 * 入っている場所が無い人には何も出さない（今までと同じ画面）。
 * 替えるときは beforeSwitch（書きかけを送り切る）が true を返したときだけ替えて、読み込み直す。
 */
import React from "react";
import { getWorkspace, setWorkspace } from "shia2n-core/lib/supabase.js";
import { auth } from "../firebase.js";

const CSS = `
.cws{position:relative;flex:none}
.cws-btn{display:inline-flex;align-items:center;gap:6px;max-width:200px;min-height:32px;padding:0 10px;border:1px solid #e6dfd6;border-radius:8px;background:#fff;color:#1a1a1a;font-family:inherit;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer}
.cws-btn:hover{background:#f7f3ee}
.cws-name{overflow:hidden;text-overflow:ellipsis}
.cws-dot{width:8px;height:8px;border-radius:50%;background:#6b6259;flex:none}
.cws-btn.shared{border-color:#b45309;background:#fef3c7}
.cws-btn.shared .cws-dot{background:#b45309}
.cws-list{position:absolute;left:0;top:calc(100% + 6px);z-index:60;min-width:240px;max-width:300px;background:#fff;border:1px solid #e6dfd6;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.12);padding:6px;display:flex;flex-direction:column;gap:2px}
.cws-it{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:8px;text-align:left;padding:8px 10px;border-radius:8px;min-height:44px;border:0;background:none;color:#1a1a1a;cursor:pointer;font-family:inherit}
.cws-it:hover,.cws-it:focus-visible{background:#f7f3ee}
.cws-it.on{background:#fef3c7}
.cws-n{font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-s{grid-row:2;font-size:12px;color:#6b6259}
.cws-c{grid-column:2;grid-row:1/3;align-self:center;color:#b45309;font-weight:800}
.cws-note{font-size:12px;color:#6b6259;padding:6px 10px 4px;border-top:1px solid #e6dfd6;margin-top:4px;line-height:1.5}
@media (max-width:640px){.cws-btn{max-width:104px;min-height:44px;padding:0 8px}.cws-list{position:fixed;left:12px;right:12px;top:58px;max-width:none}}
@media (pointer:fine){.cws-it{min-height:36px}.cpanel .cws-btn{min-height:28px}}
.cpanel .cws-btn{max-width:170px}
.cpanel .cws-list{position:absolute;left:0;right:auto;top:calc(100% + 6px);max-width:calc(100vw - 24px)}
@media (prefers-color-scheme:dark){.ck-dark .cws-btn{background:#24211d;color:#f1ece6;border-color:#38332c}}
`;

const myName = () => (auth?.currentUser?.displayName || "").trim() || "自分";

// 入っている場所の一覧（自分の場所は含まない）。読めなかったときは null（今の場所を勝手に外さないため）
async function loadWorkspaces() {
  const u = auth?.currentUser; if (!u) return null;
  try {
    const res = await fetch("/api/workspaces", { headers: { Authorization: "Bearer " + (await u.getIdToken()) } });
    const j = await res.json().catch(() => ({}));
    return res.ok && j.ok && Array.isArray(j.workspaces) ? j.workspaces : null;
  } catch { return null; }
}

export function WsChip({ beforeSwitch, onToast, note = "場所を替えると、見るデータが入れ替わる（ほかの場所のデータは混ざらない）" }) {
  const cur = getWorkspace();
  const [list, setList] = React.useState(cur ? [{ id: cur, name: "場所", role: "editor" }] : []);
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef(null), btn = React.useRef(null);

  React.useEffect(() => {
    let dead = false;
    loadWorkspaces().then(ws => {
      if (dead || !ws) return;
      // 抜けた場所を開こうとしていたら自分の場所へ戻す（入っていない場所は出入り口が断るため）
      if (cur && !ws.some(w => w.id === cur)) { setWorkspace(null); location.reload(); return; }
      setList(ws);
    });
    return () => { dead = true; };
  }, []);

  // 外を押す・Esc・Tab で閉じる。Esc はボタンへ戻す
  React.useEffect(() => {
    if (!open) return;
    const down = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const key = e => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); }
      else if (e.key === "Tab" && !wrap.current?.querySelector(".cws-list")?.contains(document.activeElement)) setOpen(false);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    setTimeout(() => wrap.current?.querySelector(".cws-it.on")?.focus(), 0);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key, true); };
  }, [open]);

  if (!list.length) return null;
  const nameOf = id => id ? (list.find(w => w.id === id)?.name || "場所") : myName();
  const items = [{ id: null, name: myName(), sub: "自分の場所" }, ...list.map(w => ({ id: w.id, name: w.name, sub: w.role === "owner" ? "みんなの場所・持ち主" : "みんなの場所" }))];

  const go = async next => {
    setOpen(false);
    if (next === cur) { btn.current?.focus(); return; }
    // 書きかけを今の場所へ送り切ってから替える。送れなかったら替えない（書きかけを捨てない）
    let ok = true;
    if (beforeSwitch) {
      let tm;
      ok = await Promise.race([Promise.resolve(beforeSwitch()), new Promise(r => { tm = setTimeout(() => r(false), 10000); })]).catch(() => false).finally(() => clearTimeout(tm));
    }
    if (ok === "skip") { btn.current?.focus(); return; } // 呼び出し側が理由を知らせ済み
    if (ok !== true) { onToast?.("保存が終わっていないので、場所はまだ替えていない。少しおいてもう一度"); btn.current?.focus(); return; }
    setWorkspace(next); location.reload();
  };

  return (
    <div className="cws" ref={wrap}>
      <style>{CSS}</style>
      <button ref={btn} className={`cws-btn ${cur ? "shared" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-label={`場所を切り替える（今は${nameOf(cur)}）`} onClick={() => setOpen(o => !o)}>
        <span className="cws-dot" aria-hidden="true" /><span className="cws-name">{nameOf(cur)}</span><span aria-hidden="true">▾</span>
      </button>
      {open && <div className="cws-list" role="menu" aria-label="場所">
        {items.map(it => {
          const on = it.id === cur;
          return <button key={it.id || "me"} role="menuitemradio" aria-checked={on} className={`cws-it ${on ? "on" : ""}`} onClick={() => go(it.id)}>
            <span className="cws-n">{it.name}</span><span className="cws-s">{it.sub}</span>{on && <span className="cws-c" aria-hidden="true">✓</span>}
          </button>;
        })}
        <div className="cws-note">{note}</div>
      </div>}
    </div>
  );
}
