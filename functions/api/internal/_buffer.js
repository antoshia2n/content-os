// functions/api/internal/_buffer.js（2026-11-10 開発部・依頼の「予約」）
// 予約の依頼（content_requests.kind = 'schedule'）を Buffer に入れる中身。/api/buffer-schedule（画面のチェック）と
// /api/internal/run-schedules（shia2n-mcp の 30 分ごとの見回り）の両方から呼ぶ。ファイル名が _ で始まるので道にはならない。
// 引用（x_quote）は、引用元の投稿に X の住所（posts.x_url）が入るまで「引用元待ち」（waiting）で置く。
// 二重予約を防ぐ形は /api/buffer-schedule と同じ（pending: の印を先に付けた 1 回だけが送る）。

export const CHANNELS = { acc_1: "6a1690e4c687a22dd42e6782" };
const BUFFER_API_URL = "https://api.buffer.com";
const ORG_ID = "648c1688ecd52b1cde5f8523";

const enc = encodeURIComponent;
export const tweetIdOf = url => { const m = /\/status\/(\d{5,25})/.exec(String(url || "")); return m ? m[1] : null; };

async function patchRequest(sb, uid, id, fields) {
  await fetch(`${sb.url}/rest/v1/content_requests?user_id=eq.${enc(uid)}&id=eq.${enc(id)}`, {
    method: "PATCH", headers: { ...sb.headers, Prefer: "return=minimal" },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  }).catch(() => {});
}

/** 予約の依頼を 1 件、Buffer に入れる。返り値 { state: 'done'|'waiting'|'error', message?, buffer_post_id? } */
export async function runScheduleRequest(env, sb, uid, req) {
  const apiKey = env.BUFFER_API_KEY;
  if (!apiKey) return { state: "error", message: "設定の値 BUFFER_API_KEY がありません" };
  const fail = async message => { await patchRequest(sb, uid, req.id, { note: message.slice(0, 300) }); return { state: "error", message }; };
  const own = `id=eq.${enc(req.post_id)}&user_id=eq.${enc(uid)}`;
  const r = await fetch(`${sb.url}/rest/v1/posts?${own}&select=id,account_id,post_type,status,datetime,buffer_post_id,history`, { headers: sb.headers });
  const post = r.ok ? (await r.json())[0] : null;
  if (!post) return fail("投稿が見つかりません");
  const channelId = CHANNELS[post.account_id];
  if (!channelId) return fail("このアカウントには Buffer の窓口がありません");
  const type = post.post_type || "x_post";
  if (type !== "x_post" && type !== "x_quote") return fail("Buffer に入れられるのは Xポストと X引用だけです");
  if (post.buffer_post_id && !/^pending:\d{13}$/.test(post.buffer_post_id)) {
    await patchRequest(sb, uid, req.id, { status: "done", buffer_post_id: String(post.buffer_post_id) });
    return { state: "done", buffer_post_id: post.buffer_post_id };
  }
  // texts は文だけの並び（古い形）か、{ text, images } の並び（2026-11-10 画像つき）
  const parts = (Array.isArray(req.texts) ? req.texts : []).map(t => typeof t === "string" ? { text: t, images: [] } : { text: String(t?.text || ""), images: (Array.isArray(t?.images) ? t.images : []).filter(u => /^https:\/\//.test(String(u))).slice(0, 4) })
    .map(p => ({ text: p.text.trim(), images: p.images })).filter(p => p.text || p.images.length);
  if (!parts.length) return fail("予約の文が空です（チェックし直してください）");
  const assetsOf = p => p.images.map(url => ({ image: { url, metadata: { altText: "" } } }));
  const dt = String(post.datetime || "").slice(0, 16);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(dt)) return fail("日時が入っていません");
  const dueAt = `${dt}:00+09:00`;
  if (new Date(dueAt).getTime() < Date.now() + 2 * 60 * 1000) {
    // 日時を過ぎたものは見回りが毎回やり直さないよう、取り消しにして理由を残す
    await patchRequest(sb, uid, req.id, { status: "cancelled", note: "日時を過ぎたので予約しませんでした。日時を直してもう一度チェックしてください" });
    return { state: "error", message: "日時が過ぎています" };
  }

  // 引用元の X の番号
  let retweetId = null;
  if (type === "x_quote") {
    if (!req.quote_post_id) return fail("引用元が選ばれていません");
    const sr = await fetch(`${sb.url}/rest/v1/posts?id=eq.${enc(req.quote_post_id)}&user_id=eq.${enc(uid)}&select=id,x_url`, { headers: sb.headers });
    const src = sr.ok ? (await sr.json())[0] : null;
    if (!src) return fail("引用元の投稿が見つかりません");
    retweetId = tweetIdOf(src.x_url);
    if (!retweetId) {
      if (req.status !== "waiting") await patchRequest(sb, uid, req.id, { status: "waiting", note: null });
      return { state: "waiting" };
    }
  }

  // 先に「入れている途中」の印
  const pending = `pending:${Date.now()}`;
  const claim = await fetch(`${sb.url}/rest/v1/posts?${own}&buffer_post_id=is.null`, {
    method: "PATCH", headers: { ...sb.headers, Prefer: "return=representation" }, body: JSON.stringify({ buffer_post_id: pending }),
  });
  const claimed = claim.ok ? await claim.json().catch(() => []) : [];
  if (!Array.isArray(claimed) || claimed.length !== 1) return { state: "error", message: "もう Buffer に入れているところです" };
  const release = () => fetch(`${sb.url}/rest/v1/posts?${own}&buffer_post_id=eq.${enc(pending)}`, {
    method: "PATCH", headers: { ...sb.headers, Prefer: "return=minimal" }, body: JSON.stringify({ buffer_post_id: null }),
  }).catch(() => {});

  const input = { channelId, schedulingType: "automatic", mode: "customScheduled", dueAt, assets: retweetId ? [] : assetsOf(parts[0]), needsApproval: false, text: parts[0].text, source: "content-os" };
  if (retweetId) input.metadata = { twitter: { retweet: { id: retweetId } } };
  else if (parts.length > 1) input.metadata = { twitter: { thread: parts.map(p => ({ text: p.text, assets: assetsOf(p) })) } };
  const mutation = `mutation Schedule($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`;
  let br;
  try {
    br = await fetch(BUFFER_API_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ query: mutation, variables: { input } }), signal: AbortSignal.timeout(20000) });
  } catch {
    return { state: "error", message: "Buffer の返事が遅れました。Buffer の画面で入ったかを見てください" };
  }
  const payload = await br.json().catch(() => ({}));
  const res = payload?.data?.createPost;
  if (!br.ok || payload?.errors?.length || res?.__typename !== "PostActionSuccess" || !res?.post?.id) {
    await release();
    return fail(`Buffer が受け付けませんでした（${String(payload?.errors?.[0]?.message || res?.message || br.status).slice(0, 200)}）`);
  }
  const bufferId = String(res.post.id);
  const history = Array.isArray(post.history) ? post.history : [];
  await fetch(`${sb.url}/rest/v1/posts?${own}`, {
    method: "PATCH", headers: { ...sb.headers, Prefer: "return=minimal" },
    body: JSON.stringify({ buffer_post_id: bufferId, status: "reserved", history: [...history, { at: new Date().toISOString(), note: `Buffer に予約した（${bufferId}${retweetId ? `・引用 ${retweetId}` : ""}）` }] }),
  });
  await patchRequest(sb, uid, req.id, { status: "done", buffer_post_id: bufferId, note: null });
  return { state: "done", buffer_post_id: bufferId };
}

/** 送信済みの Buffer の投稿から X の住所を取り、posts.x_url が空の行に入れる。返り値 { count, seen, error } */
export async function refreshXUrls(env, sb, uid) {
  const apiKey = env.BUFFER_API_KEY;
  if (!apiKey) return { count: 0, error: "BUFFER_API_KEY がありません" };
  const channelId = env.BUFFER_CHANNEL_ID || CHANNELS.acc_1;
  const query = `query { posts(first: 50, input: { organizationId: "${env.BUFFER_ORG_ID || ORG_ID}", filter: { status: [sent], channelIds: ["${channelId}"] } }) { edges { node { id externalLink } } } }`;
  const br = await fetch(BUFFER_API_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!br) return { count: 0, error: "Buffer に届きませんでした" };
  const payload = await br.json().catch(() => ({}));
  if (!br.ok || payload?.errors?.length) return { count: 0, error: `Buffer の返事：${String(payload?.errors?.[0]?.message || br.status).slice(0, 200)}` };
  const nodes = (payload?.data?.posts?.edges || []).map(e => e.node).filter(n => n?.id && tweetIdOf(n.externalLink));
  if (!nodes.length) return { count: 0, seen: 0 };
  const ids = nodes.map(n => `"${String(n.id).replace(/"/g, "")}"`).join(",");
  const pr = await fetch(`${sb.url}/rest/v1/posts?user_id=eq.${enc(uid)}&x_url=is.null&buffer_post_id=in.(${enc(ids)})&select=id,buffer_post_id`, { headers: sb.headers });
  if (!pr.ok) return { count: 0, seen: nodes.length, error: `表を読めませんでした（${pr.status}）` };
  let n = 0;
  for (const p of await pr.json()) {
    const node = nodes.find(x => String(x.id) === String(p.buffer_post_id));
    if (!node) continue;
    const u = await fetch(`${sb.url}/rest/v1/posts?id=eq.${enc(p.id)}&user_id=eq.${enc(uid)}&x_url=is.null`, { method: "PATCH", headers: { ...sb.headers, Prefer: "return=minimal" }, body: JSON.stringify({ x_url: node.externalLink }) });
    if (u.ok) n++;
  }
  return { count: n, seen: nodes.length };
}

/** 予約を取り消す：Buffer から外し、投稿の Buffer の番号を空にし、依頼を取り消しにする。返り値 { ok, message? } */
export async function cancelScheduleRequest(env, sb, uid, req) {
  const id = req.buffer_post_id;
  if (id && !/^pending:/.test(id)) {
    const mutation = `mutation Del($input: DeletePostInput!) { deletePost(input: $input) { __typename ... on MutationError { message } } }`;
    let ok = false, msg = "";
    try {
      const br = await fetch(BUFFER_API_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BUFFER_API_KEY}` }, body: JSON.stringify({ query: mutation, variables: { input: { id } } }), signal: AbortSignal.timeout(20000) });
      const payload = await br.json().catch(() => ({}));
      const t = payload?.data?.deletePost?.__typename || "";
      ok = br.ok && !payload?.errors?.length && !/Error$/.test(t);
      msg = payload?.errors?.[0]?.message || payload?.data?.deletePost?.message || (ok ? "" : String(br.status));
    } catch (e) { msg = String(e); }
    if (!ok) return { ok: false, message: `Buffer から外せませんでした。Buffer の画面で取り消してください（${String(msg).slice(0, 160)}）` };
    await fetch(`${sb.url}/rest/v1/posts?id=eq.${enc(req.post_id)}&user_id=eq.${enc(uid)}&buffer_post_id=eq.${enc(id)}`, {
      method: "PATCH", headers: { ...sb.headers, Prefer: "return=minimal" }, body: JSON.stringify({ buffer_post_id: null }),
    }).catch(() => {});
  }
  await patchRequest(sb, uid, req.id, { status: "cancelled", note: "予約を取り消した" });
  return { ok: true };
}
