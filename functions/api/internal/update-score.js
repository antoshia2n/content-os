/**
 * POST /api/internal/update-score
 * ContentOS 投稿のスコアを更新する内部 API。
 * shia2n-mcp からのみ呼び出される（Bearer 認証必須）。
 *
 * v0.16.0 で追加（依頼書：3579c6c1-c439-81b4-98b4-cd4940145e4a）
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const VALID_SCORES = new Set(['S', 'A', 'B', 'C', 'D']);

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

  const { user_id, id, score } = body;

  if (!user_id) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (id === undefined || id === null) {
    return new Response(JSON.stringify({ ok: false, error: 'id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  // score は null（未評価に戻す）または S/A/B/C/D のみ許可
  if (score !== null && score !== undefined && !VALID_SCORES.has(score)) {
    return new Response(JSON.stringify({ ok: false, error: 'score must be S/A/B/C/D or null' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 3. env チェック（VITE_ プレフィックス両対応）
  const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_ANON_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  // 4. Supabase PATCH（score フィールドのみ更新）
  const params = new URLSearchParams();
  params.set('id', `eq.${id}`);
  params.set('user_id', `eq.${user_id}`);
  params.set('select', 'id,score,updated_at');

  const url = `${SUPABASE_URL}/rest/v1/posts?${params.toString()}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ score: score ?? null }),
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
      JSON.stringify({ ok: false, error: 'not_found' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, post: rows[0] }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}
