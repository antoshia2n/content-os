// api/notion.js
// Vercel サーバーレス関数 — Notion API プロキシ
// 環境変数（Vercel Dashboard > Settings > Environment Variables）:
//   NOTION_SECRET      : Notion インテグレーションのシークレット
//   NOTION_DATABASE_ID : 保存先データベースのID（アウトプットDB）

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.NOTION_SECRET;
  const dbId   = process.env.NOTION_DATABASE_ID;

  if (!secret || !dbId) {
    return res.status(500).json({ error: "Notion環境変数が設定されていません" });
  }

  const { title, body, status, postType, datetime } = req.body;

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
  // media（postType）の対応
  const MEDIA_MAP = {
    x_post:    "Xポスト",
    x_quote:   "X引用",
    x_article: "X記事",
    note:      "note",
    membership:"メンシプ",
    paid:      "有料",
    other:     "その他",
  };

  // status の対応
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
    // タイトル列（Notionのtitleプロパティ）
    title: {
      title: [{ text: { content: title || "無題" } }],
    },
  };

  // media（セレクト）
  if (postType && MEDIA_MAP[postType]) {
    properties.media = { select: { name: MEDIA_MAP[postType] } };
  }

  // date（日付）— "2026-02-28T12:00" → "2026-02-28T12:00:00+09:00"
  if (datetime) {
    const iso = datetime.length === 16 ? datetime + ":00+09:00" : datetime;
    properties.date = { date: { start: iso } };
  }

  // status（セレクト）
  if (status && STATUS_MAP[status]) {
    properties.status = { select: { name: STATUS_MAP[status] } };
  }

  // score・topic_tag・content_url はContentOSに対応フィールドがないためスキップ

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
      console.error("Notion API error:", data);
      return res.status(notionRes.status).json({
        error: data.message || "Notion APIエラー",
        code:  data.code,
      });
    }

    return res.status(200).json({ url: data.url, id: data.id });

  } catch (err) {
    console.error("Fetch error:", err);
    return res.status(500).json({ error: "サーバーエラー: " + err.message });
  }
}
