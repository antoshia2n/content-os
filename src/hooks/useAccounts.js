// src/hooks/useAccounts.js
// アカウント管理・初期データロードを担うカスタムフック

import { useState, useEffect, useCallback } from "react";
import {
  dbFetchAccounts, dbFetchPosts,
  dbInsertAccount, dbUpdateAccount, dbDeleteAccount, dbFetchAllAccounts,
} from "../lib/supabase.js";
import { dbToPost } from "../constants.js";

export function useAccounts({ uid, urlAccountId, isClient, showToast }) {
  const [accounts, setAccounts] = useState([]);
  const [allPosts, setAllPosts] = useState({});
  const [activeAccId, setActiveAccId] = useState(urlAccountId || null);
  const [loading, setLoading] = useState(true);

  // 初期ロード
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: accs } = await dbFetchAccounts(uid);
      if (accs && accs.length > 0) {
        setAccounts(accs);
        const firstId = urlAccountId || accs[0].id;
        setActiveAccId(firstId);
        const targetIds = isClient ? [firstId] : accs.map(a => a.id);
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

  const addAccount = useCallback(async () => {
    const id = "acc_" + Date.now();
    const acc = { id, name: "新規クライアント", handle: "@handle", color: "#6b7280", user_id: uid };
    const { error } = await dbInsertAccount(acc);
    if (error) { showToast("追加に失敗しました"); return; }
    setAccounts(prev => [...prev, acc]);
    setAllPosts(prev => ({ ...prev, [id]: [] }));
    setActiveAccId(id);
    return id; // showAccountSettings は呼び出し元で制御
  }, [uid, showToast]);

  const updateAccount = useCallback(async (id, fields) => {
    const { error } = await dbUpdateAccount(id, fields);
    if (error) { showToast("更新に失敗しました"); return; }
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...fields } : a));
  }, [showToast]);

  const deleteAccount = useCallback(async (id) => {
    const cur = await dbFetchAllAccounts();
    if (cur.length <= 1) { showToast("最後のアカウントは削除できません"); return; }
    const { error } = await dbDeleteAccount(id);
    if (error) { showToast("削除に失敗しました"); return; }
    const remaining = cur.filter(a => a.id !== id);
    setAccounts(remaining);
    setAllPosts(prev => { const n = { ...prev }; delete n[id]; return n; });
    setActiveAccId(prev => prev === id ? remaining[0]?.id : prev);
  }, [showToast]);

  const copyShareLink = useCallback((accId) => {
    const base = window.location.href.split("?")[0];
    navigator.clipboard.writeText(`${base}?account=${accId}`)
      .then(() => showToast("共有リンクをコピーしました"))
      .catch(() => showToast("コピー完了"));
  }, [showToast]);

  return {
    accounts, setAccounts,
    allPosts, setAllPosts,
    activeAccId, setActiveAccId,
    loading,
    addAccount, updateAccount, deleteAccount, copyShareLink,
  };
}
