/**
 * /api/db/* — データの出入り口の受け皿
 *
 * 判断（本人の確認・絞り込み・鍵の付け替え）は shia2n-core 側に集約してある。
 * このファイルは「このアプリが触ってよい表」を渡すだけ。
 *
 * 正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
 */

import { createDbGateway } from "shia2n-core/server/db-gateway.js";

export const onRequest = createDbGateway({
  basePath: "/api/db",
  tables: {
    posts:                 { owner: "user_id" },
    accounts:              { owner: "user_id" },
    slots:                 { owner: "user_id" },
    notification_settings: { owner: "user_id" },
  },
  functions: [],
});
