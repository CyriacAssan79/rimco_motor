-- Retour arrière de 0046_shot_reports.sql. Ne fait pas partie de setup.sql.
-- ATTENTION : efface l'historique des plans non conformes. Exporter la table avant si des signalements existent.
-- À n'exécuter qu'après avoir redéployé le code d'avant le signalement.
drop table if exists public.shot_reports;
notify pgrst, 'reload schema';
