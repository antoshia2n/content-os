// ── 本文 → X に送る文字の並び（スレッドの区切りで分ける） ──
// 編集画面と同じ区切り（<hr class="thread-sep">）で分け、段落 1 つ＝ 1 行にする（空の段落は空行）
export function threadTexts(html) {
  if (typeof document === "undefined") return [];
  const root = document.createElement("div");
  root.innerHTML = html || "";
  const parts = [[]];
  root.childNodes.forEach(n => {
    const sep = n.nodeType === 1 && (n.classList?.contains("thread-sep") || n.getAttribute?.("data-thread") === "true");
    if (sep) parts.push([]); else parts[parts.length - 1].push(n);
  });
  const walk = node => {
    if (node.nodeType === 3) return node.textContent;
    const tag = node.tagName?.toLowerCase();
    const inner = Array.from(node.childNodes).map(walk).join("");
    if (tag === "br") return "\n";
    if (tag === "p" || tag === "div" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "blockquote") return inner + "\n";
    if (tag === "li") return "・" + inner + "\n";
    if (tag === "hr") return "\n";
    return inner;
  };
  return parts
    .map(ns => ns.map(walk).join("").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean);
}
// X の数え方（おおよそ）：日本語などは 2、英数字は 1、URL は 23
export function xLen(s) {
  let n = 0;
  const t = String(s || "").replace(/https?:\/\/\S+/g, () => { n += 23; return ""; });
  for (const ch of t) {
    const c = ch.codePointAt(0);
    n += (c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2;
  }
  return n;
}

// 2026-11-10 予約の画像つき：スレッドの 1 本ごとに、文と画像の住所（https のものだけ・4 枚まで）を返す
export function threadParts(html) {
  if (typeof document === "undefined") return [];
  const root = document.createElement("div");
  root.innerHTML = html || "";
  const groups = [[]];
  root.childNodes.forEach(n => {
    const sep = n.nodeType === 1 && (n.classList?.contains("thread-sep") || n.getAttribute?.("data-thread") === "true");
    if (sep) groups.push([]); else groups[groups.length - 1].push(n);
  });
  return groups.map(ns => {
    const box = document.createElement("div");
    ns.forEach(n => box.appendChild(n.cloneNode(true)));
    const images = [...box.querySelectorAll("img")].map(i => i.getAttribute("src") || "").filter(u => /^https:\/\//.test(u));
    const text = threadTexts(box.innerHTML)[0] || "";
    return { text, images: images.slice(0, 4), extra: Math.max(0, images.length - 4), localImg: box.querySelectorAll("img").length - images.length };
  }).filter(p => p.text || p.images.length);
}
