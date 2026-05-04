// functions/api/internal/get-post.js
// ContentOS posts テーブルから ID 指定で1件取得（読み取り専用）
// 呼び出し元：shia2n-mcp の content_os__get_post ツール
// Cloudflare Functions 形式

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// get-post は単票なので全カラム取得（threads / comments / history / labels / memo_links 含む）
const SELECT_COLUMNS = '*';

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
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

  const { user_id, id } = body;
  if (!user_id) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (id == null || id === '') {
    return new Response(JSON.stringify({ ok: false, error: 'id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 3. env チェック
  const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_ANON_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  // 4. PostgREST 呼び出し（id + user_id で完全一致）
  const params = new URLSearchParams();
  params.set('select', SELECT_COLUMNS);
  params.set('id', `eq.${id}`);
  params.set('user_id', `eq.${user_id}`);
  params.set('limit', '1');

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

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: 'not_found', id }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  const p = rows[0];
  const post = { ...p, body_text: stripHtml(p.body) };

  return new Response(
    JSON.stringify({ ok: true, post }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}
