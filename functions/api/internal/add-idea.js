// functions/api/internal/add-idea.js
// 本文の無いネタ（アイデア）を 1 件足す
// 呼び出し元：shia2n-mcp の content_os__add_idea ツール
// v1.0（2026-10-05 開発部）
//
// add-post は本文が必須（buildNewPost の決まり）なので、ネタには使わない。
// 状態は idea・日時は空・本文は空で入れる。画面のネタ帳（dbAddSheetIdea）と同じ形。
// メモは「- 」と半角スペース 2 つで 1 階層の箇条書きで受け取る（メモ欄の書き方と同じ）。

import {
  checkAuth, fetchAccounts, genPostId, getSupabase, json, preflight, resolveTarget, POST_COLUMNS,
} from './_shared.js';

const IDEA_COLUMNS = `${POST_COLUMNS},memo,memo_links,mm_url`;

function normalizeLinks(raw) {
  if (raw === undefined || raw === null) return { links: [] };
  if (!Array.isArray(raw)) return { error: 'memo_links must be an array of {label, url}' };
  const links = [];
  for (const item of raw) {
    const url = typeof item === 'string' ? item : item?.url;
    if (typeof url !== 'string' || !/^https?:\/\//.test(url.trim())) {
      return { error: `memo_links: url must start with http(s): ${String(url).slice(0, 100)}` };
    }
    const label = typeof item?.label === 'string' ? item.label : '';
    if (!links.some((l) => l.url === url.trim())) links.push({ label, url: url.trim() });
  }
  return { links };
}

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

  const memo = typeof body.memo === 'string' ? body.memo : '';
  if (!memo.trim()) return json({ ok: false, error: 'memo required' }, 400);

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const postType = typeof body.post_type === 'string' && body.post_type.trim() ? body.post_type.trim() : 'x_post';

  const linked = normalizeLinks(body.memo_links);
  if (linked.error) return json({ ok: false, error: linked.error }, 400);

  let mmUrl = null;
  if (body.mm_url !== undefined && body.mm_url !== null && body.mm_url !== '') {
    if (typeof body.mm_url !== 'string') return json({ ok: false, error: 'mm_url must be a string' }, 400);
    mmUrl = body.mm_url.trim();
  }

  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);

  let accounts;
  try {
    accounts = await fetchAccounts(sb, body.user_id);
  } catch (err) {
    return json({ ok: false, error: 'supabase_error', detail: String(err).slice(0, 500) }, 502);
  }

  const target = resolveTarget(accounts, body.account_id, body.platform);
  if (target.error) return json({ ok: false, error: target.error }, 400);

  const record = {
    id: genPostId(),
    user_id: body.user_id,
    account_id: target.account_id,
    title,
    body: '',
    datetime: null,
    platform: target.platform,
    post_type: postType,
    status: 'idea',
    source: 'mcp',
    memo,
    memo_links: linked.links,
    mm_url: mmUrl,
    threads: [],
    comments: [],
    notion_page_id: null,
  };

  let res;
  try {
    res = await fetch(`${sb.url}/rest/v1/posts?select=${IDEA_COLUMNS}`, {
      method: 'POST',
      headers: { ...sb.headers, Prefer: 'return=representation' },
      body: JSON.stringify(record),
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
  if (!post) return json({ ok: false, error: 'insert_returned_nothing' }, 502);

  return json({ ok: true, account_name: target.account_name, post });
}
