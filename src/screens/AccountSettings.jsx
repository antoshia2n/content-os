import React, { useState, useEffect } from "react";
import { POST_TYPE, COLORS, BD, BD2, S } from "../constants.js";
import { Btn } from "../components/shared.jsx";

const INP = { ...S.inp, padding: "6px 10px", width: "100%", boxSizing: "border-box" };

// 新規登録時の初期媒体の選択肢（要件 v1.1 §4.1 default_platform・任意）
// 表示や絞り込みには使わない。媒体そのものは投稿ごと（posts.platform）に持つ
const DEFAULT_PLATFORMS = [["", "未設定"], ["x", "X"], ["note", "note"]];

const hexToRgba = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

/* ── 投稿タイプ管理セクション ── */
function PostTypeManager({ activeAcc, onUpdate }) {
  const [customTypes, setCustomTypes] = useState(activeAcc?.custom_post_types || []);
  const [newLabel, setNewLabel] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editLabel, setEditLabel] = useState("");

  useEffect(() => {
    setCustomTypes(activeAcc?.custom_post_types || []);
  }, [activeAcc?.id]);

  const save = (next) => {
    setCustomTypes(next);
    onUpdate(activeAcc.id, { custom_post_types: next });
  };

  const addType = () => {
    const label = newLabel.trim();
    if (!label) return;
    const key = "custom_" + label.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
    const color = COLORS[customTypes.length % COLORS.length];
    const newType = { key, label, color, bg: hexToRgba(color, 0.1), border: hexToRgba(color, 0.35) };
    save([...customTypes, newType]);
    setNewLabel("");
  };

  const deleteType = (key) => save(customTypes.filter(t => t.key !== key));

  const startEdit = (t) => { setEditingKey(t.key); setEditLabel(t.label); };
  const commitEdit = (key) => {
    const label = editLabel.trim();
    if (!label) return;
    save(customTypes.map(t => t.key === key ? { ...t, label } : t));
    setEditingKey(null);
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa", letterSpacing: 0.5, marginBottom: 8 }}>
        固定タイプ（変更不可）
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
        {Object.entries(POST_TYPE).map(([k, v]) => (
          <div key={k} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: v.bg, border: `1px solid ${v.border}`,
            borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: v.color,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: v.dot, display: "inline-block" }} />
            {v.label}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa", letterSpacing: 0.5, marginBottom: 8 }}>
        カスタムタイプ（追加・編集・削除可）
      </div>
      {customTypes.length === 0 && (
        <div style={{ fontSize: 12, color: "#ccc", textAlign: "center", padding: "12px 0", marginBottom: 10 }}>
          まだカスタムタイプがありません
        </div>
      )}
      {customTypes.map(t => (
        <div key={t.key} style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#f5f0eb", border: BD2, borderRadius: 9,
          padding: "8px 12px", marginBottom: 6,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
          {editingKey === t.key ? (
            <>
              <input
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commitEdit(t.key); if (e.key === "Escape") setEditingKey(null); }}
                style={{ ...INP, flex: 1, padding: "3px 7px", fontSize: 12 }}
                autoFocus
              />
              <Btn primary onClick={() => commitEdit(t.key)} style={{ padding: "3px 10px", fontSize: 11 }}>保存</Btn>
              <Btn onClick={() => setEditingKey(null)} style={{ padding: "3px 8px", fontSize: 11 }}>×</Btn>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#333" }}>{t.label}</span>
              <Btn onClick={() => startEdit(t)} style={{ padding: "3px 10px", fontSize: 11 }}>編集</Btn>
              <Btn danger onClick={() => deleteType(t.key)} style={{ padding: "3px 10px", fontSize: 11 }}>削除</Btn>
            </>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addType(); }}
          placeholder="例: Substack、YouTube、Bluesky…"
          style={{ ...INP, flex: 1 }}
        />
        <button
          onClick={addType}
          disabled={!newLabel.trim()}
          style={{
            background: newLabel.trim() ? "#f59e0b" : "#e0d8ce",
            color: "#fff", border: "none", borderRadius: 8,
            padding: "6px 14px", fontSize: 12, fontWeight: 700,
            cursor: newLabel.trim() ? "pointer" : "default", whiteSpace: "nowrap",
          }}
        >
          追加
        </button>
      </div>
    </div>
  );
}

/* ── 小さな見出しラベル ── */
function FieldLabel({ children }) {
  return (
    <label style={{ fontSize: 11, color: "#999", fontWeight: 700, display: "block", marginBottom: 4 }}>
      {children}
    </label>
  );
}

/* ── バッジ ── */
function Badge({ color, bg, border, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: bg,
      border: `1px solid ${border}`, borderRadius: 99, padding: "2px 7px", whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

/* ── メインコンポーネント ── */
export function AccountSettings({
  accounts, activeAcc,
  onUpdate, onAdd, onCopyLink, onClose,
  onSetDefault, onSetActive, onMove,
}) {
  const [tab, setTab] = useState("clients");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});

  function startEdit(acc) {
    setEditingId(acc.id);
    setDraft({
      name: acc.name,
      handle: acc.handle,
      color: acc.color,
      default_platform: acc.default_platform || "",
    });
  }
  function commitEdit() {
    // 「未設定」を選んだときは空欄として保存する
    const payload = { ...draft, default_platform: draft.default_platform || null };
    onUpdate(editingId, payload);
    setEditingId(null);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", border: BD2, borderRadius: 17, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px #00000025" }}>

        <div style={{ padding: "15px 20px", borderBottom: BD2, background: "#f5f0eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>
              {tab === "clients" ? "クライアント管理" : "投稿タイプ管理"}
            </div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
              {tab === "clients" ? "名前・カラー・並び順・既定を設定できます" : "媒体・コンテンツ種別を追加・編集・削除できます"}
            </div>
          </div>
          <Btn onClick={onClose}>閉じる</Btn>
        </div>

        <div style={{ display: "flex", borderBottom: BD2, background: "#faf8f5" }}>
          {[["clients", "クライアント"], ["types", "投稿タイプ"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex: 1, padding: "10px 0", fontSize: 12, fontWeight: tab === id ? 700 : 400,
                color: tab === id ? "#f59e0b" : "#aaa",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: tab === id ? "2px solid #f59e0b" : "2px solid transparent",
                transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {tab === "clients" && (
            <>
              {accounts.map((acc, idx) => (
                <div key={acc.id} style={{
                  background: acc.is_active === false ? "#f0ece7" : "#f5f0eb",
                  border: BD2, borderRadius: 12, padding: "14px 16px", marginBottom: 10,
                  opacity: acc.is_active === false ? 0.72 : 1,
                }}>
                  {editingId === acc.id ? (
                    <div style={{ ...S.col, gap: 10 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <FieldLabel>クライアント名</FieldLabel>
                          <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={INP} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <FieldLabel>ハンドル</FieldLabel>
                          <input value={draft.handle} onChange={e => setDraft(d => ({ ...d, handle: e.target.value }))} style={INP} placeholder="@handle" />
                        </div>
                      </div>
                      <div>
                        <FieldLabel>新規登録するときの初期媒体</FieldLabel>
                        <div style={{ display: "flex", gap: 6 }}>
                          {DEFAULT_PLATFORMS.map(([value, label]) => (
                            <button key={value || "none"} onClick={() => setDraft(d => ({ ...d, default_platform: value }))}
                              style={{
                                padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                border: (draft.default_platform || "") === value ? "2px solid #f59e0b" : BD,
                                background: (draft.default_platform || "") === value ? "#fff7ed" : "#fff",
                                color: (draft.default_platform || "") === value ? "#b45309" : "#888",
                              }}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 5, lineHeight: 1.6 }}>
                          新しく投稿を作るときに最初から選ばれている媒体です。一覧の絞り込みには使いません。
                        </div>
                      </div>
                      <div>
                        <FieldLabel>カラー</FieldLabel>
                        <div style={{ display: "flex", gap: 6 }}>
                          {COLORS.map(c => (
                            <button key={c} onClick={() => setDraft(d => ({ ...d, color: c }))}
                              style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: draft.color === c ? "3px solid #1a1a1a" : "3px solid transparent", cursor: "pointer" }} />
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 7 }}>
                        <Btn primary onClick={commitEdit} style={{ flex: 1 }}>保存</Btn>
                        <Btn onClick={() => setEditingId(null)}>キャンセル</Btn>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ ...S.row, gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: acc.color, display: "inline-block" }} />
                        <span style={{ fontWeight: 800, fontSize: 14 }}>{acc.name}</span>
                        <span style={{ fontSize: 12, color: "#bbb" }}>{acc.handle}</span>
                        {acc.is_default && (
                          <Badge color="#b45309" bg="#fef3c7" border="#fcd34d">既定</Badge>
                        )}
                        {acc.is_active === false && (
                          <Badge color="#6b7280" bg="#f3f4f6" border="#d1d5db">無効</Badge>
                        )}
                      </div>

                      <div style={{ background: "#fff", border: BD2, borderRadius: 7, padding: "6px 10px", fontSize: 11, color: "#bbb", fontFamily: "monospace", marginBottom: 10, wordBreak: "break-all" }}>
                        {typeof window !== "undefined" ? window.location.href.split("?")[0] : "https://your-app.pages.dev/"}?account={acc.id}
                      </div>

                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <Btn onClick={() => startEdit(acc)} style={{ flex: 1 }}>編集</Btn>
                        <button onClick={() => onCopyLink(acc.id)} style={{ flex: 1, background: "#f59e0b", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>リンクをコピー</button>
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {[["up", "↑", idx === 0], ["down", "↓", idx === accounts.length - 1]].map(([dir, mark, atEnd]) => (
                          <button key={dir} onClick={() => onMove(acc.id, dir)} disabled={atEnd}
                            style={{
                              border: "1px solid #e6dfd6", borderRadius: 8, background: "#fff",
                              padding: "5px 10px", fontSize: 12, fontWeight: 600, color: "#555",
                              cursor: atEnd ? "default" : "pointer", opacity: atEnd ? 0.35 : 1,
                              fontFamily: "inherit",
                            }}>
                            {mark}
                          </button>
                        ))}

                        {!acc.is_default && (
                          <Btn onClick={() => onSetDefault(acc.id)} style={{ padding: "5px 10px", fontSize: 11.5 }}>
                            既定にする
                          </Btn>
                        )}

                        <div style={{ flex: 1 }} />

                        {acc.is_active === false ? (
                          <Btn primary onClick={() => onSetActive(acc.id, true)} style={{ padding: "5px 12px", fontSize: 11.5 }}>
                            有効に戻す
                          </Btn>
                        ) : (
                          <Btn onClick={() => onSetActive(acc.id, false)} style={{ padding: "5px 12px", fontSize: 11.5 }}>
                            無効にする
                          </Btn>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <button onClick={onAdd}
                style={{ width: "100%", background: "#fff", border: "2px dashed #e0d8ce", borderRadius: 10, padding: "11px", color: "#bbb", cursor: "pointer", fontSize: 13, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.color = "#f59e0b"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0d8ce"; e.currentTarget.style.color = "#bbb"; }}>
                + クライアントを追加
              </button>

              <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.7, marginTop: 12, background: "#faf8f5", border: BD2, borderRadius: 9, padding: "10px 12px" }}>
                アカウントは削除できません。使わなくなったものは「無効にする」を押してください。
                過去の投稿はそのまま残り、切替の並びからだけ消えます。
              </div>
            </>
          )}

          {tab === "types" && (
            activeAcc
              ? <PostTypeManager activeAcc={activeAcc} onUpdate={onUpdate} />
              : <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", paddingTop: 24 }}>アカウントを選択してください</div>
          )}
        </div>
      </div>
    </div>
  );
}
