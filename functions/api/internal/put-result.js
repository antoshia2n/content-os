// functions/api/internal/put-result.js
// 2026-11-10 開発部：依頼（content_requests）に初稿・仕上げを書き戻す口。
// 呼び出し元：shia2n-mcp の content_os__put_result（ChatGPT）
// 画像は base64 で受け、Supabase の置き場 contentos の requests/<依頼の番号>/ へ置いて、その住所を result_urls に足す。
// 書けるのは結果の欄と status だけ。依頼そのもの（何を作るか・指示）は GPT からは変えられない。
import { checkAuth, getSupabase, json, preflight } from './_shared.js';

const NEXT = ['drafting', 'review', 'done'];
const MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BYTES = 8 * 1024 * 1024;

export const onRequestOptions = () => preflight();

function b64ToBytes(b64) {
  const s = String(b64).replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function onRequestPost({ request, env }) {
  const denied = checkAuth(request, env);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const { user_id, id } = body || {};
  if (!user_id || !id) return json({ ok: false, error: 'user_id and id required' }, 400);
  const status = body.status || 'review';
  if (!NEXT.includes(status)) return json({ ok: false, error: 'bad status', allowed: NEXT }, 400);
  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env' }, 500);

  const gr = await fetch(`${sb.url}/rest/v1/content_requests?select=id,version,result_urls,status,kind&user_id=eq.${encodeURIComponent(user_id)}&id=eq.${encodeURIComponent(id)}`, { headers: sb.headers });
  if (!gr.ok) return json({ ok: false, error: 'supabase_error', detail: (await gr.text()).slice(0, 300) }, 502);
  const cur = (await gr.json())[0];
  if (!cur) return json({ ok: false, error: 'not_found', id }, 404);
  if (cur.kind === 'schedule') return json({ ok: false, error: 'not_found', id }, 404); // 予約の依頼は GPT から書けない
  if (cur.status === 'cancelled') return json({ ok: false, error: 'cancelled', message: 'この依頼は取り消されています' }, 409);

  // 画像を置く
  const urls = Array.isArray(cur.result_urls) ? [...cur.result_urls] : [];
  if (body.replace_images) urls.length = 0;
  const images = Array.isArray(body.images) ? body.images.slice(0, 6) : [];
  for (let i = 0; i < images.length; i++) {
    const im = images[i] || {};
    const mime = im.mime || 'image/png';
    const ext = MIME[mime];
    if (!ext) return json({ ok: false, error: 'bad mime', allowed: Object.keys(MIME) }, 400);
    let bytes;
    try { bytes = b64ToBytes(im.base64 || ''); } catch { return json({ ok: false, error: `image ${i} is not base64` }, 400); }
    if (!bytes.length || bytes.length > MAX_BYTES) return json({ ok: false, error: `image ${i} size`, max: MAX_BYTES }, 400);
    const path = `requests/${id}/${Date.now()}_${i}.${ext}`;
    const up = await fetch(`${sb.url}/storage/v1/object/contentos/${path}`, {
      method: 'POST',
      headers: { apikey: sb.headers.apikey, ...(sb.headers.Authorization ? { Authorization: sb.headers.Authorization } : {}), 'Content-Type': mime, 'x-upsert': 'false' },
      body: bytes,
    });
    if (!up.ok) return json({ ok: false, error: 'storage_error', detail: (await up.text()).slice(0, 300) }, 502);
    urls.push({ url: `${sb.url}/storage/v1/object/public/contentos/${path}`, label: im.label || '' });
  }
  // 外の住所（Drive など）をそのまま足す
  for (const u of (Array.isArray(body.urls) ? body.urls : []).slice(0, 10)) {
    if (typeof u === 'string' && /^https:\/\//.test(u)) urls.push({ url: u, label: '' });
  }

  const patch = { status, result_urls: urls, version: (cur.version || 1) + 1, updated_at: new Date().toISOString() };
  if (typeof body.result_text === 'string') patch.result_text = body.result_text.slice(0, 50000);
  if (typeof body.note === 'string') patch.note = body.note.slice(0, 2000);

  const ur = await fetch(`${sb.url}/rest/v1/content_requests?user_id=eq.${encodeURIComponent(user_id)}&id=eq.${encodeURIComponent(id)}&version=eq.${cur.version}`, {
    method: 'PATCH', headers: { ...sb.headers, Prefer: 'return=representation' }, body: JSON.stringify(patch),
  });
  if (!ur.ok) return json({ ok: false, error: 'supabase_error', detail: (await ur.text()).slice(0, 300) }, 502);
  const rows = await ur.json();
  if (!rows.length) return json({ ok: false, error: 'conflict', message: '同時に書き換えられました。読み直してください' }, 409);
  return json({ ok: true, request: rows[0] });
}
