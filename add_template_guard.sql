-- 2026-11-10 開発部：型の持ち帰り。本番へは適用済み（migration content_templates_guard）
-- Naoki の型（候補ではないもの）の名前・中身を、アプリと道具（API 経由＝service_role など）以外から書き換えたら断る。
-- 誤操作を止める見張りで、権限で迂回を防ぐものではない。開発でわざと直すときは同じ取引の中で set_config('app.allow_template_write','on',true)。
create or replace function public.content_templates_guard() returns trigger language plpgsql as $$
begin
  if old.status is distinct from 'candidate'
     and (new.content is distinct from old.content or new.name is distinct from old.name)
     and current_user not in ('service_role', 'authenticated', 'anon')
     and coalesce(current_setting('app.allow_template_write', true), '') <> 'on' then
    raise exception 'コンテンツくんの型（%）はデータベースから直接書き換えられません。content_os__save_template の revise_id にこの型の id（%）を渡して、改訂案の候補として出してください。', old.name, old.id
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists content_templates_guard on public.content_templates;
create trigger content_templates_guard before update on public.content_templates
  for each row execute function public.content_templates_guard();
