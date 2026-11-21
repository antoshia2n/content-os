// ════════════════════════════════════════════════════════
// note 向けのコピーの手直し（2026-11-21 開発部）
// ════════════════════════════════════════════════════════
// Naoki（11:04）：note へ貼ると、続けて並んだ画像は最後の 1 枚しか残らない（BWBC 0期の募集記事 1794977325331496 で確認）。
//   前後に文がある画像は残る → 画像だけの段落が続くところに、空の段落を 1 つずつはさむ。
// あわせて：blockquote は note では灰色の枠と「出典を入力」になる → 選んだときだけ、太字の段落に変えて出す。
// 本文（保存してあるもの）は変えない。コピーする中身だけを直す。

// 画像だけの段落（<p><img …></p>。画像のうしろの <br> 1 つまでは許す）
const IMG_P = /<p\b[^>]*>\s*<img\b[^>]*>\s*(?:<br\s*\/?>\s*)?<\/p>/gi;
const EMPTY_P = "<p><br></p>";

/** 画像だけの段落が続くところに、空の段落をはさむ */
export function spaceImages(html) {
  const s = String(html || "");
  return s.replace(IMG_P, (m, at) => {
    const rest = s.slice(at + m.length);
    return /^\s*<p\b[^>]*>\s*<img\b/i.test(rest) ? m + EMPTY_P : m;
  });
}

const stripStrong = (s) => String(s).replace(/<\/?(?:strong|b)\b[^>]*>/gi, "");
const visible = (s) => String(s).replace(/<br\s*\/?>/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

/** blockquote を太字の段落に変える（中に段落があれば 1 段落ずつ、無ければ全体を 1 段落。中の改行 <br> は残す） */
export function quoteToBold(html) {
  return String(html || "").replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const paras = [...inner.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
    const parts = (paras.length ? paras : [inner]).filter((x) => visible(x));
    return parts.map((x) => `<p><strong>${stripStrong(x).trim()}</strong></p>`).join("");
  });
}

/** note へ貼る形にそろえる。quoteBold=true で blockquote を太字の段落に */
export function forNote(html, { quoteBold = false } = {}) {
  const spaced = spaceImages(html);
  return quoteBold ? quoteToBold(spaced) : spaced;
}

export const hasQuote = (html) => /<blockquote\b/i.test(String(html || ""));
