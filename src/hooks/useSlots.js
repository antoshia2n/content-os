// src/hooks/useSlots.js
// 予約枠の読み込み・保存を担うカスタムフック

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

export function useSlots({ activeAccId, uid, showToast }) {
  const [slots, setSlots] = useState([]);
  const slotsRef = useRef(slots);
  useEffect(() => { slotsRef.current = slots; }, [slots]);

  useEffect(() => {
    if (!activeAccId || !uid) return;
    supabase.from("slots").select("*")
      .eq("account_id", activeAccId).eq("user_id", uid)
      .then(({ data, error }) => {
        if (error) { console.error("slots load error:", error); return; }
        setSlots((data || []).map(s => ({
          ...s,
          postType: s.post_type || s.postType || "x_post",
          time: s.time || (s.hour != null ? String(s.hour).padStart(2, "0") + ":00" : null),
        })));
      });
  }, [activeAccId, uid]);

  const saveSlots = useCallback(async (next) => {
    const prev = slotsRef.current;
    const resolved = typeof next === "function" ? next(prev) : next;
    setSlots(resolved);
    if (!activeAccId || !uid) return;
    const prevIds = new Set(prev.map(s => s.id));
    const nextIds = new Set(resolved.map(s => s.id));
    const deleted = [...prevIds].filter(id => !nextIds.has(id));
    const upserted = resolved.map(s => ({
      id: s.id,
      account_id: activeAccId,
      user_id: uid,
      type: s.type || "weekly",
      dow: s.dow,
      time: s.time || "07:00",
      post_type: s.postType || "x_post",
      title: s.title || "",
      nth: s.nth || null,
    }));
    if (deleted.length > 0) {
      const { error: delErr } = await supabase.from("slots").delete().in("id", deleted);
      if (delErr) { showToast("予約枠の保存に失敗しました"); return; }
    }
    if (upserted.length > 0) {
      const { error: upsErr } = await supabase.from("slots").upsert(upserted);
      if (upsErr) { showToast("予約枠の保存に失敗しました"); }
    }
  }, [activeAccId, uid, showToast]);

  return { slots, saveSlots };
}
