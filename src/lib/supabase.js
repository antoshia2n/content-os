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
  // 2026-10-06：1,000 件ずつ区切って最後まで読む（1 回に返る行の上限で古い投稿を落とさないため。シート画面と同じ作り）
  const all = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from("posts").select("*").eq("user_id", uid).in("account_id", accountIds)
      .order("id").range(start, start + 999);
    if (error) return { data: null, error };
    all.push(...(data || []));
    if (!data || data.length < 1000) return { data: all, error: null };
  }
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

// ── シート：必要な列だけ・月／展開したまとまりだけ ────────
export const SHEET_COLUMNS = 'id,account_id,datetime,status,post_type,genre,theme,title,mm_url,manabu';
const sheetLiteral = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
export function sheetGroupConditions(field, values) {
  return [
    ...values.map(value => ({ key: value, condition: `${field}.eq.${sheetLiteral(value)}` })),
    { key: '__empty__', condition: `or(${field}.is.null,${field}.eq."")` },
    ...(values.length ? [{ key: '__other__', condition: `and(${field}.not.is.null,${field}.neq."",${field}.not.in.(${values.map(sheetLiteral).join(',')}))` }] :
      [{ key: '__other__', condition: `and(${field}.not.is.null,${field}.neq."")` }]),
  ];
}
function sheetQuery({uid,accountIds,tab,month,status,search,condition}, count = false) {
  let q = supabase.from('posts').select(count ? 'id' : SHEET_COLUMNS, count ? { count:'exact', head:true } : undefined)
    .eq('user_id',uid).in('account_id',accountIds);
  const conditions = [];
  if (tab === 'ideas') {
    q = q.in('status',['idea','waiting']);
    conditions.push('or(datetime.is.null,datetime.eq."")');
  } else {
    const next = new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1);
    const end = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`;
    q = q.gte('datetime',`${month}-01`).lt('datetime',end).neq('status','idea');
    if (status && status !== 'all') q = q.eq('status',status);
  }
  if (search) {
    const term = sheetLiteral('%'+search.replace(/[\\%_]/g,'\\$&')+'%');
    conditions.push(`or(theme.ilike.${term},title.ilike.${term})`);
  }
  if (condition) conditions.push(condition);
  if (conditions.length) q = q.or(`and(${conditions.join(',')})`);
  return count ? q : q.order('datetime',{nullsFirst:true}).order('id');
}
export async function dbFetchSheetRows(options) {
  const rows = [];
  // PostgREST の件数上限で行を落とさない。
  for (let start=0;;start+=1000) {
    const {data,error} = await sheetQuery(options).range(start,start+999);
    if (error) throw error;
    rows.push(...(data||[]));
    if (!data || data.length < 1000) return rows;
  }
}
export async function dbCountSheetGroup(options) {
  const {count,error} = await sheetQuery(options,true);
  if (error) throw error;
  if (count == null) throw new Error('シートの件数を取得できませんでした');
  return count;
}
export async function dbFetchSheetGenres(uid) {
  const {data,error} = await supabase.from('sheet_genres').select('id,name,sort_order').eq('user_id',uid).order('sort_order').order('name');
  if (error) throw error;
  return data||[];
}
export async function dbAddSheetGenre(uid,name,sortOrder) {
  const {data,error} = await supabase.from('sheet_genres').insert({user_id:uid,name,sort_order:sortOrder}).select('id,name,sort_order').single();
  if (error) throw error;
  return data;
}
export async function dbRemoveSheetGenre(uid,id) {
  const {error} = await supabase.from('sheet_genres').delete().eq('user_id',uid).eq('id',id);
  if (error) throw error;
}
export async function dbSaveSheetRow(uid,id,fields) {
  const {data,error} = await supabase.from('posts').update(fields).eq('user_id',uid).eq('id',id).select(SHEET_COLUMNS).single();
  if (error) throw error;
  return data;
}
export async function dbAddSheetIdea(uid,accountId,id) {
  const {data,error} = await supabase.from('posts').insert({id,user_id:uid,account_id:accountId,status:'idea',datetime:null,title:'',post_type:'x_post'}).select(SHEET_COLUMNS).single();
  if (error) throw error;
  return data;
}

// ── 段 5：本文・メモ・締めの型（content_templates）。sheet_genres と同じく利用者ごとに持つ ──
const TEMPLATE_COLUMNS='id,name,kind,post_type,content,sort_order';
export async function dbFetchTemplates(uid) {
  const {data,error} = await supabase.from('content_templates').select(TEMPLATE_COLUMNS).eq('user_id',uid).order('kind').order('sort_order');
  if (error) throw error;
  return data||[];
}
export async function dbAddTemplate(uid,fields) {
  const {data,error} = await supabase.from('content_templates').insert({...fields,user_id:uid}).select(TEMPLATE_COLUMNS).single();
  if (error) throw error;
  return data;
}
export async function dbUpdateTemplate(uid,id,fields) {
  const {data,error} = await supabase.from('content_templates').update({...fields,updated_at:new Date().toISOString()}).eq('user_id',uid).eq('id',id).select(TEMPLATE_COLUMNS).single();
  if (error) throw error;
  return data;
}
export async function dbRemoveTemplate(uid,id) {
  const {error} = await supabase.from('content_templates').delete().eq('user_id',uid).eq('id',id);
  if (error) throw error;
}
