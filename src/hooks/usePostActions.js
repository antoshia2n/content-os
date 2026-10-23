// src/hooks/usePostActions.js
// 投稿の CRUD・再投稿・複製・ドラッグ操作を担うカスタムフック

import { useCallback, useRef } from "react";
import { dbUpsertPost, dbDeletePost, dbUpdatePost, dbUpdateAccount } from "../lib/supabase.js";
import { genId, nowStr, nextDaySameTime, COLORS } from "../constants.js";


export function usePostActions({
  activeAccId, uid, showToast,
  setAllPosts, setPreview, setEditing, setDeleteConfirm, setRepostTgt,
  today, posts, activeAcc, setAccounts,
  allPosts, onWrote,
}) {
  // 2026-10-23 4便：保存のたびに増えた字数を数える（題・本文・メモの空白を除いた字数の差。減った分は数えない）
  const allRef = useRef(allPosts); allRef.current = allPosts;
  const wroteRef = useRef(onWrote); wroteRef.current = onWrote;
  const textLen = p => !p ? 0 : ((p.title || "") + (p.body || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ") + (p.memo || "")).replace(/\s/g, "").length;
  // 投稿1件を、どのアカウントの引き出しに入っていても正しく書き換える
  // （「全アカウント」表示では引き出しが1つに決まらないため）
  const patchPost = useCallback((id, patch) => {
    setAllPosts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if ((next[k] || []).some(x => x.id === id)) {
          next[k] = next[k].map(x => x.id === id ? { ...x, ...patch } : x);
        }
      });
      return next;
    });
  }, [setAllPosts]);

  const removePost = useCallback((id) => {
    setAllPosts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        next[k] = (next[k] || []).filter(x => x.id !== id);
      });
      return next;
    });
  }, [setAllPosts]);

  // opts.count=false：複製・再投稿・よそから取り込んだ文など、自分で書いていない字数は数えない
  const saveToDb = useCallback(async (p, opts = {}) => {
    const { _unsaved, ...cleanP } = p;
    const before = Object.values(allRef.current || {}).flat().find(x => x.id === cleanP.id);
    // 既存投稿は元のアカウントに保存する（宛先に引っ越さないようにするため）
    const accId = cleanP.account_id || activeAccId;
    const record = {
      id: cleanP.id, account_id: accId, user_id: uid,
      title: cleanP.title, status: cleanP.datetime && cleanP.status === "idea" ? "draft" : cleanP.datetime && cleanP.status === "waiting" ? "reserved" : !cleanP.datetime && cleanP.status === "reserved" ? "waiting" : cleanP.status,
      genre: cleanP.genre ?? null, theme: cleanP.theme ?? null,
      mm_url: cleanP.mm_url ?? null, manabu: cleanP.manabu ?? false,
      post_type: cleanP.postType || "x_post",
      // 空の日時は「未定」としてデータベースには空で入れる（空文字を残さない）
      datetime: cleanP.datetime || null,
      body: cleanP.body || "",
      memo: cleanP.memo || "",
      memo_links: cleanP.memoLinks || [],
      comments: cleanP.comments || [],
      history: cleanP.history || [],
      score: cleanP.score || null,
      labels: cleanP.labels || [],
      // notion_page_id：Notion アウトプットDB との連携キー（Claude経由で同期）
      notion_page_id: cleanP.notion_page_id || null,
    };
    const { error } = await dbUpsertPost(record);
    if (error) { showToast("保存に失敗しました"); return false; }
    setAllPosts(prev => {
      const cur = prev[accId] || [];
      const exists = cur.find(x => x.id === cleanP.id);
      const saved = { ...cleanP, status: record.status, account_id: accId };
      return { ...prev, [accId]: exists ? cur.map(x => x.id === cleanP.id ? saved : x) : [...cur, saved] };
    });
    const grew = textLen(cleanP) - textLen(before);
    if (opts.count !== false && grew > 0 && wroteRef.current) { try { wroteRef.current(grew); } catch { /* 数えられなくても保存は済んでいる */ } }
    return true;
  }, [activeAccId, uid, showToast, setAllPosts]);

  // 2026-10-23 5便：一覧からの小さな変更（ジャンル・ラベル・日時・状態など）は、変えた欄だけを書く。
  // 行ごと書き直すと、開いたままの画面の古い中身で、Claude が付けた印などを上書きしてしまうため。
  const FIELD_COL = { title: "title", memo: "memo", genre: "genre", theme: "theme", labels: "labels", history: "history", status: "status", postType: "post_type", mm_url: "mm_url", memoLinks: "memo_links", score: "score" };
  const patchFields = useCallback(async (p, fields) => {
    const upd = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === "datetime") upd.datetime = v || null;
      else if (FIELD_COL[k]) upd[FIELD_COL[k]] = v;
    }
    const { error } = await dbUpdatePost(p.id, upd);
    if (error) { showToast("更新に失敗しました"); return false; }
    patchPost(p.id, { ...fields, ...(fields.datetime !== undefined ? { datetime: fields.datetime || "" } : {}) });
    setPreview(prev => prev && prev.id === p.id ? { ...prev, ...fields } : prev);
    return true;
  }, [patchPost, showToast, setPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (p) => {
    const ok = await saveToDb(p);
    if (!ok) return;
    setEditing(null);
    setPreview(p);
    showToast("保存しました ✅");
  }, [saveToDb, showToast, setEditing, setPreview]);

  const del = useCallback(async (id) => {
    const { error } = await dbDeletePost(id);
    if (error) { showToast("削除に失敗しました"); return; }
    removePost(id);
    setPreview(null); setDeleteConfirm(null);
    showToast("削除しました 🗑️");
  }, [removePost, showToast, setPreview, setDeleteConfirm]);

  const changeStatus = useCallback(async (id, s, score) => {
    const update = { status: s, score: score !== undefined ? score : null };
    const { error } = await dbUpdatePost(id, update);
    if (error) { showToast("更新に失敗しました"); return; }
    patchPost(id, update);
    setPreview(prev => prev && prev.id === id ? { ...prev, ...update } : prev);
  }, [patchPost, showToast, setPreview]);

  const changePostType = useCallback(async (id, postType) => {
    const { error } = await dbUpdatePost(id, { post_type: postType });
    if (error) { showToast("更新に失敗しました"); return; }
    patchPost(id, { postType });
    setPreview(prev => prev && prev.id === id ? { ...prev, postType } : prev);
  }, [patchPost, showToast, setPreview]);

  const saveMeta = useCallback(async (id, { memo, memoLinks, labels }) => {
    const update = { memo, memo_links: memoLinks };
    if (labels !== undefined) update.labels = labels;
    const { error } = await dbUpdatePost(id, update);
    if (error) { showToast("保存に失敗しました"); return; }
    const patch = { memo, memoLinks, ...(labels !== undefined ? { labels } : {}) };
    patchPost(id, patch);
    setPreview(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
  }, [patchPost, showToast, setPreview]);

  const saveComment = useCallback(async (id, comments) => {
    const { error } = await dbUpdatePost(id, { comments });
    if (error) { showToast("コメントの保存に失敗しました"); return; }
    patchPost(id, { comments });
    setPreview(prev => prev && prev.id === id ? { ...prev, comments } : prev);
  }, [patchPost, showToast, setPreview]);

  const handleRepost = useCallback(async (p, dt, repeat) => {
    const newPost = {
      ...p, id: genId(), datetime: dt, status: "draft",
      title: repeat !== "none" ? `【再】${p.title}` : p.title,
      history: [{ at: nowStr(), note: `「${p.title}」から再投稿${repeat !== "none" ? ` (${repeat})` : ""}` }],
      comments: [],
      // 再投稿は新規 Notion レコードとして作成
      notion_page_id: null,
    };
    const ok = await saveToDb(newPost, { count: false });
    if (!ok) return;
    setRepostTgt(null);
    showToast("再投稿を作成しました ✅");
  }, [saveToDb, showToast, setRepostTgt]);

  const handleDuplicate = useCallback(async (p) => {
    const newPost = {
      ...p, id: genId(),
      datetime: nextDaySameTime(p.datetime),
      status: "draft",
      title: `【複製】${p.title}`,
      history: [{ at: nowStr(), note: `「${p.title}」を複製` }],
      comments: [],
      // 複製は新規 Notion レコードとして作成
      notion_page_id: null,
    };
    const ok = await saveToDb(newPost, { count: false });
    if (!ok) return;
    setPreview(null);
    showToast("翌日同時刻に複製しました ✅");
  }, [saveToDb, showToast, setPreview]);

  const addCustomPostType = useCallback(async (label) => {
    if (!activeAccId) return;
    const key = "custom_" + label.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const hexToRgba = (hex, a) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    };
    const newType = { key, label, color, bg: hexToRgba(color, 0.1), border: hexToRgba(color, 0.35) };
    const current = activeAcc?.custom_post_types || [];
    const next = [...current, newType];
    const { error } = await dbUpdateAccount(activeAccId, { custom_post_types: next });
    if (error) { showToast("追加に失敗しました"); return; }
    setAccounts(prev => prev.map(a => a.id === activeAccId ? { ...a, custom_post_types: next } : a));
    showToast(`「${label}」を追加しました`);
  }, [activeAccId, activeAcc, showToast, setAccounts]);

  const openNew = useCallback((datetime, { title = "", postType = "x_post" } = {}) => {
    const newPost = { id: genId(), title, status: "draft", postType, datetime: datetime || `${today}T07:00`, body: "", memo: "", memoLinks: [], comments: [], history: [], labels: [], notion_page_id: null, account_id: activeAccId, _unsaved: true };
    setPreview(newPost);
  }, [today, activeAccId, setPreview]);

  return {
    saveToDb, save, del, removePost, changeStatus, changePostType,
    saveMeta, saveComment, handleRepost, handleDuplicate,
    addCustomPostType, openNew, patchFields,
  };
}
