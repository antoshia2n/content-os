// functions/api/internal/list-posts.js
// ContentOS posts テーブルの直近N件取得（読み取り専用）
// 呼び出し元：shia2n-mcp の content_os__list_posts ツール
// Cloudflare Functions 形式

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SELECT_COLUMNS = 'id,title,body,score,status,platform,datetime,account_id,post_type,created_at,updated_at';

// HTML タグ除去（body は HTML 文字列のため、統括 Claude が分析しやすいよう plain 版を併設）
function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// score の直感的順序（S > A > B > C > D > null）
const SCORE_RANK = { S: 1, A: 2, B: 3, C: 4, D: 5 };
function scoreRank(s) {
  return SCORE_RANK[s] ?? 99;
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

  const { user_id } = body;
  if (!user_id) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // limit: default 20, range [1, 50]
  let limit = Number(body.limit ?? 20);
  if (!Number.isFinite(limit)) limit = 20;
  limit = Math.max(1, Math.min(50, Math.floor(limit)));

  // sort: 'score_desc' | 'created_desc' (default 'created_desc')
  const sort = body.sort === 'score_desc' ? 'score_desc' : 'created_desc';

  // 3. env チェック（VITE_ プレフィックス両対応）
  const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_ANON_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  // 4. PostgREST 呼び出し
  // score_desc の場合は ASCII 降順だと A が最低になる問題を避けるため、
  // 多めに取得（最大100件）→ JS でカスタム順ソート → limit で切り詰め
  // created_desc は素直に PostgREST の order=created_at.desc を使う
  const fetchLimit = sort === 'score_desc' ? 100 : limit;

  const params = new URLSearchParams();
  params.set('select', SELECT_COLUMNS);
  params.set('user_id', `eq.${user_id}`);
  params.set('order', 'created_at.desc');
  params.set('limit', String(fetchLimit));

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

  // 5. score_desc の場合は JS カスタムソート + limit
  if (sort === 'score_desc') {
    rows.sort((a, b) => {
      const ra = scoreRank(a.score);
      const rb = scoreRank(b.score);
      if (ra !== rb) return ra - rb; // S が先
      // 同スコアは created_at 降順
      return String(b.created_at).localeCompare(String(a.created_at));
    });
    rows = rows.slice(0, limit);
  }

  // 6. body_text を付与して返却
  const posts = rows.map((p) => ({
    ...p,
    body_text: stripHtml(p.body),
  }));

  return new Response(
    JSON.stringify({ ok: true, count: posts.length, sort, posts }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}
