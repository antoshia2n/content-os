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

const READ_TEST_TABLE = "posts";

// ── 読み取り試験（表を1件だけ読んでみる）─────────────────────────────
// 「つながるか」だけでは、権限が外れて読めない状態を見抜けないため足した。
// 返すのは結果の言葉だけ。件数・中身・接続先・鍵の断片は一切返さない。
// 依頼書：3b39c6c1-c439-81e7-b29b-ff494da41481
async function readTest(url, key) {
  if (!url || !key) return "確認できず";
  try {
    const res = await fetch(`${url}/rest/v1/${READ_TEST_TABLE}?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return "読めた";
    if (res.status === 401 || res.status === 403) return "断られた";
    return "NG";
  } catch {
    return "確認できず";
  }
}

export async function onRequestGet(context) {
  const { env } = context;

  const result = {
    gateway: "NG",         // 画面からの読み書きをサーバーで受けられるか
    gateway_switch: "NG",  // 画面が受け皿を経由する設定になっているか
    internal: "NG",        // AI から操作する内部APIの鍵が入っているか
    read_test: {},         // 公開キー／サービス用の鍵で表を読めるか
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

  // 画面を受け皿経由に切り替える印が入っているか
  result.gateway_switch = env.VITE_DB_GATEWAY ? "設定あり" : "未設定";

  const [anonRead, serviceRead] = await Promise.all([
    readTest(url, env.VITE_SUPABASE_ANON_KEY),
    readTest(url, key),
  ]);
  result.read_test = { anon: anonRead, service_role: serviceRead };

  return new Response(JSON.stringify(result), { status: 200, headers: HEADERS });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: HEADERS });
}
