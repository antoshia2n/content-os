// src/hooks/useDays.js
// 2026-10-23 4便：1 日 1 行の記録（cos_days）を読み書きする。
// 書いた字数は保存のたびに足し、少し待ってからまとめて書く（保存のたびに表へ書かないため）。
// 表がまだ無いとき（作業 31 の前）は、画面は動き、記録だけが残らない（ready=false）。
// 2026-10-23 5便：サイドパネルと広い画面を同時に開いても字数が消えないよう、
//   字数は「この画面で増えた分」だけを持ち、書く直前に表の今の値を読んで足す。
//   計画・ひとことなどは、変えた欄だけを書く（ほかの画面の変更を古い値で上書きしないため）。
import { useState, useEffect, useRef, useCallback } from "react";
import { dbFetchDays, dbFetchDay, dbUpsertDay } from "../lib/supabase.js";
import { fmtDate } from "../constants.js";

export const DEFAULT_GOAL = 3000;
const empty = day => ({ day, chars: 0, saves: 0, goal: null, plan: [], note: "", extra: {} });

export function useDays(uid) {
  const today = fmtDate(new Date());
  const [days, setDays] = useState({});          // { "YYYY-MM-DD": row }
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const pend = useRef({});                        // { day: { chars, saves, fields: {...} } } まだ書いていない分
  const timer = useRef(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!uid) return;
    const from = new Date(); from.setDate(from.getDate() - 70);
    dbFetchDays(uid, fmtDate(from))
      .then(rows => {
        const m = {}; rows.forEach(r => { m[r.day] = { ...empty(r.day), ...r, plan: r.plan || [], extra: r.extra || {}, note: r.note || "" }; });
        // 読み込む前に足した分（保存がすでにあったとき）を消さずに重ねる
        setDays(prev => { const next = { ...m }; for (const [d, r] of Object.entries(prev)) { const p = pend.current[d]; if (!p) continue; const b = next[d] || empty(d); next[d] = { ...b, ...p.fields, chars: (b.chars || 0) + (p.chars || 0), saves: (b.saves || 0) + (p.saves || 0) }; } return next; });
        readyRef.current = true; setReady(true);
        if (Object.keys(pend.current).length) { clearTimeout(timer.current); timer.current = setTimeout(() => flushRef.current(), 300); }
      })
      .catch(e => { setErr(e.message || String(e)); console.warn("[ContentOS cos_days]", e?.message || e); });
  }, [uid]);

  const flush = useCallback(async () => {
    timer.current = null;
    if (!readyRef.current) return;
    const list = Object.entries(pend.current); pend.current = {};
    for (const [d, p] of list) {
      try {
        const row = { day: d, ...p.fields };
        if (p.chars || p.saves) {
          const cur = await dbFetchDay(uid, d);           // ほかの画面が書いた分を含む今の値
          row.chars = (cur?.chars || 0) + (p.chars || 0);
          row.saves = (cur?.saves || 0) + (p.saves || 0);
          setDays(prev => ({ ...prev, [d]: { ...(prev[d] || empty(d)), chars: row.chars, saves: row.saves } }));
        }
        await dbUpsertDay(uid, row);
      } catch (e) {
        setErr(e.message || String(e));
        // 書けなかった分は戻して次の機会に
        const back = pend.current[d] || { chars: 0, saves: 0, fields: {} };
        pend.current[d] = { chars: back.chars + (p.chars || 0), saves: back.saves + (p.saves || 0), fields: { ...p.fields, ...back.fields } };
      }
    }
  }, [uid]);
  // 2026-11-01 送っている途中の分も待てるよう、走っている書き込みを控える（ログアウトの前に使う）
  const running = useRef(null);
  const flushRef = useRef(flush); flushRef.current = () => (running.current = flush());
  // 2026-11-01 ログアウトの前に残りをすぐ書く。書けずに残れば false（表がまだ無いときは書けないので止めない）
  const flushNow = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null;
    await running.current;
    if (!readyRef.current) return true;
    await flushRef.current();
    return Object.keys(pend.current).length === 0;
  }, []);
  const queue = useCallback((d, add, wait) => {
    const p = pend.current[d] || { chars: 0, saves: 0, fields: {} };
    pend.current[d] = { chars: p.chars + (add.chars || 0), saves: p.saves + (add.saves || 0), fields: { ...p.fields, ...(add.fields || {}) } };
    if (!readyRef.current) return;
    clearTimeout(timer.current); timer.current = setTimeout(() => flushRef.current(), wait);
  }, []);
  // 閉じる前に残りを書く
  useEffect(() => { const h = () => { if (Object.keys(pend.current).length) flushRef.current(); }; window.addEventListener("pagehide", h); return () => window.removeEventListener("pagehide", h); }, []);

  const addChars = useCallback(n => {
    const d = fmtDate(new Date());
    setDays(prev => { const cur = prev[d] || empty(d); return { ...prev, [d]: { ...cur, chars: (cur.chars || 0) + n, saves: (cur.saves || 0) + 1 } }; });
    queue(d, { chars: n, saves: 1 }, 1500);
  }, [queue]);
  const saveDay = useCallback((d, fields) => {
    setDays(prev => ({ ...prev, [d]: { ...(prev[d] || empty(d)), ...fields } }));
    queue(d, { fields }, 400);
  }, [queue]);
  const todayRow = days[today] || empty(today);
  return { days, today, todayRow, ready, err, addChars, saveDay, flushNow };
}
