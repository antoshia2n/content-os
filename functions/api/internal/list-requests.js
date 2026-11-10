// functions/api/internal/list-requests.js
// 2026-11-10 開発部：コンテンツくんの「依頼」（content_requests）を読む口。
// 呼び出し元：shia2n-mcp の content_os__list_requests（ChatGPT の予定タスクが 1 時間ごとに呼ぶ）
// 依頼のもとになった投稿（題・本文の文字）と、使う型（依頼の型）の中身もいっしょに返す。GPT が別の口を呼ばずに初稿へ入れるようにするため。
import { checkAuth, getSupabase, json, preflight } from './_shared.js';

const STATUSES = ['queued', 'drafting', 'review', 'done', 'cancelled'];
const stripHtml = (h) => (h ? String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');

export const onRequestOptions = () => preflight();

export async function onRequestPost({ request, env }) {
  const denied = checkAuth(request, env);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const { user_id, id } = body || {};
  if (!user_id) return json({ ok: false, error: 'user_id required' }, 400);
  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env' }, 500);

  const status = Array.isArray(body.status) ? body.status : (body.status ? [body.status] : ['queued']);
  if (status.some((s) => !STATUSES.includes(s))) return json({ ok: false, error: 'bad status', allowed: STATUSES }, 400);
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 30);

  const q = new URLSearchParams();
  q.set('select', '*');
  q.set('user_id', `eq.${user_id}`);
  q.set('kind', 'neq.schedule'); // 予約の依頼は GPT に見せない（Buffer はこちらの見回りが入れる）。番号で指したときも同じ
  if (id) q.set('id', `eq.${id}`);
  else q.set('status', `in.(${status.join(',')})`);
  q.set('order', 'created_at.asc');
  q.set('limit', String(limit));
  const r = await fetch(`${sb.url}/rest/v1/content_requests?${q}`, { headers: sb.headers });
  if (!r.ok) return json({ ok: false, error: 'supabase_error', detail: (await r.text()).slice(0, 300) }, 502);
  const rows = await r.json();

  // 投稿と型をまとめて引く
  const postIds = [...new Set(rows.map((x) => x.post_id).filter((v) => v != null))];
  const tplIds = [...new Set(rows.map((x) => x.template_id).filter(Boolean))];
  const posts = {}, tpls = {};
  if (postIds.length) {
    const pr = await fetch(`${sb.url}/rest/v1/posts?select=id,title,body,post_type,status,datetime,account_id&user_id=eq.${encodeURIComponent(user_id)}&id=in.(${postIds.join(',')})`, { headers: sb.headers });
    if (pr.ok) for (const p of await pr.json()) posts[p.id] = { id: p.id, title: p.title, body_text: stripHtml(p.body).slice(0, 20000), post_type: p.post_type, status: p.status, datetime: p.datetime };
  }
  if (tplIds.length) {
    const tr = await fetch(`${sb.url}/rest/v1/content_templates?select=id,name,kind,content&user_id=eq.${encodeURIComponent(user_id)}&id=in.(${tplIds.join(',')})`, { headers: sb.headers });
    if (tr.ok) for (const t of await tr.json()) tpls[t.id] = t;
  }
  const requests = rows.map((x) => ({ ...x, post: posts[x.post_id] || null, template: tpls[x.template_id] || null }));
  return json({ ok: true, count: requests.length, requests });
}
