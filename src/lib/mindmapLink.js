// src/lib/mindmapLink.js
// 2026-11-03 思考整理くんとの連携 便 1（Naoki OK 22:15）：ネタから構成のマップを作って、別のタブで開く。
// - マップを作るのは思考整理くんの口 POST /api/ext/from-idea（コンテンツくんの画面からだけ・本人だけ）
// - 返ってきたマップの住所を、このアプリが自分の表（posts.mm_url）に入れる。思考整理くんはコンテンツくんの表に書かない
// - 同じネタでもう一度押すと、思考整理くんが同じマップを返す（2 枚にならない）
import { auth } from "../firebase.js";

export const MINDMAP_ORIGIN = "https://mindmap.shia2n.jp";

/** ネタの名前（1 行目）とメモ。名前が空ならメモの 1 行目を名前にする */
export function ideaForMap(p) {
  const title = (p.title || "").trim();
  const memo = p.memo || "";
  if (title) return { title, memo };
  const lines = memo.split(/\r?\n/);
  return { title: (lines[0] || "").trim(), memo: lines.slice(1).join("\n") };
}

/** 思考整理くんにマップを作ってもらい、住所を返す。失敗したら言葉つきで投げる */
export async function createStructureMap(p, fetchFn = fetch) {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインを確かめられませんでした。再読み込みしてください");
  const token = await user.getIdToken();
  const { title, memo } = ideaForMap(p);
  let res;
  try {
    res = await fetchFn(`${MINDMAP_ORIGIN}/api/ext/from-idea`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ idea_id: p.id, title, memo }),
    });
  } catch {
    throw new Error("思考整理くんにつながりませんでした。通信を確かめてもう一度押してください");
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.url) throw new Error(j.message || "思考整理くんでマップを作れませんでした");
  return j.url;
}

/**
 * 「構成をつくる →」の動き。押した瞬間に空のタブを開いておき（あとで開くとブラウザに止められるため）、
 * マップができたらそこへ移す。できなければタブを閉じる。
 * saveUrl(url) はネタの mm_url を保存する関数（成功で true）
 */
export async function makeStructure(p, saveUrl, toast) {
  const w = window.open("about:blank", "_blank");
  try {
    const url = await createStructureMap(p);
    const ok = await saveUrl(url);
    if (w) { try { w.opener = null; } catch { /* 開けたタブにはそのまま移す */ } w.location.href = url; }
    else window.open(url, "_blank", "noopener");
    toast(ok ? "構成のマップを作り、別のタブで開きました" : "マップは作りましたが、このネタにリンクを残せませんでした。もう一度押すと同じマップが開きます");
    return url;
  } catch (e) {
    if (w) try { w.close(); } catch { /* 閉じられなくても続ける */ }
    toast(e.message || "マップを作れませんでした");
    return null;
  }
}

// ── 2026-11-08 Notion の形へ 便④：エディタの「構成（箇条書き）」タブ ──
// 正本は思考整理くんのマップ。このアプリは住所（mm_url）を持つだけで、行は思考整理くんの口 /api/ext/outline で読み書きする
/** マップの住所（https://mindmap.shia2n.jp/m/<id>…）から id を取る。無ければ "" */
export function mapIdOf(url) {
  const m = String(url || "").match(/\/m\/([\w-]{1,64})/);
  return m ? m[1] : "";
}
/** マップの枝から送ったネタは住所に ?n=枝の id が付く。その枝の下がネタの構成（2026-11-08 直し） */
export function nodeIdOf(url) {
  const m = String(url || "").match(/[?&]n=([\w-]{1,64})/);
  return m ? m[1] : "";
}
async function outlineCall(method, id, payload, fetchFn = fetch, node = "") {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインを確かめられませんでした。再読み込みしてください");
  const token = await user.getIdToken();
  let res;
  try {
    res = await fetchFn(`${MINDMAP_ORIGIN}/api/ext/outline${method === "GET" ? `?id=${encodeURIComponent(id)}${node ? `&node=${encodeURIComponent(node)}` : ""}` : ""}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(method === "PUT" ? { "Content-Type": "application/json" } : {}) },
      ...(method === "PUT" ? { body: JSON.stringify({ id, ...(node ? { node } : {}), ...payload }) } : {}),
    });
  } catch {
    throw new Error("思考整理くんにつながりませんでした。通信を確かめてください");
  }
  const j = await res.json().catch(() => ({}));
  if (res.status === 409 && j.conflict) return { ...j, conflict: true };
  if (!res.ok) throw new Error(j.message || "思考整理くんのマップを読み書きできませんでした");
  return j;
}
/** マップを行で読む → { id, rev, title, url, lines: [{ id, d, t }] } */
export const getOutline = (id, fetchFn, node) => outlineCall("GET", id, null, fetchFn, node);
/** 行で書く。版が古ければ { conflict: true, ...今の中身 } が返る */
export const putOutline = (id, rev, lines, fetchFn, node) => outlineCall("PUT", id, { rev, lines }, fetchFn, node);
