import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 2026-11-08 大きな部品を別のファイルに分け、直していない部品は前に読んだものを使えるようにする
  build: { rollupOptions: { output: { manualChunks(id) {
    if (!id.includes("node_modules")) return;
    if (id.includes("@firebase") || id.includes("/firebase/")) return "firebase";
    if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "react";
  } } } },
});
