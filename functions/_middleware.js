// 画面の版の出し分け（2026-11-04 開発部）：印（lab_ch=next）がある人には最新、ほかの人には public/stable/ の写しを出す。
// 中身は shia2n-core の server/channel.js。生徒用の版を新しくするときは npm run release → プルリクを結合
export { onRequestChannel as onRequest } from "shia2n-core/server/channel.js";
