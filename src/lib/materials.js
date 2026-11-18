// 枠の資料（2026-11-18 Naoki「予約枠にリンクとか、チェックリストとか PDF とか MD ファイルを紐づける。執筆時にそれらを参照して、
//   あ、守れてなかったわとか、この手順でこれは作るんだったわとかしたい」→ デモに OK 10:48）
// 資料は枠（slots.materials）に置く。形：{ id, kind: "link"|"check"|"pdf"|"md", label, url?, items?: [{ id, text }] }
// チェックの印は投稿ごと（posts.checks：{ 項目の id: true }）。同じ枠でも次の回はまっさらから。
import { auth } from "../firebase.js";
import { genId, slotTime } from "../constants.js";

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

/** 投稿の枠を見つける：その曜日に出る同じ種類の枠のうち時刻がいちばん近いもの（3 時間以内）→ 無ければ、同じ種類で決めごとのある枠が 1 つだけならそれ。
 *  毎日の枠は、その曜日の上書きを当てた形で返す（2026-11-18） */
export function slotForPost(post, slots = []) {
  if (!post) return null;
  const hit = slotOfPost(post, slots);
  if (hit) return effSlot(hit, postDow(post));
  const type = post.postType || "x_post";
  const withDocs = slots.filter(s => (s.postType || "x_post") === type && ((s.materials || []).length || s.tpl_id || s.aim));
  return withDocs.length === 1 ? withDocs[0] : null;
}

/** 資料の数（チェックリストは 1 つで数える） */
export const materialCount = s => (s?.materials || []).length;

// ── 2026-11-18 枠の決めごと（柱・型・狙い・参考）・曜日ごとの上書き・評価（Naoki OK 14:50）─────────────
export const RULE_KEYS = ["genre", "tpl_id", "aim", "materials"];
/** 毎日の枠の、ある曜日（1=月〜7=日）の決めごと。上書きの無い欄は「すべての曜日」の値 */
export function effSlot(s, dow) {
  if (!s || s.type !== "daily" || !dow) return s;
  const r = (s.day_rules || {})[String(dow)];
  if (!r) return s;
  const out = { ...s };
  RULE_KEYS.forEach(k => { if (r[k] !== undefined && r[k] !== null && !(k !== "materials" && r[k] === "")) out[k] = r[k]; });
  return out;
}
export const hasDayRule = (s, dow) => !!(s?.type === "daily" && (s.day_rules || {})[String(dow)] && Object.keys(s.day_rules[String(dow)]).length);
const dowOf = dt => { const d = new Date(dt.slice(0, 10) + "T00:00").getDay(); return d === 0 ? 7 : d; };
const mins = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
/** 投稿がどの枠のものか：同じ種類で、その曜日に出る枠のうち、時刻がいちばん近いもの（3 時間以内） */
export function slotOfPost(post, slots = []) {
  if (!post?.datetime) return null;
  const type = post.postType || "x_post", dow = dowOf(post.datetime), t = mins(post.datetime.slice(11, 16));
  let best = null, gap = 181;
  slots.forEach(s => {
    if ((s.postType || "x_post") !== type) return;
    if (!(s.type === "daily" || (s.type || "weekly") === "weekly" && s.dow === dow)) return;
    const g = Math.abs(mins(slotTime(s)) - t);
    if (g < gap) { gap = g; best = s; }
  });
  return best;
}
export const postDow = p => (p?.datetime ? dowOf(p.datetime) : null);
// 評価：S=5・A=4・B=3・C=2・D=1
const PT = { S: 5, A: 4, B: 3, C: 2, D: 1 };
export const gradeOf = v => (v == null ? "－" : v >= 4.5 ? "S" : v >= 3.5 ? "A" : v >= 2.5 ? "B" : v >= 1.5 ? "C" : "D");
/** 枠（毎日の枠は曜日 dow で絞れる）の評価。公開済みの投稿を新しい順に limit 件 */
export function slotStats(s, posts = [], slots = [], dow = 0, limit = 12) {
  const now = new Date().toISOString().slice(0, 16);
  const list = posts.filter(p => p.status === "published" && p.datetime && p.datetime <= now && slotOfPost(p, slots)?.id === s.id && (!dow || postDow(p) === dow))
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
  const recent = limit ? list.slice(0, limit) : list;
  const rated = recent.filter(p => PT[String(p.score || "").trim().toUpperCase()]);
  const dist = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  rated.forEach(p => { dist[String(p.score).trim().toUpperCase()]++; });
  const avg = rated.length ? rated.reduce((a, p) => a + PT[String(p.score).trim().toUpperCase()], 0) / rated.length : null;
  return { all: list.length, recent, rated: rated.length, avg, grade: rated.length >= 3 ? gradeOf(avg) : "－", dist };
}
