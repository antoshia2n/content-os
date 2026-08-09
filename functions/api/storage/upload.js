/**
 * /api/storage/upload — 添付ファイルの置き場の受け皿
 *
 * 判断（本人の確認・種類と大きさの確認・保存先の名づけ・鍵の付け替え）は
 * shia2n-core 側に集約してある。このファイルは「このアプリが置いてよい入れ物」を渡すだけ。
 *
 * 取り出し（表示）はここを通らない。置き場は公開のままで、画面は公開の住所で表示する。
 *
 * 正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
 *       2026-08-09 見直し「置き場は、公開キーでは書けない・消せない。読み取りは公開のまま」
 */

import { createStorageGateway } from "shia2n-core/server/storage-gateway.js";

export const onRequestPost = createStorageGateway({
  buckets: {
    // 本文に差し込む挿し絵。保存先は images/ の下に固定する。
    contentos: { prefix: "images/" },
  },
});
