// src/hooks/usePostActions.js
// 投稿の CRUD・再投稿・複製・ドラッグ操作を担うカスタムフック

import { useCallback } from "react";
import { dbUpsertPost, dbDeletePost, dbUpdatePost, dbUpdateAccount } from "../lib/supabase.js";
import { genId, nowStr, nextDaySameTime, dbToPost, COLORS } from "../constants.js";

export function usePostActions({
  activeAccId, uid, showToast,
  setAllPosts, setPreview, setEditing, setDeleteConfirm, setRepostTgt,
  today, posts, activeAcc,
}) {
  const saveToDb = useCallback(async (p) => {
    const { _unsaved, ...cleanP } = p;
    const record = {
      id: cleanP.id, account_id: activeAccId, user_id: uid,
      title: cleanP.title, status: cleanP.status,
      post_type: cleanP.postType || "x_post",
      datetime: cleanP.datetime,
      body: cleanP.body || "",
      memo: cleanP.memo || "",
      memo_links: cleanP.memoLinks || [],
      comments: cleanP.comments || [],
      history: cleanP.history || [],
      score: cleanP.score || null,
      labels: cleanP.labels || [],
    };
    const { error } = await dbUpsertPost(record);
    if (error) { showToast("保存に失敗しました"); return false; }
    setAllPosts(prev => {
      const cur = prev[activeAccId] || [];
      const exists = cur.find(x => x.id === cleanP.id);
      return { ...prev, [activeAccId]: exists ? cur.map(x => x.id === cleanP.id ? cleanP : x) : [...cur, cleanP] };
    });
    return true;
  }, [activeAccId, uid, showToast, setAllPosts]);

  const save = useCallback(async (p) => {
    const ok = await saveToDb(p);
    if (!ok) return;
    setEditing(null); setPreview(p);
    showToast("保存しました ✅");
  }, [saveToDb, showToast, setEditing, setPreview]);

  const del = useCallback(async (id) => {
    const { error } = await dbDeletePost(id);
    if (error) { showToast("削除に失敗しました"); return; }
    setAllPosts(prev => ({ ...prev, [activeAccId]: (prev[activeAccId] || []).filter(p => p.id !== id) }));
    setPreview(null); setDeleteConfirm(null);
    showToast("削除しました 🗑️");
  }, [activeAccId, showToast, setAllPosts, setPreview, setDeleteConfirm]);

  const changeStatus = useCallback(async (id, s, score) => {
    const update = { status: s, score: score !== undefined ? score : null };
    const { error } = await dbUpdatePost(id, update);
    if (error) { showToast("更新に失敗しました"); return; }
    setAllPosts(prev => ({ ...prev, [activeAccId]: (prev[activeAccId] || []).map(p => p.id === id ? { ...p, ...update } : p) }));
    setPreview(prev => prev && prev.id === id ? { ...prev, ...update } : prev);
  }, [activeAccId, showToast, setAllPosts, setPreview]);

  const changePostType = useCallback(async (id, postType) => {
    const { error } = await dbUpdatePost(id, { post_type: postType });
    if (error) { showToast("更新に失敗しました"); return; }
    setAllPosts(prev => ({ ...prev, [activeAccId]: (prev[activeAccId] || []).map(p => p.id === id ? { ...p, postType } : p) }));
    setPreview(prev => prev && prev.id === id ? { ...prev, postType } : prev);
  }, [activeAccId, showToast, setAllPosts, setPreview]);

  const saveMeta = useCallback(async (id, { memo, memoLinks, labels }) => {
    const update = { memo, memo_links: memoLinks };
    if (labels !== undefined) update.labels = labels;
    const { error } = await dbUpdatePost(id, update);
    if (error) { showToast("保存に失敗しました"); return; }
    const patch = { memo, memoLinks, ...(labels !== undefined ? { labels } : {}) };
    setAllPosts(prev => ({ ...prev, [activeAccId]: (prev[activeAccId] || []).map(p => p.id === id ? { ...p, ...patch } : p) }));
    setPreview(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
  }, [activeAccId, showToast, setAllPosts, setPreview]);

  const saveComment = useCallback(async (id, comments) => {
    const { error } = await dbUpdatePost(id, { comments });
    if (error) { showToast("コメントの保存に失敗しました"); return; }
    setAllPosts(prev => ({ ...prev, [activeAccId]: (prev[activeAccId] || []).map(p => p.id === id ? { ...p, comments } : p) }));
    setPreview(prev => prev && prev.id === id ? { ...prev, comments } : prev);
  }, [activeAccId, showToast, setAllPosts, setPreview]);

  const handleRepost = useCallback(async (p, dt, repeat) => {
    const newPost = {
      ...p, id: genId(), datetime: dt, status: "draft",
      title: repeat !== "none" ? `【再】${p.title}` : p.title,
      history: [{ at: nowStr(), note: `「${p.title}」から再投稿${repeat !== "none" ? ` (${repeat})` : ""}` }],
      comments: [],
    };
    const ok = await saveToDb(newPost);
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
    };
    const ok = await saveToDb(newPost);
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
    setAllPosts(prev => prev); // trigger re-render
    showToast(`「${label}」を追加しました`);
  }, [activeAccId, activeAcc, showToast, setAllPosts]);

  const handleDrop = useCallback(async (postId, dateStr, hour) => {
    const p = posts.find(x => x.id === postId);
    if (!p) return;
    const newDt = `${dateStr}T${String(hour).padStart(2, "0")}:00`;
    if (p.datetime === newDt) return;
    const updated = { ...p, datetime: newDt, history: [...(p.history || []), { at: nowStr(), note: `${p.datetime}→${newDt} (DnD)` }] };
    await saveToDb(updated);
    showToast("日時を変更しました 📅");
  }, [posts, saveToDb, showToast]);

  const openNew = useCallback((datetime, { title = "", postType = "x_post" } = {}) => {
    const newPost = { id: genId(), title, status: "draft", postType, datetime: datetime || `${today}T07:00`, body: "", memo: "", memoLinks: [], comments: [], history: [], labels: [], _unsaved: true };
    setPreview(newPost);
  }, [today, setPreview]);

  return {
    saveToDb, save, del, changeStatus, changePostType,
    saveMeta, saveComment, handleRepost, handleDuplicate,
    addCustomPostType, handleDrop, openNew,
  };
}
