-- 0032_place_geometry.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- What an uploaded place photo shows, filled by an admin in the media library (25/10/2026).
-- The storyboard director plans the car's path from it; an undescribed place cannot be used in a storyboard.

alter table public.assets add column if not exists place_viewpoint text;
alter table public.assets drop constraint if exists assets_place_viewpoint_check;
alter table public.assets add constraint assets_place_viewpoint_check check (place_viewpoint is null or place_viewpoint in ('ground','elevated','distant','interior'));

alter table public.assets add column if not exists place_road_axis text;
alter table public.assets drop constraint if exists assets_place_road_axis_check;
alter table public.assets add constraint assets_place_road_axis_check check (place_road_axis is null or place_road_axis in ('depth','lateral','diagonal','bend_left','bend_right','crossroads','none'));

alter table public.assets add column if not exists place_road_type text;
alter table public.assets drop constraint if exists assets_place_road_type_check;
alter table public.assets add constraint assets_place_road_type_check check (place_road_type is null or place_road_type in ('urban','open','unpaved'));

alter table public.assets add column if not exists place_time_of_day text;
alter table public.assets drop constraint if exists assets_place_time_of_day_check;
alter table public.assets add constraint assets_place_time_of_day_check check (place_time_of_day is null or place_time_of_day in ('day','golden','night','interior'));

alter table public.assets add column if not exists place_landmarks text;
alter table public.assets drop constraint if exists assets_place_landmarks_check;
alter table public.assets add constraint assets_place_landmarks_check check (place_landmarks is null or char_length(place_landmarks) <= 160);

notify pgrst, 'reload schema';
