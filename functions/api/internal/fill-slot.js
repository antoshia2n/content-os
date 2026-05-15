// functions/api/internal/fill-slot.js
// 指定 id の予約枠（body が空の投稿レコード）に title / body / post_type を書き込む
// 呼び出し元：shia2n-mcp の content_os__fill_slot ツール
// Cloudflare Functions 形式
// v0.1.0 (依頼書：3619c6c1-c439-817f-9533-ee9b661830f4)
//
// 安全設計：
//   すでに body が埋まっている枠への上書きは error を返す（事故防止）
//   force=true を指定した場合のみ上書きを許可（明示的な意思表示が必要）

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

  const { user_id, id, title, body: postBody } = body;

  if (!user_id) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: 'id required' }), {
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
  if (postBody === undefined || postBody === null) {
    return new Response(JSON.stringify({ ok: false, error: 'body required' }), {
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

  const supabaseHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  // 4. 対象レコードを取得（存在確認 + body 空チェック）
  const fetchUrl = `${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user_id)}&select=id,body,title,status,datetime`;

  let fetchRes;
  try {
    fetchRes = await fetch(fetchUrl, { method: 'GET', headers: supabaseHeaders });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_network_error', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  if (!fetchRes.ok) {
    const text = await fetchRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_error', status: fetchRes.status, detail: text.slice(0, 500) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  const rows = await fetchRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: 'not_found' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  const existing = rows[0];

  // 5. 上書き防止チェック（body が空でなければエラー）
  const force = body.force === true;
  if (!force && existing.body && existing.body.trim() !== '') {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'slot_already_filled',
        message: 'この予約枠はすでに本文が書き込まれています。上書きする場合は force=true を指定してください。',
        current_title: existing.title,
      }),
      { status: 409, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  // 6. UPDATE
  const patch = {
    title: title.trim(),
    body: postBody,
    status: 'draft',
    ...(body.post_type ? { post_type: body.post_type } : {}),
  };

  const updateUrl = `${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user_id)}`;

  let updateRes;
  try {
    updateRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_network_error', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  if (!updateRes.ok) {
    const text = await updateRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ ok: false, error: 'supabase_error', status: updateRes.status, detail: text.slice(0, 500) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  const updated = await updateRes.json();
  const post = Array.isArray(updated) ? updated[0] : updated;

  return new Response(
    JSON.stringify({
      ok: true,
      post: {
        id: post?.id ?? id,
        title: post?.title ?? patch.title,
        status: post?.status ?? 'draft',
        datetime: post?.datetime ?? existing.datetime,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}
