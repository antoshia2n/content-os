-- 段 5（2026-10-05）：本文・メモ・締めの型。sheet_genres と同じく利用者ごとに持つ
-- 画面は /api/db の入口（管理者キー）を通して読み書きするため、公開キー向けの許可は置かない
-- 何回流しても同じ結果になる。最後の 1 行が「9」なら表ができている
create table if not exists public.content_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null default '',
  kind        text not null check (kind in ('body','memo','closing')),
  post_type   text,
  content     text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists content_templates_user_kind_idx on public.content_templates (user_id, kind, sort_order);
alter table public.content_templates enable row level security;
select count(*) as 列の数 from information_schema.columns where table_schema = 'public' and table_name = 'content_templates';
