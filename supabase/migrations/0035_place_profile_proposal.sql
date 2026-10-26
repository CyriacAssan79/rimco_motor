-- 0035_place_profile_proposal.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Place sheet proposed by the vision model when a place is uploaded (26/10), once per place.
-- place_profile (0034) keeps the sheet validated by an admin; the proposal is only shown to the admin.

alter table public.assets add column if not exists place_profile_proposal jsonb;
alter table public.assets drop constraint if exists assets_place_profile_proposal_check;
alter table public.assets add constraint assets_place_profile_proposal_check
  check (place_profile_proposal is null or (kind = 'place' and jsonb_typeof(place_profile_proposal) = 'object'));

alter table public.assets add column if not exists place_profile_proposal_status text;
alter table public.assets drop constraint if exists assets_place_profile_proposal_status_check;
alter table public.assets add constraint assets_place_profile_proposal_status_check
  check (place_profile_proposal_status is null or place_profile_proposal_status in ('pending','ready','failed'));

-- The fal request and its cost line: a place is never proposed twice.
alter table public.assets add column if not exists place_profile_request_id text;
alter table public.assets add column if not exists place_profile_ledger_id uuid references public.usage_ledger(id) on delete set null;
alter table public.assets add column if not exists place_profile_requested_at timestamptz;

notify pgrst, 'reload schema';
