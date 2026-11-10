// functions/api/internal/run-schedules.js（2026-11-10 開発部）
// shia2n-mcp の 30 分ごとの見回りから呼ぶ。①送信済みの投稿の X の住所を残す ②予約の依頼（未着手・引用元待ち）を Buffer に入れる
import { checkAuth, getSupabase, json, preflight } from './_shared.js';
import { runScheduleRequest, refreshXUrls } from './_buffer.js';

export const onRequestOptions = () => preflight();

export async function onRequestPost({ request, env }) {
  const denied = checkAuth(request, env);
  if (denied) return denied;
  let body = {};
  try { body = await request.json(); } catch { /* 空でもよい */ }
  const uid = body?.user_id;
  if (!uid) return json({ ok: false, error: 'user_id required' }, 400);
  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env' }, 500);
  const urls = await refreshXUrls(env, sb, uid).catch(e => ({ count: 0, error: String(e) }));
  const q = `${sb.url}/rest/v1/content_requests?user_id=eq.${encodeURIComponent(uid)}&kind=eq.schedule&status=in.(queued,waiting)&select=*&order=created_at.asc&limit=20`;
  const r = await fetch(q, { headers: sb.headers });
  if (!r.ok) return json({ ok: false, error: 'supabase_error', detail: (await r.text()).slice(0, 300), x_urls: urls }, 502);
  const out = { done: 0, waiting: 0, error: 0 };
  const errors = [];
  for (const req of await r.json()) {
    const res = await runScheduleRequest(env, sb, uid, req).catch(e => ({ state: 'error', message: String(e) }));
    out[res.state] = (out[res.state] || 0) + 1;
    if (res.state === 'error') errors.push({ id: req.id, message: res.message });
  }
  return json({ ok: true, x_urls: urls, ...out, errors });
}
