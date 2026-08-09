// functions/api/internal/sync-buffer-metrics.js
// Buffer に入っている「投稿後の反応の数字」を ContentOS の投稿へ書き戻す。
// 呼び出し元：shia2n-mcp（Bearer 認証・毎日1回）
// v1.0（2026-08-09）
//
// ── 決めごと（2026-08-09 Naoki 承認）─────────────────────────────
//  ① 数字は自動で入れる。人手の評価（score）は残し、自動の成績は auto_score へ入れる
//  ② 毎日1回、自動で回す
//  ③ 投稿当日は取り込まない（0 が入るため）
//  ④ 何日待つかは決めず、毎日上書きし、投稿から 21 日で確定にする
//     （Buffer 側の数字は投稿から約 19〜20 日で更新が止まるため。2026-08-09 実測・3件一致）
//  ⑤ 上書きする。履歴は残さない。代わりに「Buffer がいつ更新した数字か」を1欄持つ
//  ⑥ 成績は Buffer の数字だけで、直近 90 日の自分の投稿との相対順位で決める（5等分）
// ────────────────────────────────────────────────────────────

import { checkAuth, getSupabase, json, preflight } from './_shared.js';

// Buffer の窓口。個人用の鍵（Bearer）で叩く GraphQL。
const BUFFER_API_URL = 'https://api.buffer.com';

// 対象の組織とチャンネル（2026-08-09 実測）。
// 組織「チームシアニン」／チャンネルは X の antoshia2n の1本だけ。
// 増えたときのために設定値でも上書きできるようにしてある。
const DEFAULT_ORG_ID = '648c1688ecd52b1cde5f8523';
const DEFAULT_CHANNEL_ID = '6a1690e4c687a22dd42e6782';

// 1回に取る Buffer の投稿の本数（1ページ）。
// 1日1本の投稿なら 100 本で3か月分をまかなえるため、ページ送りはしない。
const BUFFER_PAGE_SIZE = 100;

// 取り込みの対象にする期間（Buffer の予定時刻からの日数）
const MIN_AGE_HOURS = 24;   // これより新しいものは取り込まない（③）
const MAX_AGE_DAYS = 21;    // これより古いものは確定済みとして触らない（④）

// 成績を付けるときに見る期間（⑥）
const RANK_WINDOW_DAYS = 90;

// 1回の実行で書き込む上限。
// Cloudflare の1回あたりの外部呼び出し数に余裕を持たせるための上限。
// 1日1本の投稿なら毎日の必要数を大きく上回る。
const MAX_WRITES = 30;

const SCORES = ['S', 'A', 'B', 'C', 'D'];

const POST_FIELDS =
  'id,account_id,datetime,status,memo,buffer_post_id,' +
  'impressions,reactions,replies,reposts,clicks,metrics_updated_at,auto_score';

/** Buffer から「送信済みの投稿＋数字」を取る */
async function fetchBufferPosts(apiKey, orgId, channelId) {
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
    .filter((n) => n && n.id)
    .map((n) => {
      const m = {};
      for (const item of n.metrics || []) {
        if (item && typeof item.type === 'string') m[item.type] = item.value;
      }
      return {
        buffer_post_id: String(n.id),
        due_at: n.dueAt ? new Date(n.dueAt) : null,
        metrics_updated_at: n.metricsUpdatedAt || null,
        impressions: toInt(m.impressions),
        reactions: toInt(m.reactions),
        replies: toInt(m.comments),
        reposts: toInt(m.reposts),
        clicks: toInt(m.clicks),
      };
    });
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** ContentOS 側の投稿を読む（直近のものだけ） */
async function fetchContentOsPosts(sb, userId) {
  const since = new Date(Date.now() - (RANK_WINDOW_DAYS + 30) * 86400000)
    .toISOString()
    .slice(0, 16); // YYYY-MM-DDTHH:mm（datetime 列と同じ形）

  const params = new URLSearchParams();
  params.set('select', POST_FIELDS);
  params.set('user_id', `eq.${userId}`);
  params.set('datetime', `gte.${since}`);
  params.set('order', 'datetime.desc');
  params.set('limit', '300');

  const res = await fetch(`${sb.url}/rest/v1/posts?${params.toString()}`, {
    method: 'GET',
    headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`supabase_error(read): ${res.status} ${detail.slice(0, 300)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

/** 投稿1件を書き換える */
async function patchPost(sb, userId, id, patch) {
  const params = new URLSearchParams();
  params.set('id', `eq.${id}`);
  params.set('user_id', `eq.${userId}`);
  params.set('select', 'id');

  const res = await fetch(`${sb.url}/rest/v1/posts?${params.toString()}`, {
    method: 'PATCH',
    headers: { ...sb.headers, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`supabase_error(write id=${id}): ${res.status} ${detail.slice(0, 200)}`);
  }
}

/**
 * ContentOS の投稿の中から、その Buffer 投稿に対応する1件を探す。
 *   ① 専用の欄（buffer_post_id）が一致する
 *   ② 無ければ、メモの中にその投稿IDが書かれている
 * ②で見つかったときは、専用の欄へ写す（メモ頼みを1回で卒業させるため）
 */
function findMatch(posts, bufferPostId) {
  const byColumn = posts.find((p) => p.buffer_post_id === bufferPostId);
  if (byColumn) return { post: byColumn, viaMemo: false };

  const byMemo = posts.find(
    (p) => !p.buffer_post_id && typeof p.memo === 'string' && p.memo.includes(bufferPostId)
  );
  if (byMemo) return { post: byMemo, viaMemo: true };

  return null;
}

/** 反応の合計（順位の同点をほどくのに使う） */
function reactionSum(p) {
  return (p.reactions || 0) + (p.replies || 0) + (p.reposts || 0);
}

/**
 * 直近 90 日の投稿を、アカウントごとに表示回数の多い順に並べ、
 * 5等分して上から S / A / B / C / D を割り当てる（⑥）。
 * 数字が入っていない投稿は対象にしない。
 */
function assignAutoScores(posts) {
  const limit = new Date(Date.now() - RANK_WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 16);

  const byAccount = new Map();
  for (const p of posts) {
    if (p.impressions === null || p.impressions === undefined) continue;
    if (!p.datetime || p.datetime < limit) continue;
    if (!byAccount.has(p.account_id)) byAccount.set(p.account_id, []);
    byAccount.get(p.account_id).push(p);
  }

  const result = new Map(); // post id → 成績
  for (const list of byAccount.values()) {
    list.sort((a, b) => {
      if (b.impressions !== a.impressions) return b.impressions - a.impressions;
      return reactionSum(b) - reactionSum(a);
    });
    const n = list.length;
    list.forEach((p, i) => {
      const idx = Math.min(SCORES.length - 1, Math.floor((i * SCORES.length) / n));
      result.set(p.id, SCORES[idx]);
    });
  }
  return result;
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
  if (!body?.user_id) return json({ ok: false, error: 'user_id required' }, 400);

  const apiKey = env.BUFFER_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'Missing env: BUFFER_API_KEY' }, 500);

  const sb = getSupabase(env);
  if (!sb) return json({ ok: false, error: 'Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);

  const orgId = env.BUFFER_ORG_ID || DEFAULT_ORG_ID;
  const channelId = env.BUFFER_CHANNEL_ID || DEFAULT_CHANNEL_ID;

  // 1. Buffer と ContentOS の両方を読む
  let bufferPosts;
  let posts;
  try {
    bufferPosts = await fetchBufferPosts(apiKey, orgId, channelId);
    posts = await fetchContentOsPosts(sb, body.user_id);
  } catch (err) {
    return json({ ok: false, error: 'fetch_failed', detail: String(err).slice(0, 400) }, 502);
  }

  const now = Date.now();
  const summary = {
    buffer_posts: bufferPosts.length,
    contentos_posts: posts.length,
    matched: 0,
    too_new: 0,      // 投稿当日のため取り込まなかった
    finalized: 0,    // 21 日を過ぎているので触らなかった
    unmatched: 0,    // ContentOS 側に対応する投稿が見つからなかった
    numbers_written: 0,
    scores_written: 0,
    skipped_by_limit: 0,
  };

  // 2. 数字を（メモリ上で）当てはめる
  const patches = new Map(); // post id → 書き込む中身

  for (const bp of bufferPosts) {
    const found = findMatch(posts, bp.buffer_post_id);
    if (!found) {
      summary.unmatched += 1;
      continue;
    }
    summary.matched += 1;

    const post = found.post;
    const patch = {};
    if (found.viaMemo) patch.buffer_post_id = bp.buffer_post_id;

    const ageMs = bp.due_at ? now - bp.due_at.getTime() : null;
    const tooNew = ageMs !== null && ageMs < MIN_AGE_HOURS * 3600000;
    const finalized = ageMs !== null && ageMs > MAX_AGE_DAYS * 86400000;

    if (tooNew) {
      summary.too_new += 1;
    } else if (finalized) {
      summary.finalized += 1;
      // 数字は入れ直さないが、まだ一度も入っていない場合だけは入れる
      // （取り込みを始める前の投稿を拾うため）
      if (post.impressions === null || post.impressions === undefined) {
        Object.assign(patch, metricsOf(bp));
      }
    } else {
      Object.assign(patch, metricsOf(bp));
    }

    // 手元の一覧にも反映しておく（このあとの順位付けで使うため）
    Object.assign(post, metricsOfForRank(bp, patch));

    if (Object.keys(patch).length > 0) patches.set(post.id, patch);
  }

  // 3. 成績を付け直す（順位は毎回入れ直す）
  const scores = assignAutoScores(posts);
  for (const post of posts) {
    const next = scores.get(post.id);
    if (!next) continue;
    if (post.auto_score === next) continue;
    const patch = patches.get(post.id) || {};
    patch.auto_score = next;
    patches.set(post.id, patch);
  }

  // 4. 書き込む
  const errors = [];
  let written = 0;
  for (const [id, patch] of patches) {
    if (written >= MAX_WRITES) {
      summary.skipped_by_limit += 1;
      continue;
    }
    try {
      await patchPost(sb, body.user_id, id, patch);
      written += 1;
      if ('impressions' in patch) summary.numbers_written += 1;
      if ('auto_score' in patch) summary.scores_written += 1;
    } catch (err) {
      errors.push(String(err).slice(0, 200));
    }
  }

  return json({
    ok: errors.length === 0,
    summary,
    errors,
  });

  // ── 内部の小さな道具 ──────────────────────────────────────
  function metricsOf(bp) {
    return {
      buffer_post_id: bp.buffer_post_id,
      impressions: bp.impressions,
      reactions: bp.reactions,
      replies: bp.replies,
      reposts: bp.reposts,
      clicks: bp.clicks,
      metrics_updated_at: bp.metrics_updated_at,
      metrics_fetched_at: new Date().toISOString(),
    };
  }

  function metricsOfForRank(bp, patch) {
    // 実際に書き込む中身だけを手元の一覧へ反映する。
    // 書かないと決めたもの（当日・確定済み）は元の値を保つ。
    if (!('impressions' in patch)) return {};
    return {
      impressions: bp.impressions,
      reactions: bp.reactions,
      replies: bp.replies,
      reposts: bp.reposts,
      clicks: bp.clicks,
    };
  }
}
