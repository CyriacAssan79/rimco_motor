-- 0034_place_profile.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Motion matrix (26/10): what an uploaded place allows, described by an admin in the media library
-- (inside or outside, viewpoint, directions along or across the road, shot types, dust, top speed).
-- Validated by the application (Zod); an undescribed place gets a prudent default.
-- (0032 is left free: the 24/10 version used it for the place geometry.)

alter table public.assets add column if not exists place_profile jsonb;
alter table public.assets drop constraint if exists assets_place_profile_check;
alter table public.assets add constraint assets_place_profile_check
  check (place_profile is null or (kind = 'place' and jsonb_typeof(place_profile) = 'object'));

notify pgrst, 'reload schema';
