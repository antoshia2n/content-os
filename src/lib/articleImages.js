// ════════════════════════════════════════════════════════
// 記事の画像（2026-11-07・作る前の 1 枚に Naoki OK 15:02）
// ════════════════════════════════════════════════════════
// 試しで分かったこと（2026-11-07 Naoki）：
//   note の本文 … 文と画像をまとめて貼れば、画像も入る
//   note の見出し画像・X記事の本文・X記事の表紙 … 貼り付けでは入らない（ファイルを選ぶ）
// よって、コピーは 2 通り（画像つき／画像の位置に目印）、画像はファイルとしてまとめて保存できるようにする。
import { supabase } from "./supabase.js";
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
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(out.path);
  if (!data?.publicUrl) throw new Error("公開の住所を作れませんでした");
  return data.publicUrl;
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

/**
 * サムネと本文の画像を、名前の順にまとめて保存する。
 * フォルダを選べるブラウザ（Chrome・Edge）は、選んだフォルダの中に「日付_題」のフォルダを作って入れる。
 * 選べないブラウザは、1 枚ずつ保存する（ブラウザが「複数のファイルを保存しますか」と聞くことがある）。
 * 戻り値：{ saved: 入った枚数, failed: 取れなかった枚数, folder: 作ったフォルダの名前 }
 */
export async function saveImageBundle({ thumb, images, title, date }) {
  const list = bundleNames(thumb, images);
  if (!list.length) return { saved: 0, failed: 0, folder: "" };
  const folder = `${(date || "").slice(0, 10) || "日付なし"}_${safeName(title)}`;
  let dir = null;
  if (typeof window.showDirectoryPicker === "function") {
    const parent = await window.showDirectoryPicker({ mode: "readwrite" }); // 閉じたら AbortError（呼んだ側で受け止める）
    dir = await parent.getDirectoryHandle(folder, { create: true });
  }
  let saved = 0, failed = 0;
  for (const it of list) {
    try {
      const res = await fetch(it.url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = `${it.base}.${extOf(it.url, blob.type)}`;
      if (dir) {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      } else {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = href; a.download = `${folder}_${name}`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 4000);
        await new Promise(r => setTimeout(r, 350)); // 続けて保存するときに、ブラウザが取りこぼさないよう少し間を置く
      }
      saved += 1;
    } catch (_) { failed += 1; }
  }
  return { saved, failed, folder: dir ? folder : "" };
}
