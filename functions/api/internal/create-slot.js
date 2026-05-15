// functions/api/internal/create-slot.js
// 新しい空き予約枠（body が空の投稿レコード）を posts テーブルに作成する
// 呼び出し元：shia2n-mcp の content_os__create_slot ツール
// Cloudflare Functions 形式
// v0.1.0 (依頼書：3619c6c1-c439-8128-9de8-fb5da46c209b)
//
// 運用ルール（Decisions 3619c6c1-c439-8127-a30d-c283e3ac7d56）：
//   Claude が単独判断で呼ぶことは禁止。Naoki の明示指示があった時のみ呼ぶ。
//   1回の呼び出しは原則1枠。連続枠生成は別途 Naoki 承認が必要。

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. 認証（fill-slot.js / list-slots.js と同一パターン）
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

  const { user_id, datetime, title, platform, post_type, account_id } = body;

  // 3. バリデーション
  if (!user_id) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (!datetime || typeof datetime !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'datetime required (YYYY-MM-DDTHH:mm)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return new Response(JSON.stringify({ ok: false, error: 'title required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (!platform || typeof platform !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'platform required (x / note)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (!post_type || typeof post_type !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'post_type required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (!account_id || typeof account_id !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'account_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 4. env チェック（fill-slot.js と同一パターン）
  const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_ANON_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  const supabaseHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // 5. ID 生成（UIの genId() と同一ロジック）
  const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);

  // 6. INSERT
  const record = {
    id,
    user_id,
    account_id,
    title: title.trim(),
    datetime,
    platform,
    post_type,
    body: '',        // 空きスロット = body が空文字
    status: 'draft',
    memo: '',
    threads: [],
    comments: [],
    notion_page_id: null,
  };

  let insertRes;
  try {
    insertRes = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
      method: 'POST',
      headers: supabaseHeaders,
      body: JSON.stringify(record),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_network_error', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  if (!insertRes.ok) {
    const text = await insertRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_error', status: insertRes.status, detail: text.slice(0, 500) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  const rows = await insertRes.json();
  const slot = Array.isArray(rows) ? rows[0] : rows;

  return new Response(
    JSON.stringify({
      ok: true,
      slot: {
        id: slot?.id ?? id,
        datetime: slot?.datetime ?? datetime,
        title: slot?.title ?? title.trim(),
        platform: slot?.platform ?? platform,
        post_type: slot?.post_type ?? post_type,
        status: slot?.status ?? 'draft',
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}
