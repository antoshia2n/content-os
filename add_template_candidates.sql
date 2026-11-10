-- 2026-11-10 開発部：AI が型・依頼パターンを「候補」として書き込む（型の持ち帰り 便1）。本番へは適用済み
alter table public.content_templates
  add column if not exists status text,
  add column if not exists source_post_id bigint,
  add column if not exists why text not null default '',
  add column if not exists made_by text;
alter table public.content_templates drop constraint if exists content_templates_status_check;
alter table public.content_templates add constraint content_templates_status_check check (status is null or status in ('candidate','testing','confirmed'));
alter table public.content_templates drop constraint if exists content_templates_made_by_check;
alter table public.content_templates add constraint content_templates_made_by_check check (made_by is null or made_by in ('claude','gpt'));
