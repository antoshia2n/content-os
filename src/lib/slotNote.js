// 2026-11-21 開発部（Naoki「カレンダーの予約枠にも決め事か、メモを表示して」・作る前の 1 枚に OK 12:14）
// カレンダーの空いている予約枠（点線の枠）に出す一言を作る。中身は配信計画の枠の「メモ」（aim）と決め事（柱・型・資料）。
// 毎日の枠は、呼ぶ側が曜日ごとの上書きを当てた枠（materials.js の effSlot）を渡す。
// 返すもの：memo（枠に出すメモ）／rules（メモが無いときに出す「柱 ○○・型 ○○・資料 n」）／tip（マウスを乗せたときの小窓の全文）

export function slotNote(s, templates = []) {
  if (!s) return { memo: "", rules: "", tip: "" };
  const memo = String(s.aim || "").trim();
  const tpl = s.tpl_id ? String((templates || []).find(t => t && t.id === s.tpl_id)?.name || "") : "";
  const n = Array.isArray(s.materials) ? s.materials.length : 0;
  const rules = [s.genre ? `柱 ${s.genre}` : "", tpl ? `型 ${tpl}` : "", n ? `資料 ${n}` : ""].filter(Boolean).join("・");
  const tip = [memo ? `メモ：${memo}` : "", rules].filter(Boolean).join("\n");
  return { memo, rules, tip };
}

// 曜日（1=月〜7=日）。YYYY-MM-DD から
export function dowOfDate(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + "T00:00").getDay();
  return d === 0 ? 7 : d;
}
