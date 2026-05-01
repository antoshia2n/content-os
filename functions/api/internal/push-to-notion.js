// functions/api/internal/push-to-notion.js
// Cloudflare Functions — Notion API プロキシ
// 呼び出し元：App.jsx（同一オリジン SPA）
// 認証：不要（同一オリジン呼び出し＝CORS保護で十分、NOTION_SECRETはサーバー側で保護）
//
// 環境変数（Cloudflare Pages > Settings > Environment Variables）:
//   NOTION_SECRET        : Notion インテグレーションのシークレット
//   NOTION_DATABASE_ID   : 保存先データベースのID（アウトプットDB）

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env.NOTION_SECRET;
  const dbId   = env.NOTION_DATABASE_ID;

  if (!secret || !dbId) {
    return new Response(
      JSON.stringify({ error: "Notion環境変数が設定されていません" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const { title, body, status, postType, datetime, memo } = await request.json();

  // ── HTML → Notion ブロック変換 ──────────────────────
  function htmlToBlocks(html) {
    if (!html) return [];
    const blocks = [];

    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim());
    const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim());
    const lis = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim());
    const bqs = [...html.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim());

    const plain = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/h1>/gi, "\n")
      .replace(/<\/h2>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/blockquote>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "");

    const lines = plain.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    for (const line of lines) {
      const rich = [{ type: "text", text: { content: line.slice(0, 2000) } }];
      if      (h1s.includes(line)) blocks.push({ object:"block", type:"heading_1",         heading_1:         { rich_text: rich } });
      else if (h2s.includes(line)) blocks.push({ object:"block", type:"heading_2",         heading_2:         { rich_text: rich } });
      else if (lis.includes(line)) blocks.push({ object:"block", type:"bulleted_list_item", bulleted_list_item:{ rich_text: rich } });
      else if (bqs.includes(line)) blocks.push({ object:"block", type:"quote",             quote:             { rich_text: rich } });
      else                         blocks.push({ object:"block", type:"paragraph",         paragraph:         { rich_text: rich } });
      if (blocks.length >= 99) break;
    }
    return blocks;
  }

  // ── ContentOS → Notion プロパティマッピング ──────────
  const MEDIA_MAP = {
    x_post:    "Xポスト",
    x_quote:   "X引用",
    x_article: "X記事",
    note:      "note",
    membership:"メンシプ",
    paid:      "有料",
    other:     "その他",
  };

  const STATUS_MAP = {
    draft:     "下書き",
    review:    "レビュー待ち",
    waiting:   "予約待ち",
    reserved:  "予約済み",
    published: "公開済",
    popular:   "好評",
    flop:      "不評",
  };

  // ── プロパティ組み立て ────────────────────────────
  const properties = {
    title: {
      title: [{ text: { content: title || "無題" } }],
    },
  };

  if (postType && MEDIA_MAP[postType]) {
    properties.media = { select: { name: MEDIA_MAP[postType] } };
  }

  if (datetime) {
    const iso = datetime.length === 16 ? datetime + ":00+09:00" : datetime;
    properties.date = { date: { start: iso } };
  }

  if (status && STATUS_MAP[status]) {
    properties.status = { select: { name: STATUS_MAP[status] } };
  }

  const blocks = htmlToBlocks(body);

  // ── Notion API コール ─────────────────────────────
  try {
    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${secret}`,
        "Content-Type":   "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent:     { database_id: dbId },
        properties,
        children:   blocks,
      }),
    });

    const data = await notionRes.json();

    if (!notionRes.ok) {
      return new Response(
        JSON.stringify({ error: data.message || "Notion APIエラー", code: data.code }),
        { status: notionRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ url: data.url, id: data.id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "サーバーエラー: " + err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
