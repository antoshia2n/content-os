# ContentOS セットアップ手順

## 必要なもの
- GitHubアカウント
- Supabaseアカウント（無料）→ https://supabase.com
- Vercelアカウント（無料）→ https://vercel.com

---

## Step 1: Supabase セットアップ（5分）

1. https://supabase.com でプロジェクト作成
   - Project name: `content-os`
   - Database Password: 任意のパスワード（保存しておく）
   - Region: `Northeast Asia (Tokyo)` を選択

2. **SQL Editor** を開き、`schema.sql` の内容を全てコピーして実行
   → テーブル・サンプルデータが自動作成される

3. **Project Settings > API** から以下をコピー：
   - `Project URL`（例: https://xxxxx.supabase.co）
   - `anon public` キー（長い文字列）

---

## Step 2: Vercel デプロイ（5分）

1. このフォルダをGitHubにpush
   ```bash
   git init
   git add .
   git commit -m "init"
   gh repo create content-os --public --push
   ```

2. https://vercel.com/new でGitHubリポジトリを選択してImport

3. **Environment Variables** に以下を追加：
   ```
   VITE_SUPABASE_URL     = （Step1でコピーしたProject URL）
   VITE_SUPABASE_ANON_KEY = （Step1でコピーしたanon publicキー）
   ```

4. **Deploy** をクリック → 1〜2分でデプロイ完了

---

## Step 3: 動作確認

| URL | 説明 |
|-----|------|
| `https://your-app.vercel.app/` | 管理者モード（全機能） |
| `https://your-app.vercel.app/?account=acc_1` | シアニン クライアントモード（閲覧・コメントのみ） |
| `https://your-app.vercel.app/?account=acc_2` | じゅんご クライアントモード |

---

## よくある質問

**Q: クライアント名を変えたい**
→ 管理者モードで「設定」ボタン → 各クライアントの「編集」から変更可能。URLのIDは変わらないのでリンクは引き続き有効。

**Q: 本番でセキュリティを強化したい**
→ Supabaseの認証（Auth）を使い、RLSポリシーを絞る。
今は `anon` キーで全員が読み書きできる設定（小規模チーム向け簡易運用）。

**Q: 投稿データが消えた**
→ Supabaseダッシュボードの Table Editor で確認できる。
