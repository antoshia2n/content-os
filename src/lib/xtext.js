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

// 2026-11-20 Naoki「X のポスト用にコピペしたときに改行が変になる」
// X の入力欄は書式つき（HTML）で貼ると段落の間の空行が消えたり増えたりするので、X 向けは文字だけで運ぶ。
// 段落＝空行 1 つで区切る・段落の中の改行（<br>）はそのまま・ふつうの区切り線は空行・行末の空白と &nbsp; を外す。
// スレッドは 1 本ずつ「【1/3】」の見出しで分ける（X ではスレッドの 1 本ずつ貼るため）
export function xPlainText(html, asParts = false) {
  if (typeof document === "undefined") return asParts ? [] : "";
  const root = document.createElement("div");
  root.innerHTML = html || "";
  const walk = node => {
    if (node.nodeType === 3) return node.textContent;
    const tag = node.tagName?.toLowerCase();
    const inner = Array.from(node.childNodes).map(walk).join("");
    if (tag === "br") return "\n";
    if (["p", "div", "h1", "h2", "h3", "blockquote", "ul", "ol"].includes(tag)) return "\n" + inner.replace(/\n+$/, "") + "\n\n";
    if (tag === "li") return "・" + inner + "\n";
    if (tag === "hr") return "\n\n";
    if (tag === "img") return "";
    return inner;
  };
  const groups = [[]];
  root.childNodes.forEach(n => {
    const sep = n.nodeType === 1 && (n.classList?.contains("thread-sep") || n.getAttribute?.("data-thread") === "true");
    if (sep) groups.push([]); else groups[groups.length - 1].push(n);
  });
  const clean = s => s.replace(/ /g, " ").replace(/​/g, "").replace(/[ \t]+\n/g, "\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").trim();
  const parts = groups.map(ns => clean(ns.map(walk).join(""))).filter(Boolean);
  if (asParts) return parts;
  if (parts.length <= 1) return parts[0] || "";
  return parts.map((t, i) => `【${i + 1}/${parts.length}】\n${t}`).join("\n\n\n");
}

// 2026-11-20 スレッドは 1 本ずつ貼るので、1 本ずつの文（見出しなし）を返す
export const xThreadParts = html => xPlainText(html, true);
