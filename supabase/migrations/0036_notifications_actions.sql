-- 0036_notifications_actions.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Notifications « action requise », validation requests and decisions (26/10).
-- `dedupe_key` replaces the (user, version, type) uniqueness: several « action requise » per video (one per shot
-- and per refusal), still without duplicates when a refresh sees the same state again.

alter table public.notifications add column if not exists dedupe_key text;
update public.notifications set dedupe_key = type where dedupe_key is null;

-- Writes that do not give a key (older deployments) keep the former behaviour: one row per type.
create or replace function public.notifications_default_dedupe_key() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.dedupe_key := coalesce(new.dedupe_key, new.type);
  return new;
end;
$$;
drop trigger if exists notifications_default_dedupe_key on public.notifications;
create trigger notifications_default_dedupe_key before insert on public.notifications
  for each row execute function public.notifications_default_dedupe_key();
alter table public.notifications alter column dedupe_key set not null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('ready','failed','cancelled','validation','action_required','review_requested','approved','rejected'));

-- The former index was partial (where version_id is not null): ON CONFLICT (user_id, version_id, type)
-- without a predicate could not use it. The new index is complete, so the upsert can rely on it.
drop index if exists public.notifications_user_version_type_idx;
create unique index if not exists notifications_user_version_dedupe_idx
  on public.notifications(user_id, version_id, dedupe_key);

notify pgrst, 'reload schema';
