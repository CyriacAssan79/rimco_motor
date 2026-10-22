-- 0030 · Casting photos and optional end keyframes (patch qualité v3, 2026-10-22).
-- Idempotent: safe to run several times in the Supabase SQL editor.

-- 1. New media kind « character » (Casting): one approved photo per real person, with image rights cleared.
alter table public.assets drop constraint if exists assets_kind_check;
alter table public.assets add constraint assets_kind_check
  check (kind in ('vehicle','logo','audio','place','decor','wardrobe','badge','character'));

-- 2. Optional closing frame of rolling shots (KEYFRAME_END_FRAME_ROLLING). 'skipped' = not used.
alter table public.video_shots add column if not exists end_keyframe_status text not null default 'skipped';
alter table public.video_shots drop constraint if exists video_shots_end_keyframe_status_check;
alter table public.video_shots add constraint video_shots_end_keyframe_status_check
  check (end_keyframe_status in ('skipped','queued','generating','checking','ready','failed'));
alter table public.video_shots add column if not exists end_keyframe_request_id text;
alter table public.video_shots add column if not exists end_keyframe_quality_request_id text;
alter table public.video_shots add column if not exists end_keyframe_path text;
alter table public.video_shots add column if not exists end_keyframe_quality jsonb;
-- [image reservation, quality reservation], reserved before any paid call.
alter table public.video_shots add column if not exists end_keyframe_ledger_ids uuid[] not null default '{}';

notify pgrst, 'reload schema';
