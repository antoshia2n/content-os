// X での見え方（2026-11-10 Naoki「プレビューとか見れると最高」）。予約の前と、予約のカードで使う
// parts＝[{ text, images }]（古い形の文字だけの並びも受ける）。quote＝引用元の投稿（あれば下に埋め込みで出す）
import React from "react";
import { xLen } from "../lib/xtext.js";
import { stripHtml } from "../constants.js";

const Avatar = () => <div aria-hidden="true" style={{ width: 34, height: 34, borderRadius: "50%", background: "#1d4ed8", color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>シ</div>;

function Images({ urls }) {
  if (!urls?.length) return null;
  const n = urls.length;
  return <div style={{ display: "grid", gridTemplateColumns: n === 1 ? "1fr" : "1fr 1fr", gap: 2, borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb", marginTop: 6 }}>
    {urls.map((u, i) => <img key={i} src={u} alt={`画像 ${i + 1}`} style={{ width: "100%", height: n === 1 ? "auto" : 90, maxHeight: 200, objectFit: "cover", display: "block", gridRow: n === 3 && i === 0 ? "span 2" : undefined }} />)}
  </div>;
}

export function XPreview({ parts, quote }) {
  const ps = (parts || []).map(p => (typeof p === "string" ? { text: p, images: [] } : { text: p?.text || "", images: p?.images || [] }));
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 10px 4px" }}>
      {ps.map((p, i) => {
        const len = xLen(p.text), over = len > 280, last = i === ps.length - 1;
        return <div key={i} style={{ display: "flex", gap: 9, position: "relative", paddingBottom: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Avatar />
            {!last && <div style={{ width: 2, flex: 1, background: "#e5e7eb", marginTop: 4 }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, display: "flex", gap: 5, alignItems: "baseline" }}>
              <b style={{ color: "#0f1419" }}>シアニン</b><span style={{ color: "#536471", fontSize: 12 }}>@antoshia2n</span>
              <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: over ? "#b91c1c" : "#6b6259" }}>{ps.length > 1 ? `${i + 1}/${ps.length}・` : ""}{len}/280</span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#0f1419", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.text}</div>
            <Images urls={p.images} />
            {i === 0 && quote && <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "8px 10px", marginTop: 6 }}>
              <div style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center" }}><span style={{ width: 16, height: 16, borderRadius: "50%", background: "#1d4ed8", display: "inline-block" }} /><b style={{ color: "#0f1419" }}>シアニン</b><span style={{ color: "#536471" }}>@antoshia2n · {quote.datetime ? quote.datetime.slice(5, 10).replace("-", "/") : ""}</span></div>
              <div style={{ fontSize: 12.5, color: "#0f1419", lineHeight: 1.55, marginTop: 3, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{stripHtml(quote.body || "").trim() || quote.title || "（本文なし）"}</div>
              {!quote.x_url && <div style={{ fontSize: 12, color: "#0369a1", marginTop: 4 }}>引用元はまだ X に出ていません（出たら入ります）</div>}
            </div>}
          </div>
        </div>;
      })}
    </div>
  );
}
