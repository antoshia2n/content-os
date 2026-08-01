// functions/api/internal/_shared.js
// 内部API（shia2n-mcp から Bearer 認証で叩かれるエンドポイント）の共通処理。
// ファイル名が _ で始まるため Cloudflare Pages はルートとして公開しない。
// v1.0（要件 v1.2 F6・F1/F2 の新規エンドポイント用）

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const POST_COLUMNS =
  'id,title,body,score,status,platform,datetime,account_id,post_type,source,created_at,updated_at';

// 制作段階の5値（要件 v1.2 §4.3）。データベース側の制約と同じ内容
export const VALID_STATUS = ['draft', 'review', 'waiting', 'reserved', 'published'];

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Bearer 認証。通れば null、落ちれば Response を返す */
export function checkAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.MCP_INTERNAL_SECRET}`) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  return null;
}

/**
 * Supabase の接続情報。
 *
 * 【2026-08-01 変更】内部API は公開キーではなく管理者キーを使う。
 * 公開キーはこのあと権限を剥がすため、公開キーのままだと内部APIが動かなくなる。
 * 管理者キーは Cloudflare の設定（Secret）にのみ置く。画面には配らない。
 * 正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
 */
export function getSupabase(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    url,
    key,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  };
}

export function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** UI の genId() と同一ロジック */
export function genPostId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

/** アカウント一覧を取得する（並び順つき） */
export async function fetchAccounts(sb, userId) {
  const params = new URLSearchParams();
  params.set('select', 'id,name,handle,default_platform,is_default,is_active,sort_order');
  params.set('user_id', `eq.${userId}`);
  params.set('order', 'sort_order.asc');
  const res = await fetch(`${sb.url}/rest/v1/accounts?${params.toString()}`, {
    method: 'GET',
    headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`supabase_error(accounts): ${res.status} ${detail.slice(0, 300)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

/**
 * 登録先アカウントと媒体を決める（要件 v1.2 F1・F5）
 *   account_id 省略 → 既定アカウント（is_default=true）
 *   platform  省略 → そのアカウントの default_platform → それも空なら 'x'
 */
export function resolveTarget(accounts, accountId, platform) {
  let acc;
  if (accountId) {
    acc = accounts.find((a) => a.id === accountId);
    if (!acc) return { error: `account_not_found: ${accountId}` };
  } else {
    acc = accounts.find((a) => a.is_default) || accounts.find((a) => a.is_active !== false);
    if (!acc) return { error: 'no_default_account' };
  }
  return {
    account_id: acc.id,
    account_name: acc.name,
    platform: platform || acc.default_platform || 'x',
  };
}

/**
 * 新規投稿1件の中身を組み立てる（検証込み）
 * status は常に waiting で入れる。datetime があればデータベース側の仕組みが
 * 自動で reserved に上げる（要件 v1.2 §4.3 の遷移表どおり）
 */
export function buildNewPost(item, userId, accounts) {
  const title = typeof item?.title === 'string' ? item.title.trim() : '';
  if (!title) return { error: 'title required' };

  const body = typeof item?.body === 'string' ? item.body : '';
  if (!body.trim()) return { error: 'body required' };

  const postType = typeof item?.post_type === 'string' ? item.post_type.trim() : '';
  if (!postType) return { error: 'post_type required (例: x_post / x_article / note)' };

  const datetime = item?.datetime ? String(item.datetime) : null;
  if (datetime && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datetime)) {
    return { error: `datetime format must be YYYY-MM-DDTHH:mm: ${datetime}` };
  }

  const target = resolveTarget(accounts, item?.account_id, item?.platform);
  if (target.error) return { error: target.error };

  return {
    record: {
      id: genPostId(),
      user_id: userId,
      account_id: target.account_id,
      title,
      body,
      datetime,
      platform: target.platform,
      post_type: postType,
      status: 'waiting',
      source: 'mcp',
      memo: typeof item?.memo === 'string' ? item.memo : '',
      threads: [],
      comments: [],
      notion_page_id: null,
    },
    account_name: target.account_name,
  };
}
