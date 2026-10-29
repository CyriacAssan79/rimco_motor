-- Retour arrière de 0045_video_validation_setting.sql. Ne fait pas partie de setup.sql.
-- Le code tolère l'absence de la colonne (validation désactivée par défaut).
alter table public.client_billing_settings drop column if exists video_validation_enabled;
notify pgrst, 'reload schema';
