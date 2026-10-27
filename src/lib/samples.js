/**
 * はじめて入った人に入れる見本（2026-10-28 開発部・会員公開の関門 4・Naoki「OK」08:26・文面は 08:27 に OK）。
 * 他のサービス（Trello の Welcome Board・HubSpot の見本の連絡先）と同じく、空の画面ではなく「消せる見本」を最初に見せる。
 * 見本には「例」の札を付け、受け箱の「例をまとめて消す」で 1 回で消せる。アカウントを自動で作ったときに 1 回だけ入る。
 */
export const SAMPLE_LABEL = "例";
export const SAMPLE_TEMPLATE_NAME = "例：結論→理由→一歩";

const p2 = n => String(n).padStart(2, "0");
/** 明日の朝 7 時（画面の日時の形 YYYY-MM-DDTHH:MM） */
export function tomorrowAt7(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 7, 0);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T07:00`;
}

/** 見本の投稿（データベースの形）。id は呼ぶ側で重ならない番号を渡す */
export function samplePosts({ accountId, uid, ids, now = new Date() }) {
  const base = { account_id: accountId, user_id: uid, post_type: "x_post", labels: [SAMPLE_LABEL], memo_links: [], comments: [], history: [], score: null, genre: null, theme: null, mm_url: null, manabu: false, notion_page_id: null };
  return [
    { ...base, id: ids[0], status: "idea", datetime: null, title: "朝いちばんに書くと続く理由", body: "",
      memo: "3か月続けて気づいたことを3つ書く。\n①…\n②…\n③…\n（自分の体験に置き換える）" },
    { ...base, id: ids[1], status: "idea", datetime: null, title: "「ネタが無い」は思い込みだった話", body: "",
      memo: "ネタ帳を見返したら20件あった。思いついた瞬間に入れておくのがコツ" },
    { ...base, id: ids[2], status: "draft", datetime: null, title: "1日15分で発信を続けるコツ", memo: "",
      body: "<p>結論：発信は「書く時間」より「書き始めるきっかけ」を決めると続きます。</p><p><br></p><p>理由：時間を決めても、何を書くか迷うと手が止まるから。ネタ帳に1行でも入っていれば、そこから書き始められます。</p><p><br></p><p>今日やること：</p>" },
    { ...base, id: ids[3], status: "reserved", datetime: tomorrowAt7(now), title: "今週の振り返り：伸びた投稿の共通点", memo: "",
      body: "<p>今週いちばん伸びたのは、自分の失敗をそのまま書いた投稿でした。</p><p>うまくいった話より、つまずいた話のほうが「自分もそうだ」と読んでもらえる。来週も1本は入れてみます。</p>" },
  ];
}

export const SAMPLE_TEMPLATE = { name: SAMPLE_TEMPLATE_NAME, kind: "body", post_type: null, sort_order: 0,
  content: "結論：{{cursor}}\n\nなぜなら、…\n\nまず今日やること：…" };

export const isSample = p => Array.isArray(p?.labels) && p.labels.includes(SAMPLE_LABEL);
