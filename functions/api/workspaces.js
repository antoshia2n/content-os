/**
 * GET /api/workspaces — 今の人が入っている場所の一覧（左上の切り替えのメニュー用・2026-11-04）
 *
 * 自分の場所は含めない（画面の側で「自分」を先頭に足す）。入っているかの判断は shia2n-core の server/workspace.js。
 * コンテンツくんを使える人だけ（出入り口と同じ確かめ）。形はスワイプくん・X攻略くんの /api/workspaces と同じ。
 */
import { verifyIdToken } from "shia2n-core/server/db-gateway.js";
import { listWorkspaces } from "shia2n-core/server/workspace.js";
import { canUseContent, allowListOf } from "../_lib/content-access.js";

const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const access = await canUseContent({ request, env, allowUids: allowListOf(env) });
  if (access !== "allowed") return json({ ok: false, message: "この利用者にはコンテンツくんを使う許可がありません。" }, access === "no_token" ? 401 : 403);
  try {
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const uid = await verifyIdToken(token, env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID);
    return json({ ok: true, workspaces: await listWorkspaces({ env, uid }) });
  } catch (e) {
    return json({ ok: false, message: e?.message || "場所の一覧を読めませんでした" }, Number.isInteger(e?.status) ? e.status : 500);
  }
}
