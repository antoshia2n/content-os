import test from "node:test";
import assert from "node:assert/strict";
import { sniffImage } from "../functions/api/internal/_sniff.js";

test("受け口：画像の先頭なら種類、HTML なら null", () => {
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), "image/png");
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])), "image/jpeg");
  assert.equal(sniffImage(new TextEncoder().encode("<!DOCTYPE html><html>")), null);
  assert.equal(sniffImage(new Uint8Array(3)), null);
});
