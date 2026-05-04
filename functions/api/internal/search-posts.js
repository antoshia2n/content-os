// functions/api/internal/search-posts.js
// ContentOS posts テーブルを body キーワード ILIKE で検索（読み取り専用）
// 呼び出し元：shia2n-mcp の content_os__search_posts ツール
// Cloudflare Functions 形式

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SELECT_COLUMNS = 'id,title,body,score,status,platform,datetime,account_id,post_type,created_at,updated_at';

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// PostgREST の ilike 用エスケープ：
// ユーザーが含めた % _ \ をリテラルとして扱う（ワイルドカード誤発火を防ぐ）
function escapeIlikeKeyword(keyword) {
  return String(keyword).replace(/[\\%_]/g, '\\$&');
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. 認証
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.MCP_INTERNAL_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 2. Body 取得
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const { user_id, keyword } = body;
  if (!user_id) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (!keyword || String(keyword).trim() === '') {
    return new Response(JSON.stringify({ ok: false, error: 'keyword required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // limit: default 20, range [1, 50]
  let limit = Number(body.limit ?? 20);
  if (!Number.isFinite(limit)) limit = 20;
  limit = Math.max(1, Math.min(50, Math.floor(limit)));

  // 3. env チェック
  const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_ANON_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  // 4. PostgREST 呼び出し（body と title の両方で OR 検索する形にしたいが、
  //    依頼書は body ILIKE のみなので body のみ）
  const escaped = escapeIlikeKeyword(keyword);
  const pattern = `*${escaped}*`;

  const params = new URLSearchParams();
  params.set('select', SELECT_COLUMNS);
  params.set('user_id', `eq.${user_id}`);
  params.set('body', `ilike.${pattern}`);
  params.set('order', 'created_at.desc');
  params.set('limit', String(limit));

  const url = `${SUPABASE_URL}/rest/v1/posts?${params.toString()}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_network_error', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_error', status: res.status, detail: text.slice(0, 500) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  let rows = await res.json();
  if (!Array.isArray(rows)) rows = [];

  const posts = rows.map((p) => ({
    ...p,
    body_text: stripHtml(p.body),
  }));

  return new Response(
    JSON.stringify({ ok: true, count: posts.length, keyword, posts }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}
