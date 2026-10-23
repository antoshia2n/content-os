/**
 * /api/db/* — データの出入り口の受け皿
 *
 * 判断（本人の確認・絞り込み・鍵の付け替え）は shia2n-core 側に集約してある。
 * このファイルは「このアプリが触ってよい表」を渡し、上書き（upsert）の持ち主の確かめを足す（下の onRequest）。
 *
 * 正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
 */

import { createDbGateway, verifyIdToken } from "shia2n-core/server/db-gateway.js";

const gateway = createDbGateway({
  basePath: "/api/db",
  tables: {
    posts:                 { owner: "user_id" },
    accounts:              { owner: "user_id" },
    slots:                 { owner: "user_id" },
    notification_settings: { owner: "user_id" },
    sheet_genres:          { owner: "user_id" },
    content_templates:     { owner: "user_id" },
    // 2026-10-23 3便：スワイプくん・思考整理くんの表を「探す」ために読むだけ（書き換えはここで断る）
    sw_swipes:             { owner: "user_id", readOnly: true },
    mm_maps:               { owner: "user_id", readOnly: true },
    // 2026-10-23 4便：1 日 1 行の記録（書いた字数・計画・チェック・ひとこと）
    cos_days:              { owner: "user_id" },
  },
  functions: [],
});

// 2026-10-23 開発部：上書き（upsert）の前に、上書きされる行が本人のものかを確かめる。
// 共通の部品（shia2n-core）は POST に持ち主の絞り込みを付けないため、他人の行の番号を送るだけで
// その行の持ち主を書き換えられた。部品側の直し（作業 32）が入るまで、このアプリの入口で先に断る。
// 部品側に入ったら、この確かめは二重になるだけなので、外してよい。
const OWNER = "user_id";
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method.toUpperCase() === "POST") {
    const url = new URL(request.url);
    const table = url.pathname.replace(/^\/api\/db\/?/, "").split("/")[0];
    const prefer = request.headers.get("prefer") ?? "";
    if (table && table !== "rpc" && (/resolution\s*=/i.test(prefer) || url.searchParams.has("on_conflict"))) {
      const deny = (status, message) => new Response(JSON.stringify({ message }), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      try {
        const supabaseUrl = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
        const projectId = env.FIREBASE_PROJECT_ID ?? env.VITE_FIREBASE_PROJECT_ID ?? "";
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return deny(401, "ログインが必要です。");
        const uid = await verifyIdToken(token, projectId);
        const cols = (url.searchParams.get("on_conflict") || "id").split(",").map(c => c.replace(/"/g, "").trim()).filter(Boolean);
        if (!cols.includes(OWNER)) {
          let parsed;
          try { parsed = JSON.parse(await request.clone().text() || "{}"); } catch { return deny(400, "送信内容を読み取れませんでした。"); }
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          const q = v => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
          const keys = [...new Set(rows.filter(r => r && typeof r === "object" && cols.every(c => r[c] !== undefined && r[c] !== null))
            .map(r => cols.length === 1 ? `${cols[0]}.eq.${q(r[cols[0]])}` : `and(${cols.map(c => `${c}.eq.${q(r[c])}`).join(",")})`))];
          const headers = { apikey: serviceKey };
          if (/^eyJ/.test(String(serviceKey))) headers.Authorization = `Bearer ${serviceKey}`;
          for (let i = 0; i < keys.length; i += 50) {
            const p = new URLSearchParams({ select: OWNER, or: `(${keys.slice(i, i + 50).join(",")})`, [OWNER]: `neq.${uid}`, limit: "1" });
            const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${p.toString()}`, { headers });
            const found = res.ok ? await res.json().catch(() => null) : null;
            if (!Array.isArray(found)) return deny(502, "上書きする前に、行の持ち主を確かめられませんでした。");
            if (found.length) return deny(403, "ほかの人の行は上書きできません。");
          }
        }
      } catch {
        return deny(401, "ログインを確認できませんでした。");
      }
    }
  }
  return gateway(context);
}
