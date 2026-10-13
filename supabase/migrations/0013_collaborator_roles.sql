-- RIMCO collaborator/validator/admin workflow extensions.
alter table public.videos drop constraint if exists videos_status_check;
alter table public.videos add constraint videos_status_check check (status in ('draft','generating','ready','review','approved','rejected','failed','cancelled'));

alter table public.video_versions drop constraint if exists video_versions_status_check;
alter table public.video_versions add constraint video_versions_status_check check (status in ('queued','generating','postprocessing','ready','failed','cancelled'));

alter table public.assets add column if not exists title text;
alter table public.assets add column if not exists category text;
alter table public.assets drop constraint if exists assets_kind_check;
alter table public.assets add constraint assets_kind_check check (kind in ('vehicle','logo','audio','place','decor','wardrobe','badge'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  version_id uuid references public.video_versions(id) on delete cascade,
  type text not null check (type in ('ready','failed','cancelled','validation')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
