// functions/api/internal/add-post.js
// 枠を介さない新規投稿の登録（要件 v1.2 F1）
// 呼び出し元：shia2n-mcp の content_os__add_post ツール
// v1.0
//
// 日時を省略すると status=waiting（日時未定）で入り、日時を渡すと
// データベース側の仕組みが自動で reserved（予約済み）に上げる。

import {
  buildNewPost, checkAuth, fetchAccounts, getSupabase, json, preflight, POST_COLUMNS,
} from './_shared.js';

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

  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_ANON_KEY' }, 500);

  let accounts;
  try {
    accounts = await fetchAccounts(sb, body.user_id);
  } catch (err) {
    return json({ ok: false, error: 'supabase_error', detail: String(err).slice(0, 500) }, 502);
  }

  const built = buildNewPost(body, body.user_id, accounts);
  if (built.error) return json({ ok: false, error: built.error }, 400);

  let res;
  try {
    res = await fetch(`${sb.url}/rest/v1/posts?select=${POST_COLUMNS}`, {
      method: 'POST',
      headers: { ...sb.headers, Prefer: 'return=representation' },
      body: JSON.stringify(built.record),
    });
  } catch (err) {
    return json({ ok: false, error: 'supabase_network_error', detail: String(err) }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json({ ok: false, error: 'supabase_error', status: res.status, detail: detail.slice(0, 500) }, 502);
  }

  const rows = await res.json();
  const post = Array.isArray(rows) ? rows[0] : rows;

  return json({ ok: true, account_name: built.account_name, post });
}
