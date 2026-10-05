// メモ欄の箇条書き（Notion と同じ手つき）
// 新しい書き方：「- 」＋ 1 階層ごとに半角スペース 2 つ（CommonMark 0.31.2 §5.2・§5.3）
// 古い書き方　：「・」＋ 1 階層ごとに全角スペース 1 つ。古い行はその書き方のまま動かす
// どの関数も { text, start, end } を返す。何もしないときは null を返し、ブラウザの既定の動きに任せる

const NEW_RE = /^( *)- (.*)$/;
const OLD_RE = /^(　*)・(.*)$/;

export function parseLine(line) {
  let m = NEW_RE.exec(line);
  if (m) {
    const depth = Math.floor(m[1].length / 2);
    const prefixLen = m[1].length + 2;
    return { kind: "new", depth, prefixLen, content: m[2] };
  }
  m = OLD_RE.exec(line);
  if (m) {
    const depth = m[1].length;
    const prefixLen = m[1].length + 1;
    return { kind: "old", depth, prefixLen, content: m[2] };
  }
  return { kind: "plain", depth: -1, prefixLen: 0, content: line };
}

function makePrefix(kind, depth) {
  return kind === "old" ? "　".repeat(depth) + "・" : "  ".repeat(depth) + "- ";
}

function lineBounds(text, pos) {
  const s = text.lastIndexOf("\n", pos - 1) + 1;
  let e = text.indexOf("\n", pos);
  if (e === -1) e = text.length;
  return [s, e];
}

// Tab／Shift+Tab：選んだ全部の行に同じことをする
export function indentLines(text, selStart, selEnd, outdent) {
  const blockStart = lineBounds(text, selStart)[0];
  const lastPos = selEnd > selStart && text[selEnd - 1] === "\n" ? selEnd - 1 : selEnd;
  const blockEnd = lineBounds(text, Math.max(lastPos, blockStart))[1];
  const lines = text.slice(blockStart, blockEnd).split("\n");
  const multi = lines.length > 1;

  // 上の行の深さ（選んだ範囲の 1 つ上の行）
  let prevDepth = -1;
  if (blockStart > 0) {
    const [ps] = lineBounds(text, blockStart - 1);
    prevDepth = parseLine(text.slice(ps, blockStart - 1)).depth;
  }

  let pos = blockStart;
  const changes = []; // { at: 元の位置, oldP, newP }
  const out = [];

  for (const line of lines) {
    const p = parseLine(line);
    let next = line;
    if (p.kind === "plain") {
      if (!outdent && (!multi || line.trim() !== "")) next = "- " + line;
    } else if (!outdent) {
      const target = Math.min(p.depth + 1, prevDepth + 1);
      if (target > p.depth) next = makePrefix(p.kind, target) + p.content;
    } else {
      next = p.depth >= 1 ? makePrefix(p.kind, p.depth - 1) + p.content : p.content;
    }
    if (next !== line) {
      const oldP = p.prefixLen;
      changes.push({ at: pos, oldP, newP: oldP + (next.length - line.length) });
    }
    prevDepth = parseLine(next).depth;
    out.push(next);
    pos += line.length + 1;
  }
  const changed = changes.length > 0;
  // 元の位置を新しい位置へ写す。印の中にあった位置は新しい印の後ろへ寄せる
  const mapPos = v => {
    let add = 0;
    for (const c of changes) {
      if (v >= c.at + c.oldP) add += c.newP - c.oldP;
      else if (v > c.at) return c.at + add + c.newP;
    }
    return v + add;
  };
  const newStart = mapPos(selStart), newEnd = mapPos(selEnd);
  if (!changed) return { text, start: selStart, end: selEnd };
  const result = text.slice(0, blockStart) + out.join("\n") + text.slice(blockEnd);
  return { text: result, start: newStart, end: newEnd };
}

// Enter
export function handleEnter(text, selStart, selEnd) {
  if (selStart !== selEnd) return null;
  const [s, e] = lineBounds(text, selStart);
  const p = parseLine(text.slice(s, e));
  if (p.kind === "plain") return null;
  if (selStart < s + p.prefixLen) return null;
  if (p.content.trim() === "") {
    // 中身の無い行：1 つ上げる。0 なら印を外して抜ける
    const next = p.depth >= 1 ? makePrefix(p.kind, p.depth - 1) : "";
    const t = text.slice(0, s) + next + text.slice(e);
    const c = s + next.length;
    return { text: t, start: c, end: c };
  }
  const ins = "\n" + makePrefix(p.kind, p.depth);
  const t = text.slice(0, selStart) + ins + text.slice(selStart);
  const c = selStart + ins.length;
  return { text: t, start: c, end: c };
}

// Backspace：中身の無い行で、カーソルが印の直後にあるときだけ印を外す
export function handleBackspace(text, selStart, selEnd) {
  if (selStart !== selEnd) return null;
  const [s, e] = lineBounds(text, selStart);
  const p = parseLine(text.slice(s, e));
  if (p.kind === "plain") return null;
  if (p.content !== "" || selStart !== s + p.prefixLen) return null;
  const t = text.slice(0, s) + text.slice(e);
  return { text: t, start: s, end: s };
}

// 貼り付け：箇条書きの行が 1 つでもある複数行だけ、「- 」と半角スペース 2 つの形にそろえる
const PASTE_RE = /^([\t 　]*)(?:[-*] |[・•] ?)(.*)$/;

function indentWidth(ws) {
  let w = 0;
  for (const ch of ws) w += ch === "\t" ? 4 : ch === "　" ? 2 : 1;
  return w;
}

export function normalizePasted(raw) {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length < 2) return null;
  if (!lines.some(l => PASTE_RE.test(l))) return null;
  const stack = []; // { w, depth }
  return lines.map(l => {
    const m = PASTE_RE.exec(l);
    if (!m) return l;
    const w = indentWidth(m[1]);
    while (stack.length && stack[stack.length - 1].w > w) stack.pop();
    let depth;
    if (!stack.length) {
      depth = 0;
      stack.push({ w, depth });
    } else if (stack[stack.length - 1].w === w) {
      depth = stack[stack.length - 1].depth;
    } else {
      depth = stack[stack.length - 1].depth + 1;
      stack.push({ w, depth });
    }
    return { depth, content: m[2] };
  });
}

export function handlePaste(text, selStart, selEnd, raw) {
  const items = normalizePasted(raw);
  if (!items) return null;
  // 中身の無い箇条書きの行に貼ったときは、その行の印を外して深さを引き継ぐ
  const [s, e] = lineBounds(text, selStart);
  const cur = parseLine(text.slice(s, e));
  let base = 0, from = selStart;
  if (selStart === selEnd && cur.kind !== "plain" && cur.content === "" && selStart === s + cur.prefixLen) {
    base = cur.depth;
    from = s;
  }
  const body = items
    .map(it => (typeof it === "string" ? it : "  ".repeat(base + it.depth) + "- " + it.content))
    .join("\n");
  const t = text.slice(0, from) + body + text.slice(selEnd);
  const c = from + body.length;
  return { text: t, start: c, end: c };
}

// 「・ 箇条書き」のボタン：「- 」を入れる
export function insertBullet(text, selStart, selEnd) {
  const [s] = lineBounds(text, selStart);
  const line = text.slice(s, lineBounds(text, selStart)[1]);
  if (parseLine(line).kind !== "plain") return { text, start: selStart, end: selEnd };
  const before = text.slice(0, selStart), after = text.slice(selEnd);
  const ins = selStart === s && line.trim() === "" ? "- " : "\n- ";
  const c = selStart + ins.length;
  return { text: before + ins + after, start: c, end: c };
}

// 変換中かどうか（Safari は確定の Enter より前に compositionend を出すため 3 つを見る）
export function isComposingKey(e, composingRef) {
  return !!(composingRef?.current || e.nativeEvent?.isComposing || e.keyCode === 229);
}
