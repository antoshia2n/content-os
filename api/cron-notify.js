// api/cron-notify.js
// ─────────────────────────────────────────────────────────────
// Vercel Cron + Resend でメール通知を送るサーバーレス関数
//
// 【必要な環境変数】（Vercel Dashboard > Settings > Environment Variables）
//   RESEND_API_KEY   : Resend（resend.com）のAPIキー
//   NEXT_PUBLIC_SUPABASE_URL      : Supabase プロジェクトURL（既存）
//   SUPABASE_SERVICE_ROLE_KEY     : Supabase サービスロールキー（新規追加）
//
// 【呼び出し方】
//   - Cron: vercel.json の crons 設定で自動実行
//   - テスト: POST /api/cron-notify  body: { accountId, testMode: true }
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // サービスロールキー（RLS bypass）
);

// ── HTML メールテンプレート ──────────────────────────────────
function buildEmailHtml({ accountName, overdueList, todayList, digest, notifyOverdue, notifyToday, notifyDaily }) {
  const jstNow = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const section = (title, color, items, renderItem) => items.length === 0 ? "" : `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:15px;font-weight:800;color:${color};margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid ${color}20;">${title}</h2>
      ${items.map(renderItem).join("")}
    </div>`;

  const postCard = (p, accent) => `
    <div style="background:#fff;border:1.5px solid #e8e0d6;border-left:3px solid ${accent};border-radius:8px;padding:10px 14px;margin-bottom:8px;">
      <div style="font-weight:700;font-size:13px;color:#0f1419;margin-bottom:3px;">${p.title || "（タイトルなし）"}</div>
      <div style="font-size:11px;color:#888;">${p.datetime?.replace("T"," ").slice(0,16)} ／ ${p.post_type_label} ／ ${p.status_label}</div>
      ${p.memo ? `<div style="font-size:11px;color:#b45309;margin-top:4px;background:#fffbeb;padding:3px 7px;border-radius:4px;">${p.memo}</div>` : ""}
    </div>`;

  const overdueSection = notifyOverdue ? section(
    `⚠️ 未投稿アラート（${overdueList.length}件）`,
    "#dc2626",
    overdueList,
    p => postCard(p, "#ef4444")
  ) : "";

  const todaySection = notifyToday ? section(
    `📅 本日の予定（${todayList.length}件）`,
    "#f59e0b",
    todayList,
    p => postCard(p, "#f59e0b")
  ) : "";

  const digestSection = notifyDaily ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:15px;font-weight:800;color:#6b7280;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #e8e0d6;">📊 日次ダイジェスト</h2>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${Object.entries(digest).map(([label, count]) => `
          <div style="background:#f7f9f9;border:1px solid #e8e0d6;border-radius:8px;padding:8px 14px;text-align:center;">
            <div style="font-size:18px;font-weight:800;color:#0f1419;">${count}</div>
            <div style="font-size:10px;color:#888;margin-top:2px;">${label}</div>
          </div>`).join("")}
      </div>
    </div>` : "";

  const hasContent = overdueSection || todaySection || digestSection;

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2ede6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px #0000001a;">
    <!-- ヘッダー -->
    <div style="background:#1a1a1a;padding:20px 24px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Content<span style="color:#f59e0b;">OS</span></span>
      <span style="font-size:12px;color:#888;margin-left:8px;">${accountName} の通知</span>
      <span style="margin-left:auto;font-size:11px;color:#555;">${jstNow} JST</span>
    </div>
    <!-- 本文 -->
    <div style="padding:24px;">
      ${hasContent ? (overdueSection + todaySection + digestSection) : `
        <div style="text-align:center;padding:32px 0;color:#aaa;font-size:13px;">
          本日の通知対象はありませんでした 🎉
        </div>`}
    </div>
    <!-- フッター -->
    <div style="background:#faf7f3;border-top:1px solid #e8e0d6;padding:12px 24px;font-size:11px;color:#aaa;text-align:center;">
      ContentOS 自動通知 ／ 通知設定は管理画面から変更できます
    </div>
  </div>
</body>
</html>`;
}

// ── ステータス／種類の日本語ラベル ────────────────────────
const STATUS_LABELS = {
  draft:"下書き", review:"レビュー待ち", waiting:"予約待ち",
  reserved:"予約済み", published:"公開済", popular:"好評", flop:"不評",
};
const TYPE_LABELS = {
  x_post:"Xポスト", x_quote:"X引用", x_article:"X記事",
  note:"note", membership:"メンシプ", paid:"有料", other:"その他",
};

function enrichPost(p) {
  return {
    ...p,
    status_label:    STATUS_LABELS[p.status]    || p.status,
    post_type_label: TYPE_LABELS[p.post_type]   || p.post_type,
  };
}

// ── メイン処理 ──────────────────────────────────────────────
export default async function handler(req, res) {
  // GETはCron（認証ヘッダーをVercelが付与）、POSTはテスト送信
  const isCron = req.method === "GET";
  const isTest  = req.method === "POST" && req.body?.testMode;

  if (!isCron && !isTest) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Cron認証
  if (isCron) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "RESEND_API_KEY が未設定です" });

  try {
    // 通知設定を全件取得（Cronは全アカウント、テストは指定アカウントのみ）
    let settingsQuery = supabase.from("notification_settings").select("*").eq("enabled", true);
    if (isTest && req.body?.accountId) {
      settingsQuery = supabase.from("notification_settings").select("*").eq("account_id", req.body.accountId);
    }
    const { data: settingsList, error: sErr } = await settingsQuery;
    if (sErr) throw sErr;
    if (!settingsList || settingsList.length === 0) {
      return res.status(200).json({ message: "通知対象なし" });
    }

    const jstHour = new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false });
    const results = [];

    for (const s of settingsList) {
      if (!s.email) continue;
      // Cronの場合、send_hour が現在時刻と一致するもののみ送信
      if (isCron && parseInt(jstHour) !== s.send_hour) continue;

      // 当該アカウントの投稿を取得
      const { data: posts } = await supabase
        .from("posts")
        .select("*")
        .eq("account_id", s.account_id);
      if (!posts) continue;

      // アカウント名取得
      const { data: acc } = await supabase.from("accounts").select("name").eq("id", s.account_id).single();
      const accountName = acc?.name || s.account_id;

      const nowJst = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 16); // "2026-03-10 09:00"
      const todayJst = nowJst.slice(0, 10);

      // ① 未投稿アラート：reserved かつ datetime <= 現在
      const overdueList = posts
        .filter(p => p.status === "reserved" && p.datetime <= nowJst.replace(" ", "T"))
        .map(enrichPost);

      // ② 本日の予定：当日の全投稿
      const todayList = posts
        .filter(p => p.datetime.slice(0, 10) === todayJst)
        .sort((a, b) => a.datetime.localeCompare(b.datetime))
        .map(enrichPost);

      // ③ 日次ダイジェスト
      const digest = {};
      Object.entries(STATUS_LABELS).forEach(([k, label]) => {
        const cnt = posts.filter(p => p.status === k).length;
        if (cnt > 0) digest[label] = cnt;
      });

      const html = buildEmailHtml({
        accountName,
        overdueList:   s.notify_overdue ? overdueList : [],
        todayList:     s.notify_today   ? todayList   : [],
        digest,
        notifyOverdue: s.notify_overdue,
        notifyToday:   s.notify_today,
        notifyDaily:   s.notify_daily,
      });

      const subject = [
        s.notify_overdue && overdueList.length > 0 ? `⚠️ 未投稿${overdueList.length}件` : null,
        s.notify_today   && todayList.length   > 0 ? `📅 本日${todayList.length}件` : null,
        s.notify_daily   ? "📊 日次レポート" : null,
      ].filter(Boolean).join(" ／ ");

      // Resend API で送信
      const mailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "ContentOS <notify@notify.shia2n.jp>",
          to: [s.email],
          subject: `[ContentOS] ${accountName} — ${subject || "通知"}`,
          html,
        }),
      });

      const mailData = await mailRes.json();
      if (!mailRes.ok) throw new Error(`Resend error: ${mailData.message}`);
      results.push({ accountId: s.account_id, email: s.email, status: "sent" });
    }

    return res.status(200).json({ sent: results.length, results });
  } catch (err) {
    console.error("cron-notify error:", err);
    return res.status(500).json({ error: err.message });
  }
}
