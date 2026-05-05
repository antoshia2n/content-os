// functions/api/internal/push-to-notion.js
// コンテンツくん → Notion アウトプットDB push
// push先DB：アウトプットDB（31b9c6c1c43980c5b8ccdf3b7fea572a）
// Cloudflare Functions 形式

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

  // 1. Body 取得
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 2. フィールド展開
  //
  // 【草案保存時】
  //   title, content_type, target, tags, body_text, source_app
  //
  // 【投稿完了マーク時】（page_id 必須）
  //   page_id, post_url, post_date
  //
  // 【パフォーマンス更新時】（page_id 必須）
  //   page_id, impressions, engagement, rating
  //
  // ─────────────────────────────────────────────────
  // プロパティ名対応表（Body変数 → Notion プロパティ）
  //   title        → title        (Title)
  //   content_type → media        (Multi-select)
  //   target       → 対象          (Select)
  //   tags         → topic_tag    (Multi-select)
  //   body_text    → 本文          (Rich_text)
  //   post_url     → content_url  (URL)
  //   post_date    → date         (Date)
  //   impressions  → インプレッション (Number)
  //   engagement   → エンゲージメント (Number)
  //   rating       → 評価          (Select)
  //   reused_for   → 転用済み先     (Multi-select)
  //   source_app   → 蓄積元アプリ   (Select)
  //   status       → status       (Select) ※草案時は「下書き」を自動セット
  // ─────────────────────────────────────────────────
  const {
    page_id,
    title,
    content_type,
    target,
    tags,
    body_text,
    post_url,
    post_date,
    impressions,
    engagement,
    rating,
    reused_for,
    source_app,
    status,
  } = body;

  const notionSecret = env.NOTION_SECRET;
  // 環境変数 NOTION_DATABASE_ID に「31b9c6c1c43980c5b8ccdf3b7fea572a」をセット
  const dbId = env.NOTION_DATABASE_ID;

  if (!notionSecret || !dbId) {
    return new Response(
      JSON.stringify({ error: 'Missing env: NOTION_SECRET or NOTION_DATABASE_ID' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  // 3. Notion properties 構築（undefined は除外 → 部分更新に対応）
  const properties = {};

  if (title != null) {
    properties['title'] = {
      title: [{ text: { content: String(title) } }],
    };
  }

  // content_type → media（Multi-select）
  if (content_type != null) {
    properties['media'] = {
      multi_select: [{ name: content_type }],
    };
  }

  // target → 対象（Select）
  if (target != null) {
    properties['対象'] = { select: { name: target } };
  }

  // tags → topic_tag（Multi-select）
  if (Array.isArray(tags) && tags.length > 0) {
    properties['topic_tag'] = {
      multi_select: tags.map(name => ({ name })),
    };
  }

  // body_text → 本文（Rich_text・2000字超は分割）
  if (body_text != null) {
    const text = String(body_text);
    const LIMIT = 2000;
    const blocks = [];
    for (let i = 0; i < text.length; i += LIMIT) {
      blocks.push({ text: { content: text.slice(i, i + LIMIT) } });
    }
    properties['本文'] = { rich_text: blocks };
  }

  // post_url → content_url（URL）
  if (post_url != null && post_url !== '') {
    properties['content_url'] = { url: post_url };
  }

  // post_date → date（Date）
  if (post_date != null) {
    properties['date'] = { date: { start: post_date } };
  }

  if (impressions != null) {
    properties['インプレッション'] = { number: Number(impressions) };
  }

  if (engagement != null) {
    properties['エンゲージメント'] = { number: Number(engagement) };
  }

  // rating → 評価（Select）
  if (rating != null) {
    properties['評価'] = { select: { name: rating } };
  }

  // reused_for → 転用済み先（Multi-select）
  if (Array.isArray(reused_for) && reused_for.length > 0) {
    properties['転用済み先'] = {
      multi_select: reused_for.map(name => ({ name })),
    };
  }

  // source_app → 蓄積元アプリ（Select）
  if (source_app != null) {
    properties['蓄積元アプリ'] = { select: { name: source_app } };
  }

  // status：page_id なし（新規）かつ status 未指定なら「下書き」を自動セット
  if (status != null) {
    properties['status'] = { select: { name: status } };
  } else if (!page_id) {
    properties['status'] = { select: { name: '下書き' } };
  }

  // 4. Notion API 呼び出し
  let notionRes;

  if (page_id) {
    notionRes = await fetch(`https://api.notion.com/v1/pages/${page_id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({ properties }),
    });
  } else {
    notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties,
      }),
    });
  }

  const notionData = await notionRes.json();

  if (!notionRes.ok) {
    console.error('Notion API error:', notionData);
    return new Response(
      JSON.stringify({ error: 'Notion API error', detail: notionData }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      notion_page_id: notionData.id,
      notion_url: notionData.url,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}
