// src/hooks/useAccounts.js
// アカウント管理・初期データロードを担うカスタムフック
//
// ContentOS 改良 v1.0 ブロック2 での変更点
//   - 既定アカウント（is_default）を初期選択に使う
//   - 並び順（sort_order）で切替UIの順番を決める
//   - 無効（is_active=false）のアカウントは切替候補から外す
//   - 選択中のアカウントを次回起動時も維持する
//   - アカウントの削除を廃止（要件 F4：過去投稿の紐付きが壊れるため）
//   - v1.1：媒体は accounts に持たせない。default_platform（任意・登録時の初期値専用）のみ

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  dbFetchAccounts, dbFetchPosts,
  dbInsertAccount, dbUpdateAccount,
} from "../lib/supabase.js";
import { dbToPost } from "../constants.js";

// 選択中アカウントの保存先（ブラウザ内）
const ACTIVE_ACC_KEY = "contentos.activeAccountId";

function readStoredAccId() {
  try { return window.localStorage.getItem(ACTIVE_ACC_KEY) || null; }
  catch { return null; }
}

function writeStoredAccId(id) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_ACC_KEY, id);
    else window.localStorage.removeItem(ACTIVE_ACC_KEY);
  } catch { /* 保存できない環境でも本体の動作は止めない */ }
}

/** 並び順（sort_order）→ 作成日時 の順に並べる */
function sortAccounts(list) {
  return [...list].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
}

export function useAccounts({ uid, urlAccountId, isClient, showToast }) {
  const [accounts, setAccountsRaw] = useState([]);
  const [allPosts, setAllPosts] = useState({});
  const [activeAccId, setActiveAccIdRaw] = useState(urlAccountId || null);
  const [loading, setLoading] = useState(true);

  // 並び順を常に保った状態で保持する
  const setAccounts = useCallback((next) => {
    setAccountsRaw(prev => sortAccounts(typeof next === "function" ? next(prev) : next));
  }, []);

  // 選択したアカウントを覚えておく（次回起動時に復元する）
  const setActiveAccId = useCallback((next) => {
    setActiveAccIdRaw(prev => {
      const value = typeof next === "function" ? next(prev) : next;
      if (!isClient) writeStoredAccId(value);
      return value;
    });
  }, [isClient]);

  // 切替UIに出すアカウント（無効にしたものは出さない）
  const switchableAccounts = useMemo(
    () => accounts.filter(a => a.is_active !== false),
    [accounts]
  );

  const defaultAccount = useMemo(
    () => accounts.find(a => a.is_default) || null,
    [accounts]
  );

  // ── 初期ロード ────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: accs } = await dbFetchAccounts(uid);
      if (accs && accs.length > 0) {
        const sorted = sortAccounts(accs);
        setAccountsRaw(sorted);

        // 選択の優先順位：共有リンク → 前回の選択 → 既定アカウント → 先頭
        const active = sorted.filter(a => a.is_active !== false);
        const stored = isClient ? null : readStoredAccId();
        const pick =
          (urlAccountId && sorted.find(a => a.id === urlAccountId)?.id) ||
          (stored && active.find(a => a.id === stored)?.id) ||
          active.find(a => a.is_default)?.id ||
          active[0]?.id ||
          sorted[0]?.id ||
          null;

        setActiveAccIdRaw(pick);
        if (!isClient) writeStoredAccId(pick);

        const targetIds = isClient ? [pick] : sorted.map(a => a.id);
        const { data: ps } = await dbFetchPosts(uid, targetIds);
        if (ps) {
          const grouped = {};
          ps.forEach(p => {
            if (!grouped[p.account_id]) grouped[p.account_id] = [];
            grouped[p.account_id].push(dbToPost(p));
          });
          setAllPosts(grouped);
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  // ── 追加 ──────────────────────────────────────────────
  const addAccount = useCallback(async () => {
    const id = "acc_" + Date.now();
    const maxOrder = accounts.reduce((m, a) => Math.max(m, a.sort_order ?? 0), 0);
    const acc = {
      id,
      name: "新規クライアント",
      handle: "@handle",
      color: "#6b7280",
      user_id: uid,
      is_default: false,
      sort_order: maxOrder + 1,
      is_active: true,
    };
    const { error } = await dbInsertAccount(acc);
    if (error) { showToast("追加に失敗しました"); return; }
    setAccounts(prev => [...prev, acc]);
    setAllPosts(prev => ({ ...prev, [id]: [] }));
    setActiveAccId(id);
    return id; // showAccountSettings は呼び出し元で制御
  }, [uid, accounts, showToast, setAccounts, setActiveAccId]);

  // ── 編集 ──────────────────────────────────────────────
  const updateAccount = useCallback(async (id, fields) => {
    const { error } = await dbUpdateAccount(id, fields);
    if (error) { showToast("更新に失敗しました"); return; }
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...fields } : a));
  }, [showToast, setAccounts]);

  // ── 既定アカウントの指定 ──────────────────────────────
  // 他のアカウントの既定はデータベース側の仕組みで自動的に外れる
  const setDefaultAccount = useCallback(async (id) => {
    const { error } = await dbUpdateAccount(id, { is_default: true });
    if (error) { showToast("既定アカウントの設定に失敗しました"); return; }
    setAccounts(prev => prev.map(a => ({ ...a, is_default: a.id === id })));
    showToast("既定アカウントにしました");
  }, [showToast, setAccounts]);

  // ── 有効 / 無効の切り替え ─────────────────────────────
  const setAccountActive = useCallback(async (id, nextActive) => {
    const target = accounts.find(a => a.id === id);
    if (!nextActive && target?.is_default) {
      showToast("既定アカウントは無効にできません");
      return;
    }
    if (!nextActive && accounts.filter(a => a.is_active !== false).length <= 1) {
      showToast("最後の1つは無効にできません");
      return;
    }
    const { error } = await dbUpdateAccount(id, { is_active: nextActive });
    if (error) { showToast("切り替えに失敗しました"); return; }
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, is_active: nextActive } : a));

    // 無効にしたアカウントを表示中だったら、他の有効なアカウントへ移す
    if (!nextActive) {
      const fallback = accounts.find(a => a.id !== id && a.is_active !== false);
      setActiveAccId(prev => (prev === id ? (fallback?.id ?? prev) : prev));
    }
  }, [accounts, showToast, setAccounts, setActiveAccId]);

  // ── 並び替え（1つ上 / 1つ下）──────────────────────────
  const moveAccount = useCallback(async (id, dir) => {
    const sorted = sortAccounts(accounts);
    const i = sorted.findIndex(a => a.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= sorted.length) return;

    const swapped = [...sorted];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    const renumbered = swapped.map((a, idx) => ({ ...a, sort_order: idx + 1 }));

    setAccounts(renumbered);
    const results = await Promise.all(
      renumbered.map(a => dbUpdateAccount(a.id, { sort_order: a.sort_order }))
    );
    if (results.some(r => r?.error)) showToast("並び替えの保存に失敗しました");
  }, [accounts, showToast, setAccounts]);

  // ── 共有リンクのコピー ────────────────────────────────
  const copyShareLink = useCallback((accId) => {
    const base = window.location.href.split("?")[0];
    navigator.clipboard.writeText(`${base}?account=${accId}`)
      .then(() => showToast("共有リンクをコピーしました"))
      .catch(() => showToast("コピー完了"));
  }, [showToast]);

  return {
    accounts, setAccounts,
    switchableAccounts, defaultAccount,
    allPosts, setAllPosts,
    activeAccId, setActiveAccId,
    loading,
    addAccount, updateAccount, copyShareLink,
    setDefaultAccount, setAccountActive, moveAccount,
  };
}
