// ════════════════════════════════════════════════════════
// 記事の画像（2026-11-07・作る前の 1 枚に Naoki OK 15:02）
// ════════════════════════════════════════════════════════
// 試しで分かったこと（2026-11-07 Naoki）：
//   note の本文 … 文と画像をまとめて貼れば、画像も入る
//   note の見出し画像・X記事の本文・X記事の表紙 … 貼り付けでは入らない（ファイルを選ぶ）
// よって、コピーは 2 通り（画像つき／画像の位置に目印）、画像はファイルとしてまとめて保存できるようにする。
import { SUPABASE_URL } from "../supabase.js";
import { auth } from "../firebase.js";
import { STORAGE_BUCKET } from "../constants.js";

/** 画像 1 枚を挿し絵の置き場へ上げて、公開の住所を返す（本文の差し込み・サムネ・貼り付けで共通） */
export async function uploadImage(file) {
  if (!file || !/^image\//.test(file.type || "")) throw new Error("画像のファイルだけ置けます");
  if (file.size > 50 * 1024 * 1024) throw new Error("画像は 50MB 以下にしてください");
  const user = auth.currentUser;
  if (!user) throw new Error("ログイン状態を確認できませんでした。ページを再読み込みしてください");
  const token = await user.getIdToken();
  const name = file.name && /\.[a-z0-9]+$/i.test(file.name) ? file.name : `paste.${(file.type.split("/")[1] || "png").replace("jpeg", "jpg")}`;
  const res = await fetch(`/api/storage/upload?bucket=${encodeURIComponent(STORAGE_BUCKET)}&name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out?.path) throw new Error([out?.message, out?.hint].filter(Boolean).join(" / ") || `保存できませんでした（${res.status}）`);
  // 公開の住所（supabase の getPublicUrl と同じ形を手で作る・2026-11-08 軽い版へ移したため）
  if (!SUPABASE_URL) throw new Error("公開の住所を作れませんでした");
  return `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/${STORAGE_BUCKET}/${out.path}`;
}

// 保存できる画像の住所（公開の住所か、中身つきの data:）。目印の番号と保存の番号は、この同じ数え方でそろえる
const usable = u => /^https:\/\//.test(u) || /^data:image\//.test(u);

/** 本文の画像の住所（出てくる順） */
export function bodyImages(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  return [...doc.querySelectorAll("img")].map(i => i.getAttribute("src") || "").filter(usable);
}

/** X記事用：画像の位置に【画像1】【画像2】…の目印を置く（画像だけの段落は、段落ごと目印にする） */
export function markImagesForX(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, "text/html");
  const root = doc.getElementById("r");
  let n = 0;
  root.querySelectorAll("img").forEach(img => {
    if (!usable(img.getAttribute("src") || "")) { img.remove(); return; } // 保存できない画像は、番号を振らずに外す
    n += 1;
    const mark = doc.createElement("p"); mark.textContent = `【画像${n}】`;
    const p = img.closest("p");
    if (p && root.contains(p) && !(p.textContent || "").trim() && p.querySelectorAll("img").length === 1) p.replaceWith(mark);
    else img.replaceWith(doc.createTextNode(`【画像${n}】`));
  });
  return root.innerHTML;
}

const extOf = (url, type) => {
  const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(url || "");
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  return ((type || "").split("/")[1] || "png").replace("jpeg", "jpg");
};
const safeName = s => String(s || "").replace(/[\\/:*?"<>|\n\r\t]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) || "記事";

/** 保存する名前の並び：00_サムネ・01・02…（X記事の目印の番号と同じ） */
export function bundleNames(thumb, images) {
  const out = [];
  if (thumb) out.push({ url: thumb, base: "00_サムネ" });
  images.forEach((url, i) => out.push({ url, base: String(i + 1).padStart(2, "0") }));
  return out;
}

// ── zip を 1 つ作る（圧縮なしの zip。Mac・Windows とも、開けば中のフォルダが出る）──
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const now = new Date();
  const dosT = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosD = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); // 0x0800＝名前は UTF-8
    lh.setUint16(8, 0, true); lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

/**
 * サムネと本文の画像を、名前の順に zip 1 つにまとめて保存する（2026-11-07 15:14 直し）。
 * 前はフォルダを選ばせていたが、Chrome は「ダウンロード」「デスクトップ」などを選ぶと
 * 「システム ファイルが含まれているため開けません」で断る。zip ならいつものダウンロードに 1 つ落ちるだけで、
 * 開けば「日付_題」のフォルダに 00_サムネ・01・02… が並ぶ。
 * 戻り値：{ saved: 入った枚数, failed: 取れなかった枚数, file: zip の名前 }
 */
export async function saveImageBundle({ thumb, images, title, date }) {
  const list = bundleNames(thumb, images);
  if (!list.length) return { saved: 0, failed: 0, file: "" };
  const folder = `${(date || "").slice(0, 10) || "日付なし"}_${safeName(title)}`;
  const files = [];
  let failed = 0;
  for (const it of list) {
    try {
      const res = await fetch(it.url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      files.push({ name: `${folder}/${it.base}.${extOf(it.url, blob.type)}`, data: new Uint8Array(await blob.arrayBuffer()) });
    } catch (_) { failed += 1; }
  }
  if (!files.length) return { saved: 0, failed, file: "" };
  const zip = makeZip(files), href = URL.createObjectURL(zip), file = `${folder}.zip`;
  const a = document.createElement("a"); a.href = href; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
  return { saved: files.length, failed, file };
}
