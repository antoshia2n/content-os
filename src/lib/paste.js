// ════════════════════════════════════════════════════════
// コピーしたものを本文へ置くときの取り込み（2026-09-20 追加）
// ════════════════════════════════════════════════════════
// 本文エディタへ置かれたものを、本文で使える形にそろえて返す。
// 入口は buildPasteHtml(clipboardData) の 1 本だけ。
//
// 取り込む形は 3 通り。
//   ①書式付き HTML（画面の文章を範囲選択してコピーしたもの）
//   ②Markdown の原文（ChatGPT のコピーボタンなど）
//   ③素の文章
//
// 本文の HTML は保存され、プレビュー（PreviewOverlay）で innerHTML として描画される。
// よって外から来た HTML は、ここで許可した札と属性だけに削る。許可しないものは文字として捨てる。
// 残す札は本文の見た目（App.jsx の .xb）が持っているものに合わせる：
//   p / h1 / h2 / ul / ol / li / blockquote / a / hr / br / strong / em / s

// ── 許可する札 ────────────────────────────────────────
const BLOCK_TAGS = {
  P: "p", H1: "h1", H2: "h2", H3: "h2", H4: "h2", H5: "h2", H6: "h2",
  BLOCKQUOTE: "blockquote",
};
const INLINE_TAGS = {
  STRONG: "strong", B: "strong", EM: "em", I: "em",
  S: "s", STRIKE: "s", DEL: "s", A: "a",
  // 中身だけ残して札は捨てるもの
  SPAN: "", FONT: "", CODE: "", U: "", MARK: "", SMALL: "", BIG: "",
  SUB: "", SUP: "", ABBR: "", TIME: "", LABEL: "", VAR: "", KBD: "", SAMP: "", INS: "",
};
// 中身ごと捨てる札
const DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE", "BASE", "NOSCRIPT",
  "IMG", "PICTURE", "SOURCE", "VIDEO", "AUDIO", "IFRAME", "OBJECT", "EMBED",
  "SVG", "MATH", "CANVAS", "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "OPTION",
]);

// ── 入口 ──────────────────────────────────────────────
export function buildPasteHtml(clipboardData) {
  if (!clipboardData) return "";
  let plain = "", rawHtml = "";
  try { plain = clipboardData.getData("text/plain") || ""; } catch (e) { plain = ""; }
  try { rawHtml = clipboardData.getData("text/html") || ""; } catch (e) { rawHtml = ""; }
  if (!plain.trim() && !rawHtml.trim()) return "";

  const sanitized = rawHtml.trim() ? sanitizeHtml(rawHtml) : "";
  const rich = hasFormatting(sanitized);
  const md = markdownLevel(plain);

  // HTML に書式があっても、文字として "##" や "**" が入っているなら Markdown を採る。
  // 画面の文章を範囲選択してコピーしたものには、この印は現れない。
  let html;
  if (rich && md !== "strong") html = sanitized;
  else if (md) html = markdownToHtml(plain);
  else if (sanitized.trim()) html = sanitized;
  else html = plainToHtml(plain);

  return unwrapSingleParagraph(html);
}

// ── 書式付き HTML を削る ──────────────────────────────
export function sanitizeHtml(raw) {
  let doc = null;
  try { doc = new DOMParser().parseFromString(String(raw), "text/html"); } catch (e) { return ""; }
  if (!doc || !doc.body) return "";
  const blocks = [];
  collectBlocks(doc.body, blocks);
  return blocksToHtml(blocks);
}

function collectBlocks(src, out) {
  let buf = null;
  const addInline = (node) => { if (!buf) buf = []; buf.push(node); };
  const flush = () => {
    if (buf && hasVisible(buf)) out.push({ tag: "p", nodes: buf });
    buf = null;
  };

  for (const child of Array.from(src.childNodes)) {
    if (child.nodeType === 3) {
      const t = String(child.textContent || "").replace(/\s+/g, " ");
      if (!t || (!t.trim() && !buf)) continue;
      addInline(document.createTextNode(t));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = String(child.tagName || "").toUpperCase();
    if (DROP_TAGS.has(tag)) continue;

    if (tag === "BR") { addInline(document.createElement("br")); continue; }
    if (tag === "HR") { flush(); out.push({ tag: "hr" }); continue; }

    if (tag === "UL" || tag === "OL") {
      flush();
      const items = [];
      for (const li of Array.from(child.children || [])) {
        if (String(li.tagName || "").toUpperCase() !== "LI") continue;
        const nodes = inlineOf(li);
        if (hasVisible(nodes)) items.push(nodes);
      }
      if (items.length) out.push({ tag: tag.toLowerCase(), items });
      continue;
    }
    if (tag === "LI") {
      flush();
      const nodes = inlineOf(child);
      if (hasVisible(nodes)) out.push({ tag: "ul", items: [nodes] });
      continue;
    }
    if (tag === "PRE") {
      flush();
      const nodes = textWithBreaks(String(child.textContent || ""));
      if (hasVisible(nodes)) out.push({ tag: "p", nodes });
      continue;
    }
    if (BLOCK_TAGS[tag]) {
      flush();
      const nodes = inlineOf(child);
      if (hasVisible(nodes)) out.push({ tag: BLOCK_TAGS[tag], nodes });
      continue;
    }
    if (tag in INLINE_TAGS) { addInline(convertInline(child)); continue; }

    // div・section・table など知らない入れ物は、中身を block として読み直す
    flush();
    collectBlocks(child, out);
  }
  flush();
}

function inlineOf(el) {
  const nodes = [];
  for (const child of Array.from(el.childNodes || [])) {
    if (child.nodeType === 3) {
      const t = String(child.textContent || "").replace(/\s+/g, " ");
      if (!t || (!t.trim() && !nodes.length)) continue;
      nodes.push(document.createTextNode(t));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = String(child.tagName || "").toUpperCase();
    if (DROP_TAGS.has(tag)) continue;
    if (tag === "BR") { nodes.push(document.createElement("br")); continue; }
    if (tag in INLINE_TAGS) { nodes.push(convertInline(child)); continue; }
    // 入れ子の block は改行で区切って 1 つに畳む
    if (nodes.length) nodes.push(document.createElement("br"));
    for (const n of inlineOf(child)) nodes.push(n);
  }
  while (nodes.length && isBlank(nodes[nodes.length - 1])) nodes.pop();
  return nodes;
}

function convertInline(el) {
  const tag = String(el.tagName || "").toUpperCase();
  let out;
  if (tag === "A") {
    const href = safeHref(el.getAttribute("href"));
    if (href) {
      out = document.createElement("a");
      out.setAttribute("href", href);
      out.setAttribute("target", "_blank");
      out.setAttribute("rel", "noopener noreferrer");
    } else {
      out = document.createDocumentFragment();
    }
  } else if (INLINE_TAGS[tag]) {
    out = document.createElement(INLINE_TAGS[tag]);
  } else {
    out = document.createDocumentFragment();
  }
  for (const n of inlineOf(el)) out.appendChild(n);
  return out;
}

function blocksToHtml(blocks) {
  const root = document.createElement("div");
  for (const b of blocks) {
    if (b.tag === "hr") { root.appendChild(document.createElement("hr")); continue; }
    if (b.tag === "ul" || b.tag === "ol") {
      const list = document.createElement(b.tag);
      for (const item of b.items) {
        const li = document.createElement("li");
        for (const n of item) li.appendChild(n);
        list.appendChild(li);
      }
      root.appendChild(list);
      continue;
    }
    const el = document.createElement(b.tag);
    for (const n of b.nodes) el.appendChild(n);
    root.appendChild(el);
  }
  return root.innerHTML;
}

function hasVisible(nodes) {
  return nodes.some((n) => String(n.textContent || "").trim() || n.nodeName === "BR");
}
function isBlank(node) {
  return node.nodeName !== "BR" && !String(node.textContent || "").trim();
}
function textWithBreaks(text) {
  const nodes = [];
  String(text).replace(/\r\n?/g, "\n").split("\n").forEach((line, i) => {
    if (i) nodes.push(document.createElement("br"));
    if (line) nodes.push(document.createTextNode(line));
  });
  return nodes;
}
export function safeHref(href) {
  const v = String(href || "").trim();
  if (!v) return "";
  return /^(https?:\/\/|mailto:)/i.test(v) ? v : "";
}
export function hasFormatting(html) {
  return /<(h1|h2|strong|em|s|ul|ol|li|blockquote|a|hr)\b/i.test(String(html || ""));
}

// ── Markdown を見分ける ───────────────────────────────
// "strong"＝画面のコピーには現れない印（見出し・太字・リンク・引用）。HTML より優先する
// "weak"  ＝箇条書きと番号（書式付き HTML があるならそちらを優先する）
export function markdownLevel(text) {
  const t = String(text || "");
  if (!t.trim()) return "";
  if (/^[ \t]{0,3}#{1,6}[ \t]+\S/m.test(t)) return "strong";
  if (/^[ \t]{0,3}>[ \t]?\S/m.test(t)) return "strong";
  if (/\*\*[^*\n]+\*\*/.test(t)) return "strong";
  if (/\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\)/.test(t)) return "strong";
  if (/^[ \t]*`{3}/m.test(t)) return "strong";
  if (/^[ \t]*[-*+][ \t]+\S/m.test(t)) return "weak";
  if (/^[ \t]*\d+[.)][ \t]+\S/m.test(t)) return "weak";
  return "";
}

// ── Markdown を本文の書式へ ───────────────────────────
export function markdownToHtml(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [], quote = [], list = null;

  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inlineMd).join("<br>")}</p>`); para = []; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.map(inlineMd).join("<br>")}</blockquote>`); quote = []; } };
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((t) => `<li>${inlineMd(t)}</li>`).join("")}</${list.tag}>`); list = null; }
  };
  const flushAll = () => { flushPara(); flushQuote(); flushList(); };

  for (const raw of lines) {
    const line = String(raw).replace(/\t/g, "    ");
    if (/^[ \t]*`{3}/.test(line)) continue;              // 囲みの記号だけ落とす（中身は段落として残る）
    if (!line.trim()) { flushAll(); continue; }

    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.*)$/);
    if (heading) {
      flushAll();
      const tag = heading[1].length === 1 ? "h1" : "h2";
      out.push(`<${tag}>${inlineMd(heading[2].trim())}</${tag}>`);
      continue;
    }
    if (/^ {0,3}([-*_])[ \t]*\1[ \t]*\1[-*_ \t]*$/.test(line)) { flushAll(); out.push("<hr>"); continue; }

    const q = line.match(/^ {0,3}>[ \t]?(.*)$/);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }

    const ul = line.match(/^[ \t]*[-*+][ \t]+(.*)$/);
    if (ul) {
      flushPara(); flushQuote();
      if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; }
      list.items.push(ul[1]);
      continue;
    }
    const ol = line.match(/^[ \t]*\d+[.)][ \t]+(.*)$/);
    if (ol) {
      flushPara(); flushQuote();
      if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; }
      list.items.push(ol[1]);
      continue;
    }
    flushQuote(); flushList();
    para.push(line.trim());
  }
  flushAll();
  return out.join("");
}

function inlineMd(s) {
  let t = escapeHtml(String(s));
  t = t.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g,
    (m, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^\w_])__([^_\n]+)__(?![\w_])/g, "$1<strong>$2</strong>");
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1<em>$2</em>");
  t = t.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  t = t.replace(/`([^`\n]+)`/g, "$1");
  return t;
}

// ── 素の文章 ──────────────────────────────────────────
export function plainToHtml(text) {
  const src = String(text || "").replace(/\r\n?/g, "\n");
  const paras = src.split(/\n{2,}/).filter((p) => p.trim());
  if (!paras.length) return "";
  if (paras.length === 1) return escapeHtml(paras[0]).replace(/\n/g, "<br>");
  return paras.map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 段落が 1 つだけなら p を外す（文の途中へ置いたときに段落が割れないようにする）
function unwrapSingleParagraph(html) {
  const s = String(html || "");
  if (!s.trim()) return "";
  let div;
  try {
    div = document.createElement("div");
    div.innerHTML = s;
  } catch (e) { return s; }
  if (div.childNodes.length === 1 && div.firstElementChild && div.firstElementChild.tagName === "P") {
    return div.firstElementChild.innerHTML;
  }
  return s;
}
