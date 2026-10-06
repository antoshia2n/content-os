/**
 * /api/notion-memo — サイドパネルのメモを Notion の DB へ直接 1 件書く
 *
 * コンテンツくんの表（posts）には何も書かない。Notion へ送るだけ。
 * 送り先は 3 つに固定：inbox／インプットDB／アウトプットDB。
 * 2026-10-06 開発部（Naoki 確定「メモを Notion の inbox・インプット・アウトプットへ。コンテンツくんには入れない」）
 *
 * 通すのは持ち主だけ：Firebase のログイン証明を検証し、メールが持ち主のもの（ハッシュで照合）のときだけ書く。
 * コンテンツくんには有料会員も入れるため、ログインしているだけでは通さない。
 *
 * 使う設定の値（どちらも既存。新しく足す値は無い）
 *   NOTION_SECRET        … Notion の鍵（push-to-notion と同じもの）。無いと 500 を返す
 *   FIREBASE_PROJECT_ID  … ログイン証明の検証に使う（/api/db と同じもの）。無いと 500 を返す
 */

import { verifyIdToken } from "shia2n-core/server/db-gateway.js";

// 持ち主のメールの SHA-256（公開リポジトリなのでメールそのものは書かない）
const OWNER_EMAIL_SHA256 = "756149e97cb41bd690c46aee9ddaa59efa4c92953f8807c939a5a56157036c26";

const DEST = {
  inbox:  { id: "31c9c6c1c439800f8093dd4e9dca241c", label: "inbox" },
  input:  { id: "31b9c6c1c43980b48b91d7128950f794", label: "インプットDB" },
  output: { id: "31b9c6c1c43980c5b8ccdf3b7fea572a", label: "アウトプットDB" },
};

const HEADERS = { "Content-Type": "application/json" };
const out = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: HEADERS });

function todayTokyo() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function tokenEmail(token) {
  // 署名は verifyIdToken で確かめ済み。ここは中身を読むだけ
  const raw = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = new TextDecoder().decode(Uint8Array.from(atob(raw + "===".slice((raw.length + 3) % 4)), c => c.charCodeAt(0)));
  const p = JSON.parse(json);
  return p.email_verified ? String(p.email || "").toLowerCase() : "";
}

// 2000 字ごとに区切った文字列の並び（Notion の 1 かたまりの上限）
function chunks(text) {
  const list = [];
  for (let i = 0; i < text.length; i += 2000) list.push({ type: "text", text: { content: text.slice(i, i + 2000) } });
  return list;
}

// 本文を段落のブロックにする（1 行 = 1 段落、空行は捨てない）
function paragraphs(text) {
  return text.split("\n").slice(0, 95).map(line => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: line ? chunks(line) : [] },
  }));
}

export async function onRequestPost({ request, env }) {
  const secret = env.NOTION_SECRET;
  const projectId = env.FIREBASE_PROJECT_ID ?? env.VITE_FIREBASE_PROJECT_ID ?? "";
  if (!secret || !projectId) return out({ ok: false, error: "設定の値（NOTION_SECRET か FIREBASE_PROJECT_ID）が入っていません" }, 500);

  // 1. 持ち主か
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    await verifyIdToken(token, projectId);
  } catch {
    return out({ ok: false, error: "ログインを確認できませんでした。パネルを開き直してください" }, 401);
  }
  if ((await sha256Hex(tokenEmail(token))) !== OWNER_EMAIL_SHA256) {
    return out({ ok: false, error: "この機能は持ち主だけが使えます" }, 403);
  }

  // 2. 中身
  let body;
  try { body = await request.json(); } catch { return out({ ok: false, error: "送られた形が正しくありません" }, 400); }
  const dest = DEST[body?.dest];
  if (!dest) return out({ ok: false, error: "送り先が正しくありません" }, 400);
  const memo = typeof body?.memo === "string" ? body.memo.replace(/\r\n?/g, "\n").trim() : "";
  const given = typeof body?.title === "string" ? body.title.trim() : "";
  if (!memo && !given) return out({ ok: false, error: "メモが空です" }, 400);

  // タイトルが別に来たら（アイデアメモの画面）それを使い、メモは全部本文へ。来なければ 1 行目がタイトル
  const lines = memo.split("\n");
  const title = (given || lines[0].trim().replace(/^[-・*]\s*/, "")).slice(0, 200);
  const rest = given ? memo : lines.slice(1).join("\n").replace(/^\n+/, "");
  const url = (memo.match(/https?:\/\/[^\s<>"）)]+/) || [])[0];
  const today = todayTokyo();

  // 3. 送り先ごとの列（列の名前は 2026-10-06 に Notion の実物から取った）
  const properties = { title: { title: chunks(title) } };
  let children = rest ? paragraphs(rest) : [];
  if (body.dest === "inbox") {
    properties["日付"] = { date: { start: today } };
    if (url) properties["URL"] = { url };
  } else if (body.dest === "input") {
    properties["saved_date"] = { date: { start: today } };
    if (url) properties["URL"] = { url };
  } else {
    properties["date"] = { date: { start: today } };
    properties["status"] = { select: { name: "下書き" } };
    properties["蓄積元アプリ"] = { select: { name: "コンテンツくん" } };
    if (rest) properties["本文"] = { rich_text: chunks(rest) };
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
    body: JSON.stringify({ parent: { database_id: dest.id }, properties, children }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const notConnected = data?.code === "object_not_found";
    return out({
      ok: false,
      error: notConnected
        ? `Notion の鍵が「${dest.label}」につながっていません`
        : `Notion が受け付けませんでした（${data?.message || res.status}）`,
      code: data?.code || null,
    }, 502);
  }
  return out({ ok: true, dest: body.dest, label: dest.label, url: data.url || null });
}
