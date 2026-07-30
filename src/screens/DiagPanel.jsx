// src/screens/DiagPanel.jsx
// 診断画面（要件 v1.2 §7・受け入れ基準9）
// 目的：不具合が出たときに Naoki が画面を探し回らなくて済むよう、
//       環境変数・Supabase接続を1画面で確認できるようにする。
// 開き方： /diag  または  ?diag=1

import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";

// shia2n-mcp の公開診断アドレス（認証不要・機密情報は返らない）
// MCP サーバーが生きているかを確認するために使う
const MCP_DIAG_URL = "https://shia2n-mcp.gameister1.workers.dev/diag";

const ENV_KEYS = [
  ["VITE_SUPABASE_URL", "Supabase のURL"],
  ["VITE_SUPABASE_ANON_KEY", "Supabase のキー"],
  ["VITE_FIREBASE_API_KEY", "Firebase のキー"],
  ["VITE_FIREBASE_AUTH_DOMAIN", "Firebase の認証ドメイン"],
  ["VITE_FIREBASE_PROJECT_ID", "Firebase のプロジェクト"],
  ["VITE_FIREBASE_APP_ID", "Firebase のアプリID"],
];

const mask = (v) => {
  if (!v) return "";
  if (v.length <= 12) return v.slice(0, 3) + "…";
  return v.slice(0, 8) + "…" + v.slice(-4);
};

function Light({ state }) {
  const map = {
    ok:      ["#059669", "#d1fae5", "#6ee7b7", "OK"],
    ng:      ["#dc2626", "#fee2e2", "#fca5a5", "NG"],
    pending: ["#a16207", "#fef3c7", "#fcd34d", "確認中"],
    skip:    ["#6b7280", "#f3f4f6", "#d1d5db", "未確認"],
  };
  const [color, bg, border, label] = map[state] || map.skip;
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color, background: bg, border: `1px solid ${border}`, borderRadius: 99, padding: "2px 10px", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function Row({ title, detail, state }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fff", border: "1px solid #e6dfd6", borderRadius: 10, marginBottom: 7 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{title}</div>
        {detail && (
          <div style={{ fontSize: 11, color: "#999", marginTop: 2, wordBreak: "break-all", fontFamily: "monospace" }}>{detail}</div>
        )}
      </div>
      <Light state={state} />
    </div>
  );
}

export function DiagPanel() {
  const [checks, setChecks] = useState({
    accounts: { state: "pending", detail: "確認中…" },
    posts:    { state: "pending", detail: "確認中…" },
    write:    { state: "pending", detail: "確認中…" },
    mcp:      { state: "pending", detail: "確認中…" },
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      // Supabase 読み取り：accounts
      try {
        const { data, error } = await supabase.from("accounts").select("id,name,is_default,is_active").order("sort_order");
        if (!alive) return;
        if (error) throw error;
        setChecks(c => ({ ...c, accounts: {
          state: "ok",
          detail: `${data.length}件：${data.map(a => a.name + (a.is_default ? "（既定）" : "")).join(" / ")}`,
        }}));
      } catch (e) {
        if (alive) setChecks(c => ({ ...c, accounts: { state: "ng", detail: String(e.message || e) } }));
      }

      // Supabase 読み取り：posts の件数と状態
      try {
        const { data, error } = await supabase.from("posts").select("status,source,datetime");
        if (!alive) return;
        if (error) throw error;
        const byStatus = {};
        const bySource = {};
        let undated = 0;
        data.forEach(p => {
          byStatus[p.status] = (byStatus[p.status] || 0) + 1;
          bySource[p.source || "(空)"] = (bySource[p.source || "(空)"] || 0) + 1;
          if (!p.datetime) undated += 1;
        });
        setChecks(c => ({ ...c, posts: {
          state: "ok",
          detail: `全${data.length}件／状態: ${Object.entries(byStatus).map(([k, v]) => k + "=" + v).join(" ")}／登録元: ${Object.entries(bySource).map(([k, v]) => k + "=" + v).join(" ")}／日時未定=${undated}`,
        }}));
      } catch (e) {
        if (alive) setChecks(c => ({ ...c, posts: { state: "ng", detail: String(e.message || e) } }));
      }

      // 書き込み権限：実際には書き込まず、書き込み可否だけを空更新で確認する
      try {
        const { error } = await supabase.from("accounts").update({}).eq("id", "__diag_not_exist__");
        if (!alive) return;
        if (error) throw error;
        setChecks(c => ({ ...c, write: { state: "ok", detail: "書き込みは許可されています（データは変更していません）" } }));
      } catch (e) {
        if (alive) setChecks(c => ({ ...c, write: { state: "ng", detail: String(e.message || e) } }));
      }

      // MCP サーバーの疎通（shia2n-mcp の公開診断アドレス）
      try {
        const res = await fetch(MCP_DIAG_URL, { method: "GET" });
        if (!alive) return;
        if (!res.ok) throw new Error(`応答 ${res.status}`);
        const info = await res.json();
        setChecks(c => ({ ...c, mcp: {
          state: "ok",
          detail: `応答あり（版 ${info?.version ?? "不明"}）／${MCP_DIAG_URL}`,
        }}));
      } catch (e) {
        if (alive) setChecks(c => ({ ...c, mcp: {
          state: "ng",
          detail: `${String(e.message || e)}／${MCP_DIAG_URL}`,
        }}));
      }
    })();
    return () => { alive = false; };
  }, []);

  const envRows = ENV_KEYS.map(([key, label]) => {
    const v = import.meta.env[key];
    return { title: label, detail: `${key} = ${v ? mask(v) : "（未設定）"}`, state: v ? "ok" : "ng" };
  });

  const allOk = envRows.every(r => r.state === "ok")
    && Object.values(checks).every(c => c.state === "ok");

  return (
    <div style={{ minHeight: "100vh", background: "#faf8f5", padding: "28px 20px", fontFamily: "system-ui, -apple-system, 'Hiragino Sans', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.6px" }}>
            Content<span style={{ color: "#f59e0b" }}>OS</span> 診断
          </span>
          <Light state={allOk ? "ok" : "pending"} />
        </div>
        <div style={{ fontSize: 12, color: "#999", marginBottom: 20 }}>
          すべて OK なら、アプリの土台（設定値とデータベース）に問題はありません。
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#aaa", letterSpacing: 0.5, marginBottom: 8 }}>設定値（環境変数）</div>
        {envRows.map(r => <Row key={r.detail} {...r} />)}

        <div style={{ fontSize: 11, fontWeight: 800, color: "#aaa", letterSpacing: 0.5, margin: "18px 0 8px" }}>データベース（Supabase）</div>
        <Row title="アカウントの読み取り" detail={checks.accounts.detail} state={checks.accounts.state} />
        <Row title="投稿の読み取り"       detail={checks.posts.detail}    state={checks.posts.state} />
        <Row title="書き込みの権限"       detail={checks.write.detail}    state={checks.write.state} />

        <div style={{ fontSize: 11, fontWeight: 800, color: "#aaa", letterSpacing: 0.5, margin: "18px 0 8px" }}>Claude との接続（MCP）</div>
        <Row title="MCP サーバーの疎通" detail={checks.mcp.detail} state={checks.mcp.state} />

        <div style={{ marginTop: 22, display: "flex", gap: 8 }}>
          <button onClick={() => window.location.reload()}
            style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            もう一度確認する
          </button>
          <button onClick={() => { window.location.href = window.location.origin + "/"; }}
            style={{ background: "#fff", color: "#555", border: "1px solid #e6dfd6", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            アプリに戻る
          </button>
        </div>
      </div>
    </div>
  );
}
