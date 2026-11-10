// 2026-11-10 依頼の「参考」：スワイプくん・思考整理くんの 1 件を { k: 'swipe'|'map', id, title } で持つ
// 依頼を出す前の分は投稿ごとにこの端末へ覚えておく。形は { all: [], <作るもの>: [], excl: { <作るもの>: [refKey] } }
//   all＝全部の依頼に付ける／<作るもの>＝その作るものにだけ足す／excl＝型から付く参考のうち今回だけ外すもの
// 依頼を出した時点で「型の分 − 外した分 ＋ 全部の分 ＋ その作るものの分」を確定し、依頼ごとに保存する（5 件まで）
export const REF_MAX = 5;
export const REF_LABEL = { swipe: "スワイプ", map: "マップ" };
export const refKey = r => `${r.k}:${r.id}`;
const key = postId => `ck-refs:${postId}`;
export const emptyPending = () => ({ all: [], excl: {} });
export function normPending(v) {
  if (Array.isArray(v)) return { all: v, excl: {} }; // 古い形（一本の並び）
  if (!v || typeof v !== "object") return emptyPending();
  return { ...v, all: Array.isArray(v.all) ? v.all : [], excl: v.excl && typeof v.excl === "object" ? v.excl : {} };
}
export function loadPendingRefs(postId) {
  try { return normPending(JSON.parse(localStorage.getItem(key(postId)) || "null")); } catch { return emptyPending(); }
}
export function pendingCount(p) {
  p = normPending(p);
  return Object.entries(p).filter(([k]) => k !== "excl").reduce((n, [, v]) => n + (Array.isArray(v) ? v.length : 0), 0);
}
export function savePendingRefs(postId, p) {
  try { if (pendingCount(p) || Object.values(normPending(p).excl).some(a => a?.length)) localStorage.setItem(key(postId), JSON.stringify(p)); else localStorage.removeItem(key(postId)); } catch { /* 覚えられなくても動く */ }
}
// 並びを合わせ、重なりを除いて上限まで
export function mergeRefs(...lists) {
  const seen = new Set(), out = [];
  for (const l of lists) for (const r of l || []) { if (!r?.k || !r?.id) continue; const k = refKey(r); if (seen.has(k)) continue; seen.add(k); out.push({ k: r.k, id: String(r.id), title: String(r.title || "").slice(0, 120) }); }
  return out.slice(0, REF_MAX);
}
// ある作るものの依頼に付く参考（確定の形）
export function resolveRefs(pending, make, tplRefs) {
  const p = normPending(pending);
  const ex = new Set(p.excl[make] || []);
  return mergeRefs((tplRefs || []).filter(r => !ex.has(refKey(r))), p.all, p[make]);
}
// 付ける・外す（target＝'all' か作るもの）
export function toggleIn(pending, target, r) {
  const p = normPending(pending);
  const cur = p[target] || [];
  const has = cur.some(x => refKey(x) === refKey(r));
  return { ...p, [target]: has ? cur.filter(x => refKey(x) !== refKey(r)) : [...cur, r].slice(0, REF_MAX) };
}
export function toggleExcl(pending, make, r) {
  const p = normPending(pending);
  const cur = p.excl[make] || [];
  const k = refKey(r);
  return { ...p, excl: { ...p.excl, [make]: cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k] } };
}
// どこかに付いているか（検索タブの表示用）
export function whereAttached(pending, r) {
  const p = normPending(pending);
  return Object.entries(p).filter(([k, v]) => k !== "excl" && Array.isArray(v) && v.some(x => refKey(x) === refKey(r))).map(([k]) => k);
}
