import { useEffect, useRef } from "react";

// 2026-11-01 決まり「窓」：どの窓も、開いたら中へフォーカス・Tab は中で回る・Esc で閉じる・閉じたら開く前の場所へ戻す。
// 使い方：窓の白い箱に ref を付けて useDialogFocus(ref, { onClose, canClose, initialFocus })。
//   onClose      Esc で呼ぶ（✕ / 閉じる と同じもの）。渡さなければ Esc は窓の側に任せる
//   canClose     false の間は Esc で閉じない（送信中など）
//   initialFocus true：autoFocus / data-autofocus → 最初の入力欄 → 最初の押せるもの → 箱そのもの
//                false：窓が自分でフォーカスを決める
//                関数：(箱) => 要素。null を返せば true と同じ順で探す
// 窓が重なったときは、いちばん上の窓だけが Tab と Esc を受ける。
// 見た目は変えない（箱に tabindex=-1 を足すときは、フォーカスの枠も出さない）。

const stack = []; // 開いている窓（後ろほど上）

const FOCUSABLE = [
  "a[href]", "area[href]", "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])", "select:not([disabled])", "textarea:not([disabled])",
  "iframe", "[tabindex]", "[contenteditable='']", "[contenteditable='true']",
].join(",");
const FIELD = "input:not([disabled]):not([type=hidden]):not([type=file]),select:not([disabled]),textarea:not([disabled])";

const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
const usable = el => visible(el) && !el.closest("[inert]");

export function focusablesIn(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(el => el.tabIndex >= 0 && usable(el));
}

function pickInitial(root) {
  const marked = root.querySelector("[data-autofocus]");
  if (marked && usable(marked)) return marked;
  const field = [...root.querySelectorAll(FIELD)].find(usable);
  if (field) return field;
  return focusablesIn(root)[0] || root;
}

function ensureContainerFocusable(el) {
  if (el.hasAttribute("tabindex")) return;
  el.setAttribute("tabindex", "-1");
  if (!el.style.outline) el.style.outline = "none";
}

export function useDialogFocus(ref, { onClose, canClose = true, initialFocus = true } = {}) {
  const opts = useRef();
  opts.current = { onClose, canClose };
  const initialRef = useRef(initialFocus);
  initialRef.current = initialFocus;

  // 開く前にフォーカスがあった場所は、描画の時点で覚える（autoFocus が先に動いても上書きされないため）。
  // 開いた元が別の窓の中なら、その窓の戻り先も控えにする（元の窓が同時に閉じたとき用）
  const back = useRef(null);
  if (back.current === null && typeof document !== "undefined") {
    const a = document.activeElement;
    const owner = a && [...stack].reverse().find(e => e.el?.contains(a));
    back.current = [a, ...(owner ? owner.back : [])].filter(x => x && x !== document.body);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entry = { el, back: back.current };
    stack.push(entry);
    ensureContainerFocusable(el);

    const init = initialRef.current;
    if (init !== false && !el.contains(document.activeElement)) {
      const target = (typeof init === "function" && init(el)) || pickInitial(el);
      target.focus({ preventScroll: target === el });
    }

    const isTop = () => stack[stack.length - 1] === entry;
    const onKey = e => {
      if (!isTop() || e.defaultPrevented) return;
      if (e.key === "Escape") {
        if (e.isComposing || e.keyCode === 229) return; // 変換中の Esc は変換の取り消し
        const { onClose: close, canClose: can } = opts.current;
        if (!close || !can) return;
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
      const list = focusablesIn(el);
      if (!list.length) { e.preventDefault(); el.focus(); return; }
      const first = list[0], last = list[list.length - 1], cur = document.activeElement;
      const inside = el.contains(cur);
      if (e.shiftKey && (!inside || cur === first || cur === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || cur === last)) { e.preventDefault(); first.focus(); }
    };
    // document で聞く：画面全体の Esc（window で聞いている）より先に動き、preventDefault で知らせるため
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      const a = document.activeElement;
      // 閉じる処理が自分でフォーカスを外へ移したとき（本文へ差し込んだ後など）はそのまま
      if (a && a !== document.body && a.isConnected && !el.contains(a)) return;
      const top = stack[stack.length - 1];
      const to = entry.back.find(x => x.isConnected && (!top || top.el.contains(x)));
      if (to) to.focus({ preventScroll: true });
      else if (top?.el.isConnected) top.el.focus({ preventScroll: true });
    };
  }, []);
}

// App.jsx の中に直に書いた窓用：<DialogFocus onClose={...}>{ref => <div ref={ref} ...>}</DialogFocus>
export function DialogFocus({ children, ...opts }) {
  const ref = useRef(null);
  useDialogFocus(ref, opts);
  return children(ref);
}
