/**
 * コンテンツくんを使ってよいかを決める（2026-10-28 開発部・会員公開の関門 2。思考整理くんの mindmap-access.js と同じ形）。
 * 使える人の一覧（CONTENT_ALLOW_UID）に居れば通す。居なければ門番 /gate/resolve に聞き、apps に content-os があれば通す（60 秒覚える）。
 * 返す値：no_token（札なし）／allowed／denied
 */
import { verifyIdToken } from "shia2n-core/server/db-gateway.js";

const gateCache = new Map();
const CACHE_MS = 60_000;

export async function canUseContent({ request, env, allowUids = [], verify = verifyIdToken, fetchFn = fetch }) {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return "no_token";
  try {
    const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
    const uid = await verify(token, projectId);
    if (allowUids.includes(uid)) return "allowed";
    const key = JSON.stringify([projectId, uid]);
    const cached = gateCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    gateCache.delete(key);

    const response = await fetchFn("https://shia2n-mcp.gameister1.workers.dev/gate/resolve", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return "denied";
    const body = await response.json();
    const result = body?.ok === true && Array.isArray(body.apps) && body.apps.includes("content-os")
      ? "allowed" : "denied";
    const now = Date.now();
    for (const [cacheKey, entry] of gateCache) {
      if (entry.expiresAt <= now) gateCache.delete(cacheKey);
    }
    gateCache.set(key, { result, expiresAt: now + CACHE_MS });
    return result;
  } catch {
    return "denied";
  }
}

// 2026-10-28 開発部（関門 2）：使える人の一覧。CONTENT_ALLOW_UID が空なら Naoki 1 人
export const NAOKI_UID = "VrMwzeSceqWeXVQOrm8kpu4uVR33";
export function allowListOf(env) {
  const list = String(env.CONTENT_ALLOW_UID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : [NAOKI_UID];
}
