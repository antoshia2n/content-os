// 2026-11-10 依頼の「参考」：スワイプくん・思考整理くんの 1 件を { k: 'swipe'|'map', id, title } で持つ
// 依頼を出す前の分は投稿ごとにこの端末へ覚えておき、「依頼する」で依頼に付けて消す
export const REF_MAX = 5;
export const REF_LABEL = { swipe: "スワイプ", map: "マップ" };
export const refKey = r => `${r.k}:${r.id}`;
const key = postId => `ck-refs:${postId}`;
export function loadPendingRefs(postId) {
  try { const v = JSON.parse(localStorage.getItem(key(postId)) || "[]"); return Array.isArray(v) ? v.slice(0, REF_MAX) : []; } catch { return []; }
}
export function savePendingRefs(postId, refs) {
  try { if (refs.length) localStorage.setItem(key(postId), JSON.stringify(refs)); else localStorage.removeItem(key(postId)); } catch { /* 覚えられなくても動く */ }
}
// 型の参考と依頼の参考を合わせ、重なりを除いて上限まで
export function mergeRefs(...lists) {
  const seen = new Set(), out = [];
  for (const l of lists) for (const r of l || []) { if (!r?.k || !r?.id) continue; const k = refKey(r); if (seen.has(k)) continue; seen.add(k); out.push({ k: r.k, id: String(r.id), title: String(r.title || "").slice(0, 120) }); }
  return out.slice(0, REF_MAX);
}
