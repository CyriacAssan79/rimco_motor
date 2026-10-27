-- 0037_keyframe_approval.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Validation of the keyframes before the paid animation (27/10): a setting per brand, chosen in the Admin.
--   off             : no validation (behaviour before 27/10)
--   optional        : a box in the Studio, unticked by default
--   premium_default : the box is ticked by default in Premium
--   always          : validation on every video (default, and RIMCO during the beta)
-- The validations themselves are stored in video_shots.verification_history (no new column).

alter table public.brands add column if not exists keyframe_approval_mode text not null default 'always';
alter table public.brands drop constraint if exists brands_keyframe_approval_mode_check;
alter table public.brands add constraint brands_keyframe_approval_mode_check
  check (keyframe_approval_mode in ('off','optional','premium_default','always'));
update public.brands set keyframe_approval_mode = 'always' where name = 'RIMCO Motors';

-- A video whose keyframes were not validated within 48 h expires (reservations released, keyframes kept).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('ready','failed','cancelled','validation','action_required','review_requested','approved','rejected','expired'));

notify pgrst, 'reload schema';
