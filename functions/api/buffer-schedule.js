/**
 * /api/buffer-schedule — コンテンツくんの 1 本を Buffer に予約する（2026-10-23 作り直し 2便）
 *
 * 押すと本物の X 予約になるので、画面側で「日時と本文を見せる確認」を 1 回はさんでから呼ぶ。
 * 自動では呼ばない（予約済みにしただけでは何も起きない）。
 *
 * 通すのは持ち主だけ：Firebase のログイン証明を検証し、メールが持ち主のもの（ハッシュで照合）のときだけ送る。
 * 送る条件（ここでもう一度確かめる）：
 *   - Buffer の窓口があるアカウント（CHANNELS）
 *   - 種類が Xポスト（X記事は Buffer が対応している証拠が無いので送らない）
 *   - 状態が予約済み・日時が入っていて、今より先
 *   - まだ Buffer に入れていない（buffer_post_id が空）
 * 入れたら Buffer の番号を posts.buffer_post_id に残す（毎日の数字の取り込みがこの番号で突き合わせる）。
 * 2026-10-23 5便：二重予約を防ぐため、Buffer へ送る前に「入れている途中」の印（pending:）を先に付け、
 *   印を付けられた 1 回だけが送る。送れなかったら印を外す。行は本人のものだけを読む・書く。
 *
 * 使う設定の値（どれも既存。新しく足す値は無い）
 *   BUFFER_API_KEY                … 毎日の数字の取り込み（sync-buffer-metrics）と同じもの
 *   FIREBASE_PROJECT_ID           … ログイン証明の検証（/api/db と同じもの）
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY … 内部API と同じもの
 */

import { verifyIdToken } from "shia2n-core/server/db-gateway.js";
import { getSupabase } from "./internal/_shared.js";

// 持ち主のメールの SHA-256（notion-memo と同じ値。公開リポジトリなのでメールそのものは書かない）
const OWNER_EMAIL_SHA256 = "756149e97cb41bd690c46aee9ddaa59efa4c92953f8807c939a5a56157036c26";

// アカウント → Buffer のチャンネル。いま窓口があるのはシアニン（X @antoshia2n）だけ
const CHANNELS = { acc_1: "6a1690e4c687a22dd42e6782" };
const BUFFER_API_URL = "https://api.buffer.com";

const HEADERS = { "Content-Type": "application/json" };
const out = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: HEADERS });

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function tokenEmail(token) {
  const raw = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = new TextDecoder().decode(Uint8Array.from(atob(raw + "===".slice((raw.length + 3) % 4)), c => c.charCodeAt(0)));
  const p = JSON.parse(json);
  return p.email_verified ? String(p.email || "").toLowerCase() : "";
}

// 失敗も 200 で返す（5xx は途中で Cloudflare の画面に置き換わることがあり、理由が画面に届かないため）
export async function onRequestPost(context) {
  try {
    return await handle(context);
  } catch (e) {
    console.error("[buffer-schedule]", e);
    return out({ ok: false, error: "中で止まりました。少しおいてもう一度試してください" });
  }
}

async function handle({ request, env }) {
  const apiKey = env.BUFFER_API_KEY;
  const projectId = env.FIREBASE_PROJECT_ID ?? env.VITE_FIREBASE_PROJECT_ID ?? "";
  const sb = getSupabase(env);
  if (!apiKey || !projectId || !sb) return out({ ok: false, error: "設定の値（BUFFER_API_KEY・FIREBASE_PROJECT_ID・SUPABASE）が足りません" });

  // 1. 持ち主か
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let uid;
  try {
    uid = await verifyIdToken(token, projectId);
  } catch {
    return out({ ok: false, error: "ログインを確認できませんでした。開き直してください" });
  }
  if ((await sha256Hex(tokenEmail(token))) !== OWNER_EMAIL_SHA256) {
    return out({ ok: false, error: "この機能は持ち主だけが使えます" });
  }

  // 2. 送られた中身
  let body;
  try { body = await request.json(); } catch { return out({ ok: false, error: "送られた形が正しくありません" }); }
  const postId = Number(body?.post_id);
  const texts = Array.isArray(body?.texts) ? body.texts.map(t => String(t || "").replace(/\r\n?/g, "\n").trim()) : [];
  if (!postId) return out({ ok: false, error: "どの投稿かがわかりません" });
  if (!texts.length || texts.some(t => !t)) return out({ ok: false, error: "本文が空のポストがあります" });
  if (texts.length > 25) return out({ ok: false, error: "スレッドが長すぎます（25 本まで）" });

  // 3. 投稿を表から読み、条件を確かめる（画面の値ではなく表の値で判断する）
  const sel = "id,account_id,post_type,status,datetime,buffer_post_id,history";
  const own = `id=eq.${postId}&user_id=eq.${encodeURIComponent(uid)}`;
  const res = await fetch(`${sb.url}/rest/v1/posts?${own}&select=${sel}`, { headers: sb.headers });
  if (!res.ok) return out({ ok: false, error: `投稿を読めませんでした（${res.status}）` });
  const post = (await res.json())[0];
  if (!post) return out({ ok: false, error: "投稿が見つかりません" });
  const channelId = CHANNELS[post.account_id];
  if (!channelId) return out({ ok: false, error: "このアカウントには Buffer の窓口がありません" });
  if ((post.post_type || "x_post") !== "x_post") return out({ ok: false, error: "Buffer に入れられるのは Xポストだけです" });
  // 印（pending:）が 30 分より古いときは、途中で止まったものとみなして押し直せる
  const staleBefore = `pending:${Date.now() - 30 * 60 * 1000}`;
  const stalePending = /^pending:\d{13}$/.test(post.buffer_post_id || "") && post.buffer_post_id < staleBefore;
  if (post.buffer_post_id && String(post.buffer_post_id).startsWith("pending:") && !stalePending) return out({ ok: false, error: "もう Buffer に入れているところです（ほかの画面で押しませんでしたか）" });
  if (post.buffer_post_id && !stalePending) return out({ ok: false, error: "もう Buffer に入っています" });
  if (post.status !== "reserved") return out({ ok: false, error: "予約済みの投稿だけ入れられます" });
  const dt = String(post.datetime || "").slice(0, 16);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(dt)) return out({ ok: false, error: "日時が入っていません" });
  const dueAt = `${dt}:00+09:00`;
  if (new Date(dueAt).getTime() < Date.now() + 2 * 60 * 1000) return out({ ok: false, error: "日時が過ぎているか、近すぎます（2 分より先にしてください）" });

  // 4. 先に「入れている途中」の印を付ける。印がまだ空の行にだけ付くので、同時に 2 回押されても通るのは 1 回だけ
  const pending = `pending:${Date.now()}`;
  const free = stalePending
    ? `buffer_post_id=eq.${encodeURIComponent(post.buffer_post_id)}`   // 古い印を、読んだときの値のままなら付け替える
    : "buffer_post_id=is.null";
  const claim = await fetch(`${sb.url}/rest/v1/posts?${own}&${free}`, {
    method: "PATCH",
    headers: { ...sb.headers, Prefer: "return=representation" },
    body: JSON.stringify({ buffer_post_id: pending }),
  });
  const claimed = claim.ok ? await claim.json().catch(() => []) : [];
  if (!Array.isArray(claimed) || claimed.length !== 1) return out({ ok: false, error: "もう Buffer に入れているところです（ほかの画面で押しませんでしたか）" });
  const release = () => fetch(`${sb.url}/rest/v1/posts?${own}&buffer_post_id=eq.${encodeURIComponent(pending)}`, {
    method: "PATCH", headers: { ...sb.headers, Prefer: "return=minimal" }, body: JSON.stringify({ buffer_post_id: null }),
  }).catch(() => {});

  // 5. Buffer に入れる（本文は 1 本目、2 本目からはスレッド）
  const input = {
    channelId,
    schedulingType: "automatic",
    mode: "customScheduled",
    dueAt,
    assets: [],
    needsApproval: false,
    text: texts[0],
    source: "content-os",
  };
  if (texts.length > 1) input.metadata = { twitter: { thread: texts.map(text => ({ text, assets: [] })) } };
  const mutation = `mutation Schedule($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id dueAt } }
      ... on MutationError { message }
    }
  }`;
  let br;
  try {
    br = await fetch(BUFFER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query: mutation, variables: { input } }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    // 待ちきれなかったときは、Buffer 側に入った可能性があるので印は外さない（二重に入れないため）
    return out({ ok: false, error: "Buffer の返事が遅れました。Buffer の画面で入ったかを見てください（入っていなければ、30 分たつと押し直せます）" });
  }
  const payload = await br.json().catch(() => ({}));
  if (!br.ok || payload?.errors?.length) {
    await release();
    const msg = payload?.errors?.[0]?.message || br.status;
    return out({ ok: false, error: `Buffer が受け付けませんでした（${String(msg).slice(0, 200)}）` });
  }
  const r = payload?.data?.createPost;
  if (r?.__typename !== "PostActionSuccess" || !r?.post?.id) {
    await release();
    return out({ ok: false, error: `Buffer が受け付けませんでした（${String(r?.message || "形が違う返事").slice(0, 200)}）` });
  }
  const bufferId = String(r.post.id);

  // 6. 印を Buffer の番号に置き換える（失敗しても予約は入っているので、そのことを返す）
  const history = Array.isArray(post.history) ? post.history : [];
  const up = await fetch(`${sb.url}/rest/v1/posts?${own}`, {
    method: "PATCH",
    headers: { ...sb.headers, Prefer: "return=minimal" },
    body: JSON.stringify({ buffer_post_id: bufferId, history: [...history, { at: new Date().toISOString(), note: `Buffer に予約した（${bufferId}）` }] }),
  });
  if (!up.ok) {
    return out({ ok: true, buffer_post_id: bufferId, due_at: r.post.dueAt, warn: "Buffer には入りましたが、番号を表に残せませんでした" });
  }
  return out({ ok: true, buffer_post_id: bufferId, due_at: r.post.dueAt });
}
