import test from "node:test";
import assert from "node:assert/strict";
import { forNote, hasQuote, quoteToBold, spaceImages } from "../src/lib/noteCopy.js";

const IMG = (n) => `<p><img src="https://x/${n}.png" alt="${n}" style="max-width:100%;"/></p>`;
const E = "<p><br></p>";

test("続けて並んだ画像のあいだに空の段落が 1 つずつ入る（5 枚なら 4 つ）", () => {
  const out = spaceImages(`<p>文</p>${IMG(1)}${IMG(2)}${IMG(3)}${IMG(4)}${IMG(5)}<p>次の文</p>`);
  assert.equal(out, `<p>文</p>${IMG(1)}${E}${IMG(2)}${E}${IMG(3)}${E}${IMG(4)}${E}${IMG(5)}<p>次の文</p>`);
});

test("前後に文がある画像・1 枚だけの画像には何も足さない", () => {
  const src = `<p>文</p>${IMG(1)}<p>文</p>${IMG(2)}<h2>見出し</h2>${IMG(3)}`;
  assert.equal(spaceImages(src), src);
});

test("blockquote は太字の段落に。中の改行は残り、中の太字は二重にならない", () => {
  assert.equal(
    quoteToBold("<blockquote><strong>Xでバズりつつ？</strong></blockquote>"),
    "<p><strong>Xでバズりつつ？</strong></p>"
  );
  assert.equal(
    quoteToBold("<blockquote>1行目<br>2行目</blockquote>"),
    "<p><strong>1行目<br>2行目</strong></p>"
  );
  assert.equal(
    quoteToBold("<blockquote><p>A</p><p></p><p>B</p></blockquote>"),
    "<p><strong>A</strong></p><p><strong>B</strong></p>"
  );
});

test("forNote：既定は引用をそのまま残し、quoteBold で太字に変える", () => {
  const src = `<blockquote>引用</blockquote>${IMG(1)}${IMG(2)}`;
  assert.equal(forNote(src), `<blockquote>引用</blockquote>${IMG(1)}${E}${IMG(2)}`);
  assert.equal(forNote(src, { quoteBold: true }), `<p><strong>引用</strong></p>${IMG(1)}${E}${IMG(2)}`);
  assert.equal(hasQuote(src), true);
  assert.equal(hasQuote("<p>a</p>"), false);
});
