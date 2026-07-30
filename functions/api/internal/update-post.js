// functions/api/internal/update-post.js
// 既存投稿の部分更新（要件 v1.2 F6）
// 呼び出し元：shia2n-mcp の content_os__update_post ツール
// v1.0
//
// datetime を渡すと、日時未定（waiting）の投稿はデータベース側の仕組みで
// 自動的に予約済み（reserved）へ上がる。datetime に null を渡すと日時を消し、
// 予約済みだった投稿は日時未定へ戻る（要件 v1.2 §4.3 の遷移表）。

import {
  checkAuth, getSupabase, json, preflight, POST_COLUMNS, VALID_STATUS,
} from './_shared.js';

const EDITABLE_TEXT = ['title', 'body', 'memo', 'platform', 'post_type'];

export async function onRequestOptions() {
  return preflight();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const unauthorized = checkAuth(request, env);
  if (unauthorized) return unauthorized;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }
  if (!body?.user_id) return json({ ok: false, error: 'user_id required' }, 400);
  if (body.id === undefined || body.id === null || body.id === '') {
    return json({ ok: false, error: 'id required' }, 400);
  }

  const patch = {};

  for (const key of EDITABLE_TEXT) {
    if (typeof body[key] === 'string') patch[key] = body[key];
  }

  // datetime：文字列で日時、null で「日時を消す」
  if ('datetime' in body) {
    if (body.datetime === null || body.datetime === '') {
      patch.datetime = null;
    } else if (typeof body.datetime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.datetime)) {
      patch.datetime = body.datetime;
    } else {
      return json({ ok: false, error: 'datetime format must be YYYY-MM-DDTHH:mm (or null to clear)' }, 400);
    }
  }

  if ('status' in body && body.status !== undefined && body.status !== null) {
    if (!VALID_STATUS.includes(body.status)) {
      return json({ ok: false, error: `invalid status: ${body.status} (allowed: ${VALID_STATUS.join(' / ')})` }, 400);
    }
    patch.status = body.status;
  }

  if ('score' in body) {
    if (body.score === null || ['S', 'A', 'B', 'C', 'D'].includes(body.score)) patch.score = body.score;
    else return json({ ok: false, error: 'invalid score (S/A/B/C/D or null)' }, 400);
  }

  if ('labels' in body) {
    if (Array.isArray(body.labels)) patch.labels = body.labels;
    else return json({ ok: false, error: 'labels must be an array' }, 400);
  }

  if (Object.keys(patch).length === 0) {
    return json({ ok: false, error: 'no updatable field given' }, 400);
  }

  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_ANON_KEY' }, 500);

  const params = new URLSearchParams();
  params.set('id', `eq.${body.id}`);
  params.set('user_id', `eq.${body.user_id}`);
  params.set('select', POST_COLUMNS);

  let res;
  try {
    res = await fetch(`${sb.url}/rest/v1/posts?${params.toString()}`, {
      method: 'PATCH',
      headers: { ...sb.headers, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    return json({ ok: false, error: 'supabase_network_error', detail: String(err) }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json({ ok: false, error: 'supabase_error', status: res.status, detail: detail.slice(0, 500) }, 502);
  }

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return json({ ok: false, error: 'not_found' }, 200);
  }

  return json({ ok: true, updated_fields: Object.keys(patch), post: rows[0] });
}
