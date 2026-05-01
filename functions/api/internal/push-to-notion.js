// functions/api/internal/push-to-notion.js
// コンテンツくん → Notion コンテンツアウトプットDB push
// 設計書：コンテンツアウトプットDB 設計書（2026-05-01）§4
// Cloudflare Functions 形式

// CORS ヘッダー（shia2n-mcp 等の外部オリジンからも呼ばれるため付与）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// OPTIONS プリフライト対応
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // ────────────────────────────────────────────────
  // 1. 認証チェック（MCP_INTERNAL_SECRET）
  // ────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.MCP_INTERNAL_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // ────────────────────────────────────────────────
  // 2. リクエストボディ取得
  // ────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // ────────────────────────────────────────────────
  // 3. フィールド展開
  //
  // 【草案保存時】に送るフィールド:
  //   title, content_type, target, tags, body_text, source_app
  //
  // 【投稿完了マーク時】に追加で送るフィールド（page_id 必須）:
  //   page_id, post_url, post_date
  //
  // 【パフォーマンス更新時（X-PDCA → Notion）】:
  //   page_id, impressions, engagement, rating
  // ────────────────────────────────────────────────
  const {
    page_id,       // string | undefined — 更新時は既存 Notion ページ ID を指定
    title,         // string — コンテンツタイトル / 見出し
    content_type,  // string — "Xポスト" | "X記事" | "note" | "セミナー" | "メルマガ"
    target,        // string — "自分" | "クライアント"
    tags,          // string[] — テーマタグ（例: ["思考", "X運用"]）
    body_text,     // string — 本文テキスト（2000字超は自動分割）
    post_url,      // string — 投稿後の URL（X / note 等）
    post_date,     // string — 投稿日 ISO8601（例: "2026-05-01"）
    impressions,   // number — インプレッション数
    engagement,    // number — エンゲージメント数（いいね+リプ+引用+RT）
    rating,        // string — "高" | "中" | "低"
    reused_for,    // string[] — 転用済み先（例: ["X記事→note"]）
    source_app,    // string — "コンテンツくん" | "X-PDCA" | "手動"
  } = body;

  const notionSecret = env.NOTION_SECRET;
  const dbId = env.NOTION_DATABASE_ID; // コンテンツアウトプットDB の ID をセット

  if (!notionSecret || !dbId) {
    return new Response(JSON.stringify({ error: 'Missing env: NOTION_SECRET or NOTION_DATABASE_ID' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // ────────────────────────────────────────────────
  // 4. Notion properties オブジェクト構築
  //    → undefined / null のフィールドは含めない（部分更新に対応）
  // ────────────────────────────────────────────────
  const properties = {};

  if (title != null) {
    properties['タイトル'] = {
      title: [{ text: { content: String(title) } }],
    };
  }

  if (content_type != null) {
    properties['コンテンツ種別'] = { select: { name: content_type } };
  }

  if (target != null) {
    properties['対象'] = { select: { name: target } };
  }

  if (Array.isArray(tags) && tags.length > 0) {
    properties['テーマタグ'] = {
      multi_select: tags.map(name => ({ name })),
    };
  }

  // 本文: Notion rich_text は 1ブロック 2000字上限 → 超過分は第2ブロックに分割
  if (body_text != null) {
    const text = String(body_text);
    const LIMIT = 2000;
    const blocks = [];
    for (let i = 0; i < text.length; i += LIMIT) {
      blocks.push({ text: { content: text.slice(i, i + LIMIT) } });
    }
    properties['本文'] = { rich_text: blocks };
  }

  if (post_url != null && post_url !== '') {
    properties['投稿URL'] = { url: post_url };
  }

  if (post_date != null) {
    properties['投稿日'] = { date: { start: post_date } };
  }

  if (impressions != null) {
    properties['インプレッション'] = { number: Number(impressions) };
  }

  if (engagement != null) {
    properties['エンゲージメント'] = { number: Number(engagement) };
  }

  if (rating != null) {
    properties['評価'] = { select: { name: rating } };
  }

  if (Array.isArray(reused_for) && reused_for.length > 0) {
    properties['転用済み先'] = {
      multi_select: reused_for.map(name => ({ name })),
    };
  }

  if (source_app != null) {
    properties['蓄積元アプリ'] = { select: { name: source_app } };
  }

  // ────────────────────────────────────────────────
  // 5. Notion API 呼び出し
  //    page_id あり → 既存ページ更新（PATCH）
  //    page_id なし → 新規ページ作成（POST）
  // ────────────────────────────────────────────────
  let notionRes;

  if (page_id) {
    // 既存ページ更新
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
    // 新規ページ作成
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
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      }
    );
  }

  // ────────────────────────────────────────────────
  // 6. 正常レスポンス
  //    notion_page_id を返す → Supabase の posts に保存して更新時に使う
  // ────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      ok: true,
      notion_page_id: notionData.id,
      notion_url: notionData.url,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    }
  );
}
