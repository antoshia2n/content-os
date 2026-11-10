// functions/api/internal/save-template.js
// 2026-11-10 開発部：AI（Claude・GPT）が型・依頼パターンを「候補」として書き込む口（型の持ち帰り 便1）
// 呼び出し元：shia2n-mcp の content_os__save_template
// 流れ：Naoki が成果の出た投稿のチャットで「これを型にして」→ AI がここへ書く → 型の管理画面に「候補」で出る
// 決まり：
//  - 新しく作るときは必ず status=candidate（AI が勝手に「確定」にはできない）
//  - id を渡して書き換えられるのは、まだ候補のものだけ（Naoki が自分の型にした・検証中・確定のものは変えない）
//  - why（なぜ効いたか）は必須。Naoki がチャットで言った言葉を入れる
import { checkAuth, getSupabase, json, preflight } from './_shared.js';

const KINDS = ['body', 'closing', 'memo', 'prompt', 'request'];
const MAKES = ['quote_figure', 'article_figure', 'thumbnail', 'text'];
const MADE_BY = ['claude', 'gpt'];
const REF_MAX = 5;
const COLS = 'id,name,kind,post_type,content,sort_order,make,refs,status,why,source_post_id,made_by,created_at,updated_at';
const uuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v));

export const onRequestOptions = () => preflight();

export async function onRequestPost({ request, env }) {
  const denied = checkAuth(request, env);
  if (denied) return denied;
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const uid = b?.user_id;
  if (!uid) return json({ ok: false, error: 'user_id required' }, 400);
  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env' }, 500);
  const enc = encodeURIComponent;

  // 書き換えのときは今の行を読む
  let cur = null;
  if (b.id) {
    if (!uuid(b.id)) return json({ ok: false, error: 'bad id' }, 400);
    const r = await fetch(`${sb.url}/rest/v1/content_templates?select=${COLS}&user_id=eq.${enc(uid)}&id=eq.${enc(b.id)}`, { headers: sb.headers });
    if (!r.ok) return json({ ok: false, error: 'supabase_error', detail: (await r.text()).slice(0, 300) }, 502);
    cur = (await r.json())[0];
    if (!cur) return json({ ok: false, error: 'not_found', id: b.id }, 404);
    if (cur.status !== 'candidate') return json({ ok: false, error: 'not_candidate', message: 'Naoki が手を入れた型（候補ではないもの）は書き換えられません。新しい候補として作ってください' }, 409);
  }

  const kind = b.kind ?? cur?.kind;
  if (!KINDS.includes(kind)) return json({ ok: false, error: 'bad kind', allowed: KINDS }, 400);
  const name = String(b.name ?? cur?.name ?? '').trim().slice(0, 120);
  if (!name) return json({ ok: false, error: 'name required' }, 400);
  const content = String(b.content ?? cur?.content ?? '');
  if (!content.trim()) return json({ ok: false, error: 'content required' }, 400);
  if (content.length > 20000) return json({ ok: false, error: 'content too long (20000)' }, 400);
  const why = String(b.why ?? cur?.why ?? '').trim();
  if (!why) return json({ ok: false, error: 'why required', message: 'なぜ効いたか（Naoki の言葉）を入れてください' }, 400);
  if (why.length > 4000) return json({ ok: false, error: 'why too long (4000)' }, 400);
  const madeBy = b.made_by ?? cur?.made_by ?? 'claude';
  if (!MADE_BY.includes(madeBy)) return json({ ok: false, error: 'bad made_by', allowed: MADE_BY }, 400);
  let make = kind === 'request' ? (b.make ?? cur?.make ?? null) : null;
  if (make !== null && !MAKES.includes(make)) return json({ ok: false, error: 'bad make', allowed: MAKES }, 400);
  const postType = b.post_type === undefined ? (cur?.post_type ?? null) : (b.post_type ? String(b.post_type).trim() : null);

  // 元の投稿：あるか確かめる
  let sourcePostId = b.source_post_id === undefined ? (cur?.source_post_id ?? null) : b.source_post_id;
  let source = null;
  if (sourcePostId !== null && sourcePostId !== '') {
    if (!/^\d+$/.test(String(sourcePostId))) return json({ ok: false, error: 'source_post_id must be a number (content_os の投稿の id)' }, 400);
    const r = await fetch(`${sb.url}/rest/v1/posts?select=id,title,post_type&user_id=eq.${enc(uid)}&id=eq.${sourcePostId}`, { headers: sb.headers });
    source = r.ok ? (await r.json())[0] : null;
    if (!source) return json({ ok: false, error: 'source_post_not_found', source_post_id: sourcePostId }, 404);
    sourcePostId = Number(sourcePostId);
  } else sourcePostId = null;

  // 参考：形をそろえ、題が無ければ元の表から引く
  let refs = b.refs === undefined ? (cur?.refs || []) : b.refs;
  if (!Array.isArray(refs)) return json({ ok: false, error: 'refs must be an array of {k:"swipe"|"map", id}' }, 400);
  const seen = new Set(), clean = [];
  for (const r of refs) {
    if (!r || !['swipe', 'map'].includes(r.k) || !uuid(r.id)) return json({ ok: false, error: 'bad ref', ref: r }, 400);
    const k = `${r.k}:${r.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push({ k: r.k, id: String(r.id), title: String(r.title || '').slice(0, 120) });
  }
  if (clean.length > REF_MAX) return json({ ok: false, error: `refs max ${REF_MAX}` }, 400);
  for (const [k, table] of [['swipe', 'sw_swipes'], ['map', 'mm_maps']]) {
    const ids = clean.filter((r) => r.k === k).map((r) => r.id);
    if (!ids.length) continue;
    const r = await fetch(`${sb.url}/rest/v1/${table}?select=id,title&user_id=eq.${enc(uid)}&id=in.(${ids.join(',')})`, { headers: sb.headers });
    const found = r.ok ? await r.json() : [];
    for (const ref of clean.filter((x) => x.k === k)) {
      const f = found.find((x) => x.id === ref.id);
      if (!f) return json({ ok: false, error: 'ref_not_found', ref }, 404);
      if (!ref.title) ref.title = String(f.title || '').slice(0, 120);
    }
  }

  const fields = { name, kind, content, post_type: postType, make, refs: clean, why, source_post_id: sourcePostId, made_by: madeBy, updated_at: new Date().toISOString() };
  let row;
  if (cur) {
    const r = await fetch(`${sb.url}/rest/v1/content_templates?user_id=eq.${enc(uid)}&id=eq.${enc(cur.id)}&status=eq.candidate`, {
      method: 'PATCH', headers: { ...sb.headers, Prefer: 'return=representation' }, body: JSON.stringify(fields),
    });
    if (!r.ok) return json({ ok: false, error: 'supabase_error', detail: (await r.text()).slice(0, 300) }, 502);
    row = (await r.json())[0];
  } else {
    const o = await fetch(`${sb.url}/rest/v1/content_templates?select=sort_order&user_id=eq.${enc(uid)}&kind=eq.${kind}&order=sort_order.desc&limit=1`, { headers: sb.headers });
    const last = o.ok ? (await o.json())[0] : null;
    const r = await fetch(`${sb.url}/rest/v1/content_templates`, {
      method: 'POST', headers: { ...sb.headers, Prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, user_id: uid, status: 'candidate', sort_order: last ? last.sort_order + 1 : 0 }),
    });
    if (!r.ok) return json({ ok: false, error: 'supabase_error', detail: (await r.text()).slice(0, 300) }, 502);
    row = (await r.json())[0];
  }
  const { user_id, ...out } = row || {};
  return json({ ok: true, created: !cur, template: out, source_post: source, open: 'https://content-os.shia2n.jp の上の帯「型」→ 候補' });
}
