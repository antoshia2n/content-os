/**
 * /api/ext/ideas — 思考整理くんとの連携の口（2026-11-03 連携 便 2・作る前の 1 枚に Naoki OK 22:15・便 2 に OK 23:50）
 *
 * POST { title, memo, mm_url }  → { ok, id, status }
 *   思考整理くんの枝から「コンテンツくんのネタにする」。既定のアカウントの受け箱（状態 idea・ジャンル空）に 1 件入れる。
 *   同じ mm_url（同じマップの同じ枝）のネタが既にあれば、作らずにそれを返す（2 回押し・通信のやり直しで 2 件にしない）
 *   2026-11-13 セミナー管理の流れ 便1（作る前の 1 枚に Naoki OK 19:02）：kind:"seminar" を付けると、受け箱ではなく
 *   そのアカウントの「セミナー」の種類のフォルダ（custom_post_types の名前が「セミナー」）へ入れる
 * GET ?ids=1,2,3               → { ok, items: [{ id, status, title }] }
 *   枝に付けた札の状態を読む。本人の行だけ・100 件まで。消されたネタは返らない（枝の札は「見つからない」になる）
 *
 * - 呼べる画面は思考整理くん（ALLOW_ORIGINS）だけ。ログインの証明（Firebase の ID トークン）を確かめ、本人の行だけを読む・書く
 * - 失敗も 200 で返す（5xx は途中で Cloudflare の画面に置き換わることがあり、理由が画面に届かないため・buffer-schedule と同じ）
 */
import { verifyIdToken } from "shia2n-core/server/db-gateway.js";
import { fetchAccounts, genPostId, getSupabase, resolveTarget } from "../internal/_shared.js";

export const ALLOW_ORIGINS = ["https://mindmap.shia2n.jp", "https://dokusho.shia2n.jp", "https://dokusho.pages.dev"];
// 2026-11-11 読書くん 便3（Naoki OK 07:27）：読書くんのメモ 1 件を受け箱へ。出どころは memo_links の 1 行目（本とメモの住所）に残し、同じメモは 2 件にしない
export const BOOK_ORIGINS = ["https://dokusho.shia2n.jp", "https://dokusho.pages.dev"];
const BOOK_URL = /^https:\/\/dokusho\.shia2n\.jp\/\?book=[0-9a-f-]{36}&memo=[0-9a-f-]{36}$/;
/** 読書くんから来た中身：題（メモの 1 行目）・メモ（全文と出どころ）・memo_links（本とメモの住所） */
export function bookFields(body) {
  const clip = (s, n) => String(s ?? "").replace(/\r\n?/g, "\n").slice(0, n);
  const tx = clip(body?.text, 4000).trim();
  const book = clip(body?.book, 200).replace(/\s+/g, " ").trim();
  const src = clip(body?.src_url, 300).trim();
  const src_url = BOOK_URL.test(src) ? src : null;
  const pg = Number.isFinite(+body?.page) && body?.page !== null && body?.page !== "" ? Math.round(+body.page) : null;
  const where = `『${book || "本"}』${pg != null ? ` p.${pg}` : ""}`;
  const title = tx.split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 120);
  return { title, memo: tx ? `${tx}\n\n— ${where}` : "", src_url, label: where };
}
const MAX_IDS = 100;

export function cors(origin) {
  const h = { "Vary": "Origin" };
  if (ALLOW_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}
const out = (payload, origin) => new Response(JSON.stringify(payload), {
  status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(origin) },
});

/** 枝の字をネタの名前とメモに分ける（1 行目が名前・2 行目から下の枝のメモ） */
export function ideaFields(body) {
  const clip = (s, n) => String(s ?? "").replace(/\r\n?/g, "\n").slice(0, n);
  const title = clip(body?.title, 200).replace(/\s+/g, " ").trim();
  const memo = clip(body?.memo, 4000).trim();
  const mm = clip(body?.mm_url, 500).trim();
  const mm_url = /^https:\/\/mindmap\.shia2n\.jp\/m\/[0-9a-f-]{36}(\?n=[\w-]{1,64})?$/.test(mm) ? mm : null;
  return { title, memo, mm_url };
}

/** そのアカウントの種類のうち、名前が「セミナー」のものの鍵。無ければ null（2026-11-13 便1） */
export function seminarTypeOf(customTypes) {
  const hit = (Array.isArray(customTypes) ? customTypes : []).find(c => c && typeof c.key === "string" && String(c.label || "").trim() === "セミナー");
  return hit ? hit.key : null;
}

async function seminarType(sb, accountId) {
  const r = await fetch(`${sb.url}/rest/v1/accounts?select=custom_post_types&id=eq.${encodeURIComponent(accountId)}&limit=1`, { headers: sb.headers });
  if (!r.ok) return null;
  const [a] = await r.json();
  return seminarTypeOf(a?.custom_post_types);
}

/** ?ids= を数の並びにする（数字だけ・重なりなし・100 件まで） */
export function parseIds(raw) {
  return [...new Set(String(raw || "").split(",").map(s => s.trim()).filter(s => /^\d{1,20}$/.test(s)))].slice(0, MAX_IDS);
}

async function who(request, env) {
  const projectId = env.FIREBASE_PROJECT_ID ?? env.VITE_FIREBASE_PROJECT_ID ?? "";
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  try { return await verifyIdToken(token, projectId); } catch { return null; }
}

async function fromBook(sb, uid, u, f, origin) {
  if (!f.title) return out({ ok: false, error: "メモが空です" }, origin);
  if (!f.src_url) return out({ ok: false, error: "本とメモの住所がありません" }, origin);
  // 同じメモから入れたネタが既にあれば、それを返す
  const cs = encodeURIComponent(JSON.stringify([{ url: f.src_url }]));
  const r0 = await fetch(`${sb.url}/rest/v1/posts?select=id,status&user_id=eq.${u}&memo_links=cs.${cs}&limit=1`, { headers: sb.headers });
  if (r0.ok) { const [same] = await r0.json(); if (same) return out({ ok: true, id: String(same.id), status: same.status, created: false }, origin); }
  const target = resolveTarget(await fetchAccounts(sb, uid));
  if (target.error) return out({ ok: false, error: "入れ先のアカウントがありません（コンテンツくんでアカウントを作ってください）" }, origin);
  const record = {
    id: genPostId(), user_id: uid, account_id: target.account_id, title: f.title, body: "", datetime: null,
    platform: target.platform, post_type: "x_post", status: "idea", source: "dokusho", memo: f.memo,
    memo_links: [{ url: f.src_url, label: f.label }], mm_url: null, threads: [], comments: [], notion_page_id: null, genre: null,
    history: [{ at: new Date().toISOString(), note: "読書くんのメモから受け箱に入れた" }],
  };
  const r = await fetch(`${sb.url}/rest/v1/posts?select=id,status`, {
    method: "POST", headers: { ...sb.headers, Prefer: "return=representation" }, body: JSON.stringify(record),
  });
  if (!r.ok) return out({ ok: false, error: `受け箱に入れられませんでした（${r.status}）` }, origin);
  const [made] = await r.json();
  return out({ ok: true, id: String(made.id), status: made.status, created: true, account: target.account_name }, origin);
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (!ALLOW_ORIGINS.includes(origin)) return out({ ok: false, error: "この画面からは呼べません" }, origin);
  try {
    const uid = await who(request, env);
    if (!uid) return out({ ok: false, error: "ログインを確認できませんでした。開き直してください" }, origin);
    const sb = getSupabase(env);
    if (!sb) return out({ ok: false, error: "設定の値（SUPABASE）が足りません" }, origin);
    const u = encodeURIComponent(uid);

    if (request.method === "GET") {
      const ids = parseIds(new URL(request.url).searchParams.get("ids"));
      if (!ids.length) return out({ ok: true, items: [] }, origin);
      const r = await fetch(`${sb.url}/rest/v1/posts?select=id,status,title&user_id=eq.${u}&id=in.(${ids.join(",")})`, { headers: sb.headers });
      if (!r.ok) return out({ ok: false, error: `ネタを読めませんでした（${r.status}）` }, origin);
      const rows = await r.json();
      return out({ ok: true, items: rows.map(x => ({ id: String(x.id), status: x.status, title: x.title || "" })) }, origin);
    }

    if (request.method !== "POST") return out({ ok: false, error: "GET と POST だけの口です" }, origin);
    let body;
    try { body = await request.json(); } catch { return out({ ok: false, error: "送られた形が正しくありません" }, origin); }
    if (BOOK_ORIGINS.includes(origin)) return fromBook(sb, uid, u, bookFields(body), origin);
    const f = ideaFields(body);
    if (!f.title) return out({ ok: false, error: "枝の字が空です" }, origin);

    // 同じ枝から入れたネタが既にあれば、それを返す
    if (f.mm_url) {
      const r = await fetch(`${sb.url}/rest/v1/posts?select=id,status&user_id=eq.${u}&mm_url=eq.${encodeURIComponent(f.mm_url)}&limit=1`, { headers: sb.headers });
      if (r.ok) { const [same] = await r.json(); if (same) return out({ ok: true, id: String(same.id), status: same.status, created: false }, origin); }
    }

    const target = resolveTarget(await fetchAccounts(sb, uid));
    if (target.error) return out({ ok: false, error: "入れ先のアカウントがありません（コンテンツくんでアカウントを作ってください）" }, origin);
    const seminar = body?.kind === "seminar";
    let postType = "x_post";
    if (seminar) {
      postType = await seminarType(sb, target.account_id);
      if (!postType) return out({ ok: false, error: `「${target.account_name}」に「セミナー」の種類がありません（コンテンツくんの設定で種類を足してください）` }, origin);
    }
    const record = {
      id: genPostId(), user_id: uid, account_id: target.account_id, title: f.title, body: "", datetime: null,
      platform: target.platform, post_type: postType, status: "idea", source: "mindmap", memo: f.memo,
      memo_links: [], mm_url: f.mm_url, threads: [], comments: [], notion_page_id: null, genre: null,
      history: [{ at: new Date().toISOString(), note: seminar ? "思考整理くんのセミナーのマップから「セミナー」に入れた" : "思考整理くんの枝から受け箱に入れた" }],
    };
    const r = await fetch(`${sb.url}/rest/v1/posts?select=id,status`, {
      method: "POST", headers: { ...sb.headers, Prefer: "return=representation" }, body: JSON.stringify(record),
    });
    if (!r.ok) return out({ ok: false, error: `受け箱に入れられませんでした（${r.status}）` }, origin);
    const [made] = await r.json();
    return out({ ok: true, id: String(made.id), status: made.status, created: true, account: target.account_name, seminar }, origin);
  } catch (e) {
    console.error("[ext/ideas]", e);
    return out({ ok: false, error: "中で止まりました。少しおいてもう一度試してください" }, origin);
  }
}
