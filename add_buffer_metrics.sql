-- ================================================
-- ContentOS：Buffer の反応の数字を入れる欄を足す（2026-08-09）
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する。
-- 何度流しても同じ結果になる（すでに足してある列は飛ばす）。
--
-- 人手の評価（score）はそのまま残し、機械的に付ける成績は auto_score に入れる。
-- 返信の数は replies にする。comments はすでに「人が書いたコメント」で使っているため。
-- ================================================

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS buffer_post_id     text,
  ADD COLUMN IF NOT EXISTS impressions        integer,
  ADD COLUMN IF NOT EXISTS reactions          integer,
  ADD COLUMN IF NOT EXISTS replies            integer,
  ADD COLUMN IF NOT EXISTS reposts            integer,
  ADD COLUMN IF NOT EXISTS clicks             integer,
  ADD COLUMN IF NOT EXISTS metrics_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS metrics_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_score         text;

CREATE INDEX IF NOT EXISTS posts_buffer_post_id_idx ON posts (buffer_post_id);
