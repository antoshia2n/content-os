// functions/api/internal/list-templates.js
// 2026-11-10 開発部：型・依頼パターンを読む口（型の持ち帰り 便1）
// 呼び出し元：shia2n-mcp の content_os__list_templates
// 候補を書く前に、似た型がもう無いかを AI が確かめるため（重なりを作らない）
import { checkAuth, getSupabase, json, preflight } from './_shared.js';

const KINDS = ['body', 'closing', 'memo', 'prompt', 'request'];
const STATUSES = ['mine', 'candidate', 'testing', 'confirmed'];
const COLS = 'id,name,kind,post_type,content,make,refs,status,why,source_post_id,made_by,updated_at';

export const onRequestOptions = () => preflight();

export async function onRequestPost({ request, env }) {
  const denied = checkAuth(request, env);
  if (denied) return denied;
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  if (!b?.user_id) return json({ ok: false, error: 'user_id required' }, 400);
  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env' }, 500);

  const q = new URLSearchParams();
  q.set('select', COLS);
  q.set('user_id', `eq.${b.user_id}`);
  if (b.id) q.set('id', `eq.${b.id}`);
  if (b.kind) {
    if (!KINDS.includes(b.kind)) return json({ ok: false, error: 'bad kind', allowed: KINDS }, 400);
    q.set('kind', `eq.${b.kind}`);
  }
  if (b.status) {
    if (!STATUSES.includes(b.status)) return json({ ok: false, error: 'bad status', allowed: STATUSES }, 400);
    q.set('status', b.status === 'mine' ? 'is.null' : `eq.${b.status}`);
  }
  q.set('order', 'kind.asc,sort_order.asc');
  q.set('limit', '200');
  const r = await fetch(`${sb.url}/rest/v1/content_templates?${q}`, { headers: sb.headers });
  if (!r.ok) return json({ ok: false, error: 'supabase_error', detail: (await r.text()).slice(0, 300) }, 502);
  let rows = await r.json();
  const word = String(b.query || '').trim().toLowerCase();
  if (word) rows = rows.filter((t) => `${t.name}\n${t.content}\n${t.why}`.toLowerCase().includes(word));
  // 一覧では中身を短くする（id を渡したときは全部）
  if (!b.id) rows = rows.map((t) => ({ ...t, content: t.content.length > 400 ? t.content.slice(0, 400) + '…' : t.content }));
  return json({ ok: true, count: rows.length, templates: rows });
}
