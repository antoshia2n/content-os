// functions/api/internal/_markers.js
// 2026-11-21 開発部：本文の「印」（例：「※画像：〜」の段落）の位置へ画像を差し込むための中身。
// 呼び出し元：put-post-images.js（content_os__put_images の files[].at）
// 印は本文の <p> の段落 1 つ。at の文字を含む段落がちょうど 1 つのときだけ使う（0 件・2 件以上は止める）。
// 比べるときは、タグを外し・&amp; などを戻し・全角半角をそろえ（NFKC）・空白をつめてから比べる。
// 画像は印の段落のすぐ後ろへ入れる。同じ印へ前に入れた画像（この口の住所）が続いていれば、その後ろへ並べる（01・02… の順を保つ）。

const PARA = /<p\b[^>]*>[\s\S]*?<\/p>/g;

export function normText(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

// 印になれる段落（画像の段落は除く）を、本文の中の位置つきで返す
function paragraphs(html) {
  const out = [];
  for (const m of String(html).matchAll(PARA)) {
    if (/<img\b/i.test(m[0])) continue;
    out.push({ start: m.index, end: m.index + m[0].length, text: normText(m[0]) });
  }
  return out;
}

// at を含む段落を探す。{ count, para } を返す（count が 1 のときだけ para がある）
export function findMarker(html, at) {
  const key = normText(at);
  if (!key) return { count: 0 };
  const hits = paragraphs(html).filter((p) => p.text.includes(key));
  return hits.length === 1 ? { count: 1, para: hits[0] } : { count: hits.length };
}

// 印ごとの当たり数（書く前の下見に使う）
export function checkMarkers(html, ats) {
  const uniq = [...new Set((ats || []).map((a) => String(a || '')).filter((a) => normText(a)))];
  return uniq.map((at) => ({ at, count: findMarker(html, at).count }));
}

// 印のすぐ後ろ（同じ口で前に入れた画像が続いていればその後ろ）へ imgHtml を差し込む。
// base は、この口で置いた画像の住所の頭（posts/<番号>/ まで）
export function insertAtMarker(html, at, imgHtml, base) {
  const f = findMarker(html, at);
  if (f.count !== 1) return null;
  let pos = f.para.end;
  const mine = new RegExp(`^\\s*<p>\\s*<img[^>]*src="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^>]*>\\s*</p>`);
  for (;;) {
    const m = html.slice(pos).match(mine);
    if (!m) break;
    pos += m[0].length;
  }
  return html.slice(0, pos) + imgHtml + html.slice(pos);
}

// 印の段落を本文から外す（drop_markers のとき・最後の回だけ）。外した数を返す
export function dropMarkers(html, ats) {
  let out = String(html);
  let dropped = 0;
  for (const at of new Set((ats || []).map(String))) {
    const f = findMarker(out, at);
    if (f.count !== 1) continue;
    out = out.slice(0, f.para.start) + out.slice(f.para.end);
    dropped++;
  }
  return { html: out, dropped };
}
