-- 0040_member_deletion.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- « Supprimer un membre » (27/10, Admin only). A member without history is deleted outright. A member with videos,
-- costs or validations stays as their author (the cost journal never changes) but is archived: deleted_at is set,
-- the account is inactive, hidden from the team, and its login is blocked by the application.

alter table public.profiles add column if not exists deleted_at timestamptz;
create index if not exists profiles_active_members_idx on public.profiles(created_at) where deleted_at is null;

notify pgrst, 'reload schema';
