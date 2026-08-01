// functions/api/internal/list-accounts.js
// アカウント一覧の取得（読み取り専用）
// 呼び出し元：shia2n-mcp の content_os__list_accounts ツール
// v1.0（要件 v1.2 F6）

import { checkAuth, fetchAccounts, getSupabase, json, preflight } from './_shared.js';

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
  if (!sb) return json({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);

  let accounts;
  try {
    accounts = await fetchAccounts(sb, body.user_id);
  } catch (err) {
    return json({ ok: false, error: 'supabase_error', detail: String(err).slice(0, 500) }, 502);
  }

  return json({
    ok: true,
    count: accounts.length,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      handle: a.handle,
      default_platform: a.default_platform,
      is_default: a.is_default,
      is_active: a.is_active,
      sort_order: a.sort_order,
    })),
  });
}
