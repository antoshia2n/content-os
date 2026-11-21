// functions/api/internal/put-post-images.js
// 2026-11-17 開発部（タスク「作った画像の保管」・Naoki OK 11:01）
// GPT で作って X で直接予約した画像ポストの画像を、投稿（posts）の本文の末尾へ入れる口。
// 呼び出し元：shia2n-mcp の content_os__put_images（post_id を渡したとき）
// 画像は base64 で受け、Supabase の置き場 contentos の posts/<投稿の番号>/ へ置き、
// 本文の末尾に <p><img></p> を足す（エディタの画像と同じ形。画像つきコピー・画像の一括保存にそのまま乗る）。
// 1 回に 6 枚まで。1 投稿につき、この口で置いた画像は 20 枚まで。
// replace_images=true のときは、この口で前に置いた画像（posts/<番号>/ の住所）だけを本文から外す。手で入れた画像は触らない。
// 2026-11-21 開発部：images[].at（本文の印の文字）を渡すと、末尾ではなくその印の段落のすぐ後ろへ入れる（中身は _markers.js）。
//   印がちょうど 1 つ見つからない画像が 1 枚でもあれば、1 枚も置かずに止める（marker_not_found）。
//   check_markers（文字の配列）だけを渡すと、書かずに印ごとの当たり数を返す（呼ぶ側が最初に全部の印を下見するため）。
//   drop_markers（文字の配列）を渡すと、画像を入れたあとでその印の段落を本文から外す。
import { checkAuth, getSupabase, json, preflight } from './_shared.js';
import { sniffImage } from './_sniff.js'; // 2026-11-21 中身が画像でなければ 1 枚も置かない
import { checkMarkers, dropMarkers, findMarker, insertAtMarker } from './_markers.js';

const MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PER_POST = 20;
const IMG_STYLE = 'max-width:100%;width:100%;border-radius:8px;display:block;margin-left:0;margin-right:auto;';

export const onRequestOptions = () => preflight();

function b64ToBytes(b64) {
  const s = String(b64).replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function onRequestPost({ request, env }) {
  const denied = checkAuth(request, env);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const { user_id } = body || {};
  const postId = String(body?.post_id ?? '').trim();
  if (!user_id || !/^\d+$/.test(postId)) return json({ ok: false, error: 'user_id and post_id (number) required' }, 400);
  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env' }, 500);

  const enc = encodeURIComponent;
  const gr = await fetch(`${sb.url}/rest/v1/posts?select=id,title,body,datetime,updated_at&user_id=eq.${enc(user_id)}&id=eq.${enc(postId)}`, { headers: sb.headers });
  if (!gr.ok) return json({ ok: false, error: 'supabase_error', detail: (await gr.text()).slice(0, 300) }, 502);
  const cur = (await gr.json())[0];
  if (!cur) return json({ ok: false, error: 'not_found', post_id: postId }, 404);

  const base = `${sb.url}/storage/v1/object/public/contentos/posts/${postId}/`;
  const mine = new RegExp(`<p>\\s*<img[^>]*src="${escRe(base)}[^"]*"[^>]*>\\s*</p>`, 'g');
  let html = String(cur.body || '');
  if (body.replace_images) html = html.replace(mine, '');
  const already = (html.match(mine) || []).length;

  if (Array.isArray(body.check_markers)) {
    return json({ ok: true, markers: checkMarkers(html, body.check_markers) });
  }

  const images = Array.isArray(body.images) ? body.images.slice(0, 6) : [];
  if (!images.length) return json({ ok: false, error: 'images required' }, 400);
  const badAt = images
    .map((im, i) => ({ i, at: String(im?.at || ''), count: im?.at ? findMarker(html, im.at).count : 1 }))
    .filter((x) => x.count !== 1);
  if (badAt.length) {
    return json({ ok: false, error: 'marker_not_found', message: '本文の印がちょうど 1 つ見つからない画像があります（1 枚も置いていません）', markers: badAt }, 400);
  }
  if (already + images.length > MAX_PER_POST) {
    return json({ ok: false, error: 'too_many', message: `1 投稿に置ける画像は ${MAX_PER_POST} 枚までです（今 ${already} 枚）`, max: MAX_PER_POST }, 400);
  }

  const added = [];
  // 2026-11-21：先に全部の中身を確かめる（画像でないものが 1 枚でもあれば、1 枚も置かない）。種類は中身で決める
  for (let i = 0; i < images.length; i++) {
    let b;
    try { b = b64ToBytes(images[i]?.base64 || ''); } catch { return json({ ok: false, error: `image ${i} is not base64` }, 400); }
    const real = sniffImage(b);
    if (!real) return json({ ok: false, error: 'not_image', message: `${i + 1} 枚目は画像（png・jpeg・webp・gif）ではありません（1 枚も置いていません）`, index: i }, 400);
    images[i] = { ...(images[i] || {}), mime: real };
  }
  for (let i = 0; i < images.length; i++) {
    const im = images[i] || {};
    const mime = im.mime || 'image/png';
    const ext = MIME[mime];
    if (!ext) return json({ ok: false, error: 'bad mime', allowed: Object.keys(MIME) }, 400);
    let bytes;
    try { bytes = b64ToBytes(im.base64 || ''); } catch { return json({ ok: false, error: `image ${i} is not base64` }, 400); }
    if (!bytes.length || bytes.length > MAX_BYTES) return json({ ok: false, error: `image ${i} size`, max: MAX_BYTES }, 400);
    const path = `posts/${postId}/${Date.now()}_${already + i}.${ext}`;
    const up = await fetch(`${sb.url}/storage/v1/object/contentos/${path}`, {
      method: 'POST',
      headers: { apikey: sb.headers.apikey, ...(sb.headers.Authorization ? { Authorization: sb.headers.Authorization } : {}), 'Content-Type': mime, 'x-upsert': 'false' },
      body: bytes,
    });
    if (!up.ok) return json({ ok: false, error: 'storage_error', detail: (await up.text()).slice(0, 300) }, 502);
    const url = `${sb.url}/storage/v1/object/public/contentos/${path}`;
    const tag = `<p><img src="${url}" alt="${esc(im.label)}" style="${IMG_STYLE}"/></p>`;
    if (im.at) {
      const next = insertAtMarker(html, im.at, tag, base);
      if (next === null) return json({ ok: false, error: 'marker_not_found', message: `印「${im.at}」が見つかりません` }, 400);
      html = next;
    } else {
      html += tag;
    }
    added.push({ url, label: im.label || '', at: im.at || null });
  }
  let dropped = 0;
  if (Array.isArray(body.drop_markers) && body.drop_markers.length) {
    ({ html, dropped } = dropMarkers(html, body.drop_markers));
  }

  // 同時に本文が書き換えられていたら止める（updated_at で確かめる）
  const ur = await fetch(`${sb.url}/rest/v1/posts?select=id,title,datetime,status&user_id=eq.${enc(user_id)}&id=eq.${enc(postId)}&updated_at=eq.${enc(cur.updated_at)}`, {
    method: 'PATCH', headers: { ...sb.headers, Prefer: 'return=representation' }, body: JSON.stringify({ body: html, updated_at: new Date().toISOString() }),
  });
  if (!ur.ok) return json({ ok: false, error: 'supabase_error', detail: (await ur.text()).slice(0, 300) }, 502);
  const rows = await ur.json();
  if (!rows.length) return json({ ok: false, error: 'conflict', message: '同時に書き換えられました。もう一度呼んでください' }, 409);

  const all = [...html.matchAll(new RegExp(`src="(${escRe(base)}[^"]*)"`, 'g'))].map((m) => m[1]);
  return json({ ok: true, post: rows[0], added, images: all, dropped_markers: dropped });
}
