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
          // 2026-11-10 配信計画：ネタの表（ジャンルの名前）・狙い・引用元（ほかの枠の id）
          genre: s.genre ?? null, aim: s.aim ?? "", quote_of: s.quote_of ?? null,
          // 2026-11-18 枠の資料（リンク・チェックリスト・PDF・MD）
          materials: Array.isArray(s.materials) ? s.materials : [],
          quote_gap: Number.isInteger(s.quote_gap) ? s.quote_gap : null, // 2026-11-18 何日前の相手か（後は負）
          tpl_id: s.tpl_id || null, // 2026-11-18 枠の型
          day_rules: s.day_rules && typeof s.day_rules === "object" ? s.day_rules : {}, // 2026-11-18 毎日の枠の曜日ごとの上書き
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
      genre: s.genre || null,
      aim: s.aim || null,
      quote_of: s.quote_of != null && s.quote_of !== "" ? String(s.quote_of) : null,
      materials: Array.isArray(s.materials) ? s.materials : [],
      quote_gap: s.quote_of != null && s.quote_of !== "" && Number.isInteger(s.quote_gap) ? s.quote_gap : null,
      tpl_id: s.tpl_id || null,
      day_rules: s.type === "daily" && s.day_rules && typeof s.day_rules === "object" ? s.day_rules : {},
    }));
    if (deleted.length > 0) {
      const { error: delErr } = await supabase.from("slots").delete().in("id", deleted);
      if (delErr) { showToast("配信計画の保存に失敗しました"); return; }
    }
    if (upserted.length > 0) {
      let { error: upsErr } = await supabase.from("slots").upsert(upserted);
      // 表にまだ配信計画の 3 列が無いとき（作業 68 の前）は、3 列を外して保存し直す。枠そのものは今までどおり残る
      if (upsErr && /genre|aim|quote_of|materials|quote_gap|tpl_id|day_rules|column/i.test(upsErr.message || "")) {
        ({ error: upsErr } = await supabase.from("slots").upsert(upserted.map(({ genre, aim, quote_of, materials, quote_gap, tpl_id, day_rules, ...rest }) => rest)));
        if (!upsErr) { showToast("枠は保存しました。ネタの表・狙い・引用元は準備中です（表の準備が済むと保存されます）"); return; }
      }
      if (upsErr) { showToast("配信計画の保存に失敗しました"); }
    }
  }, [activeAccId, uid, showToast]);

  return { slots, saveSlots };
}
