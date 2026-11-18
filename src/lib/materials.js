// 枠の資料（2026-11-18 Naoki「予約枠にリンクとか、チェックリストとか PDF とか MD ファイルを紐づける。執筆時にそれらを参照して、
//   あ、守れてなかったわとか、この手順でこれは作るんだったわとかしたい」→ デモに OK 10:48）
// 資料は枠（slots.materials）に置く。形：{ id, kind: "link"|"check"|"pdf"|"md", label, url?, items?: [{ id, text }] }
// チェックの印は投稿ごと（posts.checks：{ 項目の id: true }）。同じ枠でも次の回はまっさらから。
import { auth } from "../firebase.js";
import { genId, slotTime } from "../constants.js";
import { slotMatchesDate } from "../screens/CalendarView.jsx";

export const DOCS_BUCKET = "contentos-docs";
const SB_URL = import.meta.env.VITE_SUPABASE_URL || "";

export const newId = () => String(genId());

/** チェックリストの字（1 行 1 項目）から項目の並びを作る。前の項目の id は、同じ字なら引き継ぐ */
export function itemsFromText(text, prev = []) {
  const used = new Set();
  return String(text || "").split("\n").map(l => l.replace(/^\s*(?:[-*・]|\d+[.)]|\[[ x]\])\s*/i, "").trim()).filter(Boolean).map(t => {
    const hit = prev.find(p => p.text === t && !used.has(p.id));
    if (hit) { used.add(hit.id); return hit; }
    return { id: newId(), text: t };
  });
}

/** PDF・MD を置き場へ置き、公開の住所を返す */
export async function uploadDoc(file) {
  const name = file?.name || "";
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  if (!["pdf", "md"].includes(ext)) throw new Error("置けるのは PDF と MD のファイルだけです");
  if (file.size > 20 * 1024 * 1024) throw new Error("ファイルは 20MB 以下にしてください");
  const user = auth.currentUser;
  if (!user) throw new Error("ログイン状態を確認できませんでした。ページを再読み込みしてください");
  const token = await user.getIdToken();
  const res = await fetch(`/api/storage/upload?bucket=${encodeURIComponent(DOCS_BUCKET)}&name=${encodeURIComponent(name)}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" }, body: file,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error([out.message, out.hint].filter(Boolean).join(" ") || `置けませんでした（${res.status}）`);
  const path = out.path || out.key || "";
  const url = out.url || out.publicUrl || (path ? `${SB_URL}/storage/v1/object/public/${DOCS_BUCKET}/${path}` : "");
  if (!url) throw new Error("置いたファイルの住所を受け取れませんでした");
  return { url, kind: ext, label: name.replace(/\.(pdf|md)$/i, "") };
}

/** 投稿の枠を見つける：予定の日時と種類が合う枠 → 無ければ、同じ種類で資料のある枠が 1 つだけならそれ */
export function slotForPost(post, slots = []) {
  if (!post) return null;
  const type = post.postType || "x_post";
  const same = slots.filter(s => (s.postType || "x_post") === type);
  if (post.datetime) {
    const d = new Date(post.datetime.slice(0, 10) + "T00:00");
    const t = post.datetime.slice(11, 16);
    const hit = same.find(s => slotTime(s) === t && slotMatchesDate(s, d));
    if (hit) return hit;
  }
  const withDocs = same.filter(s => (s.materials || []).length);
  return withDocs.length === 1 ? withDocs[0] : null;
}

/** 資料の数（チェックリストは 1 つで数える） */
export const materialCount = s => (s?.materials || []).length;
