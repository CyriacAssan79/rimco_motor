-- Retour arrière de 0043_clip_approval_setting.sql (sans effet sur les vidéos déjà lancées).
alter table public.brands drop column if exists clip_approval_enabled;
notify pgrst, 'reload schema';
