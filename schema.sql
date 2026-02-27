-- ① Supabaseのダッシュボード > SQL Editor に貼り付けて実行

-- アカウント（クライアント）テーブル
create table accounts (
  id        text primary key,
  name      text not null,
  handle    text not null default '',
  color     text not null default '#f59e0b',
  created_at timestamptz default now()
);

-- 投稿テーブル
create table posts (
  id          bigint primary key,
  account_id  text not null references accounts(id) on delete cascade,
  title       text not null default '',
  status      text not null default 'draft',
  platform    text not null default 'x',
  datetime    text not null,
  threads     jsonb not null default '[]',
  memo        text not null default '',
  comments    jsonb not null default '[]',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- updated_at 自動更新
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger posts_updated_at
before update on posts
for each row execute procedure update_updated_at();

-- RLS（Row Level Security）を有効化
alter table accounts enable row level security;
alter table posts enable row level security;

-- 全員が読み取り可（管理者・クライアント共通）
create policy "anyone can read accounts" on accounts for select using (true);
create policy "anyone can read posts"    on posts    for select using (true);

-- 書き込みは anon キーでも全員可（簡易運用。本番は要検討）
create policy "anyone can insert accounts" on accounts for insert with check (true);
create policy "anyone can update accounts" on accounts for update using (true);
create policy "anyone can delete accounts" on accounts for delete using (true);

create policy "anyone can insert posts" on posts for insert with check (true);
create policy "anyone can update posts" on posts for update using (true);
create policy "anyone can delete posts" on posts for delete using (true);

-- サンプルデータ
insert into accounts (id, name, handle, color) values
  ('acc_1', 'シアニン',  '@cyanine_x',     '#f59e0b'),
  ('acc_2', 'じゅんご',  '@junto_hapi',    '#3b82f6'),
  ('acc_3', '孔明',      '@career_koumei', '#10b981');

insert into posts (id, account_id, title, status, platform, datetime, threads, memo, comments) values
  (1, 'acc_1', '朝の図解：思考力', 'published', 'x', '2026-02-23T07:09',
    '["思考力とは「問いを立てる力」である。\n\nAIの時代でも変わらない唯一のスキル。"]',
    '朝の図解シリーズ', '["OK済み"]'),
  (2, 'acc_1', '30代で身につけるスキル', 'review', 'note', '2026-02-27T12:00',
    '["光陰矢の如し。30代はあっという間だった。\n\n30代で大事なことは「自分を固める」こと。","①思考力　②言語化力　③調整力…"]',
    '連載記事1本目。農業メタファーで統一', '["導入を短く","農業の比喩を早く出す"]'),
  (3, 'acc_1', 'X運用の黄金方程式', 'reserved', 'x', '2026-02-28T19:00',
    '["X運用で結果が出ない人に共通すること。\n\n100アカウント分析して気づいた黄金の方程式を公開する。"]',
    '夜の集客コンテンツ。メンバーシップへ誘導', '["CTAを強くする"]');
