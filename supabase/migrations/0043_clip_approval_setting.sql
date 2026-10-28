-- 0043_clip_approval_setting.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- 28/10 · optimisation : la validation humaine reste en place, mais l'opérateur KÔMIAN choisit, par marque,
-- si les clips sont aussi validés avant le montage (les images clés suivent keyframe_approval_mode, 0037).
--   true  : images clés puis clips validés par l'utilisateur (comportement actuel, valeur par défaut)
--   false : images clés validées ; les clips contrôlés automatiquement partent directement au montage
-- Le choix est figé dans la vidéo au lancement (brief_json.clipApprovalRequired).

alter table public.brands add column if not exists clip_approval_enabled boolean not null default true;

notify pgrst, 'reload schema';
