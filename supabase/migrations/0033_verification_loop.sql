-- 0033_verification_loop.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Verification loop (25/10): a rejected keyframe goes back to the director (2 corrections at most);
-- a shot still rejected after that waits for a human decision instead of being animated.
-- (0032 is left free: the 24/10 version used it for the place geometry.)

-- 1. New keyframe states: 'revising' (the director corrects the shot), 'awaiting_review' (human decision).
alter table public.video_shots drop constraint if exists video_shots_keyframe_status_check;
alter table public.video_shots add constraint video_shots_keyframe_status_check
  check (keyframe_status in ('skipped','queued','generating','checking','revising','awaiting_review','ready','failed'));

-- 2. Up to 2 automatic corrections, plus the relaunches asked by a human (bounded).
alter table public.video_shots drop constraint if exists video_shots_keyframe_retry_count_check;
alter table public.video_shots add constraint video_shots_keyframe_retry_count_check
  check (keyframe_retry_count between 0 and 6);

-- 3. A clip still rejected after its retry also waits for a human decision.
alter table public.video_shots drop constraint if exists video_shots_video_quality_status_check;
alter table public.video_shots add constraint video_shots_video_quality_status_check
  check (video_quality_status in ('skipped','queued','checking','passed','retrying','awaiting_review','failed'));

-- 4. Shot corrected by the director, its pending request, and the history of every check (kept for the cost study).
alter table public.video_shots add column if not exists revised_draft jsonb;
alter table public.video_shots add column if not exists revision_request_id text;
alter table public.video_shots add column if not exists revision_ledger_id uuid references public.usage_ledger(id);
alter table public.video_shots add column if not exists verification_history jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
