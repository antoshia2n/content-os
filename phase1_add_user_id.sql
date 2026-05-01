-- ================================================
-- ContentOS Phase 1：user_id 追加
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行
-- Firebase UID: VrMwzeSceqWeXVQOrm8kpu4uVR33
-- ================================================

-- 1. accounts に user_id カラムを追加
ALTER TABLE accounts ADD COLUMN user_id text;

-- 2. 既存の全 accounts に Naoki の UID を設定
UPDATE accounts SET user_id = 'VrMwzeSceqWeXVQOrm8kpu4uVR33' WHERE user_id IS NULL;

-- 3. user_id を必須化
ALTER TABLE accounts ALTER COLUMN user_id SET NOT NULL;

-- 4. posts に user_id カラムを追加
ALTER TABLE posts ADD COLUMN user_id text;

-- 5. 既存の全 posts に Naoki の UID を設定
UPDATE posts SET user_id = 'VrMwzeSceqWeXVQOrm8kpu4uVR33' WHERE user_id IS NULL;

-- 6. user_id を必須化
ALTER TABLE posts ALTER COLUMN user_id SET NOT NULL;

-- 7. 旧 RLS ポリシー（全員オープン）を削除
DROP POLICY IF EXISTS "anyone can read accounts"   ON accounts;
DROP POLICY IF EXISTS "anyone can insert accounts" ON accounts;
DROP POLICY IF EXISTS "anyone can update accounts" ON accounts;
DROP POLICY IF EXISTS "anyone can delete accounts" ON accounts;
DROP POLICY IF EXISTS "anyone can read posts"      ON posts;
DROP POLICY IF EXISTS "anyone can insert posts"    ON posts;
DROP POLICY IF EXISTS "anyone can update posts"    ON posts;
DROP POLICY IF EXISTS "anyone can delete posts"    ON posts;

-- 8. 新 RLS ポリシー設定（暫定：anon キー全許可、Firebase JWT 連携は将来フェーズ）
CREATE POLICY "user_isolation_accounts" ON accounts USING (true) WITH CHECK (true);
CREATE POLICY "user_isolation_posts"    ON posts    USING (true) WITH CHECK (true);

-- 9. インデックス追加（パフォーマンス）
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS posts_user_id_idx    ON posts(user_id);

-- 確認クエリ（実行後にこれで件数を確認）
SELECT 'accounts' AS tbl, count(*) FROM accounts WHERE user_id = 'VrMwzeSceqWeXVQOrm8kpu4uVR33'
UNION ALL
SELECT 'posts',           count(*) FROM posts    WHERE user_id = 'VrMwzeSceqWeXVQOrm8kpu4uVR33';
