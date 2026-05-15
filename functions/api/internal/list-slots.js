// functions/api/internal/list-slots.js
// 空いている予約枠（body が空の投稿レコード）一覧を取得
// 呼び出し元：shia2n-mcp の content_os__list_slots ツール
// Cloudflare Functions 形式
// v0.1.0 (依頼書：3619c6c1-c439-817f-9533-ee9b661830f4)
//
// 「予約枠」の定義：
//   body = '' かつ datetime が設定済みの投稿レコード。
//   Naoki が ContentOS UI で事前に作成した空き投稿枠を Claude が参照・書き込みするための仕組み。

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SELECT_COLUMNS = 'id,datetime,platform,post_type,status,title,account_id';

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

  // 3. env チェック
  const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_ANON_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  // 4. クエリパラメータ組み立て
  // 予約枠 = body が空文字 ('') の投稿レコード
  const params = new URLSearchParams();
  params.set('select', SELECT_COLUMNS);
  params.set('user_id', `eq.${user_id}`);
  params.set('body', 'eq.');           // body = '' (空文字)
  params.set('order', 'datetime.asc'); // 日時昇順で返す

  // 任意フィルタ：before / after（datetime の範囲絞り込み）
  if (body.after)    params.set('datetime', `gte.${body.after}`);
  if (body.before)   params.append('datetime', `lte.${body.before}`);
  // after と before が両方ある場合は PostgREST が AND 条件として扱う

  // 任意フィルタ：platform
  if (body.platform) params.set('platform', `eq.${body.platform}`);

  // limit: default 20, range [1, 50]
  let limit = Number(body.limit ?? 20);
  if (!Number.isFinite(limit)) limit = 20;
  limit = Math.max(1, Math.min(50, Math.floor(limit)));
  params.set('limit', String(limit));

  const url = `${SUPABASE_URL}/rest/v1/posts?${params.toString()}`;

  // 5. Supabase クエリ
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
  const slots = Array.isArray(rows) ? rows : [];

  return new Response(
    JSON.stringify({ ok: true, count: slots.length, slots }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}
