// functions/api/internal/daily-impressions.js
// 日ごとの表示回数を Buffer から数えて返す（読み取りだけ・どこにも書かない）。
// 呼び出し元：shia2n-mcp（Bearer 認証・毎晩 1 回）
// v1.0（2026-08-17）
//
// ── なぜここに置くか ────────────────────────────────────────────
//  Buffer の鍵（BUFFER_API_KEY）は ContentOS の設定にだけ置いてある。
//  shia2n-mcp 側には無い。鍵を 2 か所に増やさないため、Buffer に触る処理は
//  ContentOS 側に集め、shia2n-mcp からは数字だけを受け取る形にする。
//
// ── なぜ ContentOS に入っている数字を足さないか ──────────────────
//  posts テーブルにも impressions は入っているが、これは
//  sync-buffer-metrics が Buffer と突き合わせできた投稿にだけ入る。
//  2026-08-16 の実行では Buffer 側 14 件のうち突き合わせできたのは 5 件で、
//  足すと実際より少なくなる。Buffer の一覧をそのまま数える。
//
// ── 数字の性質（2026-08-17 実測で確認）─────────────────────────
//  返すのは「その日に出した投稿が、いまの時点までに集めた表示回数の合計」。
//  「その日に画面へ出た回数」ではない。X の画面の日ごとの数字とは一致しないが、
//  日ごとを足し上げると月間と合うため、二重にはならない。
//  Buffer 側は 1 日 1 回の更新で、最大 1 日ほど遅れる。
//  実測：2026-08-12（日本時間）＝ 投稿 1 本・表示回数 3,045。
//  Buffer のまとめて返す口（集計）と、1 本ずつ足した数が同じ値になることを
//  2026-08-17 に両方から取って突き合わせ済み。
// ────────────────────────────────────────────────────────────

import { checkAuth, json, preflight } from './_shared.js';

// Buffer の窓口。sync-buffer-metrics.js と同じ。
const BUFFER_API_URL = 'https://api.buffer.com';

// 対象の組織とチャンネル。sync-buffer-metrics.js と同じ既定値をそろえて持つ。
const DEFAULT_ORG_ID = '648c1688ecd52b1cde5f8523';
const DEFAULT_CHANNEL_ID = '6a1690e4c687a22dd42e6782';

// 1 回に取る Buffer の投稿の本数（1 ページ）。
// 1 日 1 本の投稿なら 100 本で 3 か月分をまかなえるため、ページ送りはしない。
// 数える窓（最大 31 日）より十分に広い。
const BUFFER_PAGE_SIZE = 100;

// 1 回の呼び出しで数えられる日数の上限。
// 呼び出し側が広い範囲を投げてきたときに、返す配列が伸びすぎないようにする。
const MAX_DAYS = 31;

// 日本時間は協定世界時より 9 時間進んでいる。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** YYYY-MM-DD（日本時間）の 0 時 0 分を、協定世界時のミリ秒で返す */
function jstDayStartMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map((v) => Number(v));
  return Date.UTC(y, m - 1, d) - JST_OFFSET_MS;
}

/** 協定世界時のミリ秒を、日本時間の YYYY-MM-DD に直す */
function toJstDateStr(ms) {
  const shifted = new Date(ms + JST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isDateStr(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function toInt(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Buffer から「送信済みの投稿＋数字」を取る。
 * 問い合わせの形は sync-buffer-metrics.js と同じものを使う。
 * すでに本番で動いている形なので、新しく作らない。
 */
async function fetchBufferSentPosts(apiKey, orgId, channelId) {
  const query = `
    query GetPostsWithMetrics {
      posts(
        first: ${BUFFER_PAGE_SIZE}
        input: {
          organizationId: "${orgId}"
          filter: { status: [sent], channelIds: ["${channelId}"] }
        }
      ) {
        edges {
          node {
            id
            dueAt
            metrics { type value }
            metricsUpdatedAt
          }
        }
      }
    }
  `;

  const res = await fetch(BUFFER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`buffer_http_error: ${res.status} ${detail.slice(0, 300)}`);
  }

  const payload = await res.json();
  if (payload?.errors?.length) {
    throw new Error(`buffer_graphql_error: ${JSON.stringify(payload.errors).slice(0, 300)}`);
  }

  const edges = payload?.data?.posts?.edges;
  if (!Array.isArray(edges)) {
    throw new Error('buffer_unexpected_shape');
  }

  return edges
    .map((e) => e?.node)
    .filter((n) => n && n.id && n.dueAt)
    .map((n) => {
      const m = {};
      for (const item of n.metrics || []) {
        if (item && typeof item.type === 'string') m[item.type] = item.value;
      }
      return {
        buffer_post_id: String(n.id),
        due_at_ms: new Date(n.dueAt).getTime(),
        metrics_updated_at: n.metricsUpdatedAt || null,
        impressions: toInt(m.impressions),
      };
    })
    .filter((p) => Number.isFinite(p.due_at_ms));
}

export async function onRequestOptions() {
  return preflight();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const unauthorized = checkAuth(request, env);
  if (unauthorized) return unauthorized;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  // date_from / date_to は日本時間の日付。date だけ渡された場合はその 1 日。
  const dateFrom = isDateStr(body?.date_from)
    ? body.date_from
    : isDateStr(body?.date)
      ? body.date
      : null;
  const dateTo = isDateStr(body?.date_to)
    ? body.date_to
    : isDateStr(body?.date)
      ? body.date
      : dateFrom;

  if (!dateFrom || !dateTo) {
    return json(
      { ok: false, error: 'date required (YYYY-MM-DD)。1 日だけなら date、範囲なら date_from と date_to' },
      400
    );
  }

  const fromMs = jstDayStartMs(dateFrom);
  const toMs = jstDayStartMs(dateTo);
  if (fromMs > toMs) {
    return json({ ok: false, error: `date_from が date_to より後です（${dateFrom} > ${dateTo}）` }, 400);
  }

  const dayCount = Math.round((toMs - fromMs) / 86400000) + 1;
  if (dayCount > MAX_DAYS) {
    return json(
      { ok: false, error: `数えられるのは ${MAX_DAYS} 日までです（受け取った範囲: ${dayCount} 日）` },
      400
    );
  }

  const apiKey = env.BUFFER_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'Missing env: BUFFER_API_KEY' }, 500);

  const orgId = env.BUFFER_ORG_ID || DEFAULT_ORG_ID;
  const channelId = env.BUFFER_CHANNEL_ID || DEFAULT_CHANNEL_ID;

  let posts;
  try {
    posts = await fetchBufferSentPosts(apiKey, orgId, channelId);
  } catch (err) {
    return json({ ok: false, error: 'buffer_fetch_failed', detail: String(err).slice(0, 400) }, 502);
  }

  // 日ごとの箱を、範囲のぶんだけ先に 0 で作る。
  // 投稿が 1 本も無い日を抜かさず 0 で返すため（抜けると呼び出し側が
  // 「まだ取れていない日」と「本当に 0 の日」を見分けられない）。
  const byDate = new Map();
  for (let ms = fromMs; ms <= toMs; ms += 86400000) {
    byDate.set(toJstDateStr(ms), { date: toJstDateStr(ms), post_count: 0, impressions: 0 });
  }

  let metricsUpdatedAt = null;
  const endOfRangeMs = toMs + 86400000; // date_to の翌日 0 時（日本時間）

  for (const p of posts) {
    if (p.due_at_ms < fromMs || p.due_at_ms >= endOfRangeMs) continue;
    const key = toJstDateStr(p.due_at_ms);
    const slot = byDate.get(key);
    if (!slot) continue;
    slot.post_count += 1;
    slot.impressions += p.impressions;
    if (p.metrics_updated_at && (!metricsUpdatedAt || p.metrics_updated_at > metricsUpdatedAt)) {
      metricsUpdatedAt = p.metrics_updated_at;
    }
  }

  const days = Array.from(byDate.values());

  return json({
    ok: true,
    date_from: dateFrom,
    date_to: dateTo,
    timezone: 'Asia/Tokyo',
    buffer_posts_scanned: posts.length,
    metrics_updated_at: metricsUpdatedAt,
    total: {
      post_count: days.reduce((a, d) => a + d.post_count, 0),
      impressions: days.reduce((a, d) => a + d.impressions, 0),
    },
    days,
  });
}
