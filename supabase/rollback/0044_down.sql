-- Retour arrière de 0044_flat_video_pricing.sql. Ne fait pas partie de setup.sql.
-- À n'exécuter qu'APRÈS avoir redéployé le code d'avant le forfait (sinon le Studio ne trouve plus de prix).
alter table public.pricing_settings drop constraint if exists pricing_settings_video_price_positive;
alter table public.pricing_settings drop column if exists video_price_fcfa_standard;
alter table public.pricing_settings drop column if exists video_price_fcfa_pro;
alter table public.pricing_settings drop column if exists video_price_fcfa_premium;
-- Le journal des tarifs n'est jamais effacé : la ligne « Passage au forfait » reste comme trace.
notify pgrst, 'reload schema';
