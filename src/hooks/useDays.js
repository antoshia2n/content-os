// src/hooks/useDays.js
// 2026-10-23 4便：1 日 1 行の記録（cos_days）を読み書きする。
// 書いた字数は保存のたびに足し、少し待ってからまとめて書く（保存のたびに表へ書かないため）。
// 表がまだ無いとき（作業 31 の前）は、画面は動き、記録だけが残らない（ready=false）。
import { useState, useEffect, useRef, useCallback } from "react";
import { dbFetchDays, dbUpsertDay } from "../lib/supabase.js";
import { fmtDate } from "../constants.js";

export const DEFAULT_GOAL = 3000;
const empty = day => ({ day, chars: 0, saves: 0, goal: null, plan: [], note: "", extra: {} });

export function useDays(uid) {
  const today = fmtDate(new Date());
  const [days, setDays] = useState({});          // { "YYYY-MM-DD": row }
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const pend = useRef({});                        // まだ書いていない日
  const timer = useRef(null);
  const daysRef = useRef(days); daysRef.current = days;

  useEffect(() => {
    if (!uid) return;
    const from = new Date(); from.setDate(from.getDate() - 70);
    dbFetchDays(uid, fmtDate(from))
      .then(rows => { const m = {}; rows.forEach(r => { m[r.day] = { ...empty(r.day), ...r, plan: r.plan || [], extra: r.extra || {}, note: r.note || "" }; }); setDays(m); setReady(true); })
      .catch(e => { setErr(e.message || String(e)); console.warn("[ContentOS cos_days]", e?.message || e); });
  }, [uid]);

  const flush = useCallback(async () => {
    timer.current = null;
    const list = Object.keys(pend.current); pend.current = {};
    for (const d of list) {
      const r = daysRef.current[d]; if (!r) continue;
      try { await dbUpsertDay(uid, { day: r.day, chars: r.chars, saves: r.saves, goal: r.goal, plan: r.plan, note: r.note, extra: r.extra }); }
      catch (e) { setErr(e.message || String(e)); }
    }
  }, [uid]);
  const touch = useCallback((d, fn, wait = 1500) => {
    setDays(prev => { const cur = prev[d] || empty(d); return { ...prev, [d]: fn(cur) }; });
    if (!ready) return;
    pend.current[d] = true;
    clearTimeout(timer.current); timer.current = setTimeout(flush, wait);
  }, [ready, flush]);
  // 閉じる前に残りを書く
  useEffect(() => { const h = () => { if (Object.keys(pend.current).length) flush(); }; window.addEventListener("pagehide", h); return () => window.removeEventListener("pagehide", h); }, [flush]);

  const addChars = useCallback(n => touch(fmtDate(new Date()), r => ({ ...r, chars: (r.chars || 0) + n, saves: (r.saves || 0) + 1 })), [touch]);
  const saveDay = useCallback((d, fields) => touch(d, r => ({ ...r, ...fields }), 400), [touch]);
  const todayRow = days[today] || empty(today);
  return { days, today, todayRow, ready, err, addChars, saveDay };
}
