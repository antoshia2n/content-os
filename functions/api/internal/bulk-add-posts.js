// functions/api/internal/bulk-add-posts.js
// 複数本の新規投稿をまとめて登録する（要件 v1.2 F2）
// 呼び出し元：shia2n-mcp の content_os__bulk_add_posts ツール
// v1.0
//
// 1本でも失敗しても、成功した分は残す。失敗した分だけを理由付きで返す
// （まとめ書きを丸ごと失うのが最悪のため）。上限は1回20本。

import {
  buildNewPost, checkAuth, fetchAccounts, getSupabase, json, preflight, POST_COLUMNS,
} from './_shared.js';

const MAX_ITEMS = 20;

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

  const items = body?.posts;
  if (!Array.isArray(items) || items.length === 0) {
    return json({ ok: false, error: 'posts must be a non-empty array' }, 400);
  }
  if (items.length > MAX_ITEMS) {
    return json({ ok: false, error: `too many posts: ${items.length} (max ${MAX_ITEMS})` }, 400);
  }

  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_ANON_KEY' }, 500);

  let accounts;
  try {
    accounts = await fetchAccounts(sb, body.user_id);
  } catch (err) {
    return json({ ok: false, error: 'supabase_error', detail: String(err).slice(0, 500) }, 502);
  }

  const succeeded = [];
  const failed = [];

  // 1本ずつ登録する。まとめて1回で送ると、1本の不備で全部が巻き戻るため
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const label = (typeof item?.title === 'string' && item.title.trim()) || `(${i + 1}本目・タイトルなし)`;

    const built = buildNewPost(item, body.user_id, accounts);
    if (built.error) {
      failed.push({ index: i, title: label, error: built.error });
      continue;
    }

    try {
      const res = await fetch(`${sb.url}/rest/v1/posts?select=${POST_COLUMNS}`, {
        method: 'POST',
        headers: { ...sb.headers, Prefer: 'return=representation' },
        body: JSON.stringify(built.record),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        failed.push({ index: i, title: label, error: `supabase_error ${res.status}: ${detail.slice(0, 300)}` });
        continue;
      }
      const rows = await res.json();
      const post = Array.isArray(rows) ? rows[0] : rows;
      succeeded.push({ index: i, account_name: built.account_name, post });
    } catch (err) {
      failed.push({ index: i, title: label, error: `supabase_network_error: ${String(err).slice(0, 300)}` });
    }
  }

  return json({
    ok: failed.length === 0,
    requested: items.length,
    succeeded_count: succeeded.length,
    failed_count: failed.length,
    succeeded,
    failed,
  });
}
