// functions/api/diag.js
// 診断画面（/diag）から呼ばれる、サーバー側の状態確認。
//
// 【2026-08-01 新設】診断画面はログインの外側で開くため、
//   返すのは「OK / NG」だけにする。
//   接続先・キーの断片・件数・エラー本文は返さない。
//   正本：2026-07-31 決定「認証の外に置く診断画面は表示を存在確認だけに削る」

import { checkDbGateway } from "shia2n-core/server/db-gateway.js";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export async function onRequestGet(context) {
  const { env } = context;

  const result = {
    gateway: "NG",   // 画面からの読み書きをサーバーで受けられるか
    internal: "NG",  // AI から操作する内部APIの鍵が入っているか
  };

  try {
    const gate = await checkDbGateway(env);
    result.gateway = gate.ok ? "OK" : "NG";
  } catch {
    result.gateway = "NG";
  }

  const url    = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key    = env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = env.MCP_INTERNAL_SECRET;
  result.internal = url && key && secret ? "OK" : "NG";

  return new Response(JSON.stringify(result), { status: 200, headers: HEADERS });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: HEADERS });
}
