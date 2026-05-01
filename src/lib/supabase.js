// src/lib/supabase.js
// ContentOS Supabase DB操作関数（低レベル・純粋関数）
// App.jsx の useCallback 内から呼び出す

import { supabase } from "../supabase.js";

// supabase インスタンスを re-export（storage・slots等のインライン操作用）
export { supabase };

// ── accounts ──────────────────────────────────────────

/** ログインユーザーのアカウント一覧を取得 */
export async function dbFetchAccounts(uid) {
  return supabase.from("accounts").select("*").eq("user_id", uid).order("created_at");
}

/** アカウントを新規追加 */
export async function dbInsertAccount(acc) {
  return supabase.from("accounts").insert(acc);
}

/** アカウントを更新 */
export async function dbUpdateAccount(id, fields) {
  return supabase.from("accounts").update(fields).eq("id", id);
}

/** アカウントを削除 */
export async function dbDeleteAccount(id) {
  return supabase.from("accounts").delete().eq("id", id);
}

/** アカウント一覧を全件取得（削除直前の残存確認用） */
export async function dbFetchAllAccounts() {
  return supabase.from("accounts").select("*").order("created_at").then(r => r.data || []);
}

// ── posts ─────────────────────────────────────────────

/**
 * 指定アカウントIDリストの投稿を取得
 * @param {string} uid - Firebase UID
 * @param {string[]} accountIds - account_id の配列
 */
export async function dbFetchPosts(uid, accountIds) {
  return supabase.from("posts").select("*").eq("user_id", uid).in("account_id", accountIds);
}

/** 投稿を保存（新規 or 更新）*/
export async function dbUpsertPost(record) {
  return supabase.from("posts").upsert(record);
}

/** 投稿を削除 */
export async function dbDeletePost(id) {
  return supabase.from("posts").delete().eq("id", id);
}

/** 投稿の任意フィールドを更新 */
export async function dbUpdatePost(id, fields) {
  return supabase.from("posts").update(fields).eq("id", id);
}
