-- RIMCO Studio · 28/10/2026 · OPTIONNEL : faire avancer les générations chaque minute, même onglet fermé.
--
-- Pourquoi : sur Vercel Hobby, la tâche planifiée ne tourne qu'une fois par jour. Ce script demande à Supabase
-- (extensions pg_cron et pg_net) d'appeler /api/cron/reconcile?scope=generations chaque minute. La route fait
-- avancer au plus 10 générations en cours, exactement comme le fait un onglet ouvert.
-- Ce n'est PAS une migration : à coller à la main dans l'éditeur SQL de Supabase, sur la base de PRODUCTION
-- (les déploiements Preview sont protégés par authentification et ne répondent pas à Supabase).
--
-- Avant de lancer :
--   1. Supabase → Database → Extensions : activer « pg_cron » et « pg_net ».
--   2. Remplacer les deux valeurs entre chevrons ci-dessous (dans l'éditeur seulement, jamais dans le repo) :
--      l'adresse publique de production, sans « / » final, et la valeur de CRON_SECRET définie dans Vercel.
--   3. Run. Les étapes A ne se lancent qu'une fois (un secret du même nom ne peut pas être recréé).

-- A. Secrets, rangés dans le coffre Supabase (Vault) : ils n'apparaissent pas dans la définition de la tâche.
select vault.create_secret('<https://adresse-de-production>', 'rimco_app_url');
select vault.create_secret('<valeur de CRON_SECRET>', 'rimco_cron_secret');

-- B. La tâche, chaque minute (relancer cette instruction met la tâche à jour sans la dupliquer).
select cron.schedule(
  'rimco-generations-every-minute',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rimco_app_url') || '/api/cron/reconcile?scope=generations',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'rimco_cron_secret')),
    timeout_milliseconds := 55000
  );
  $$
);

-- Contrôle, après 2 ou 3 minutes : les derniers appels et leur code HTTP (200 attendu, 401 = CRON_SECRET différent).
-- select status_code, created from net._http_response order by created desc limit 5;
-- select status, start_time, return_message from cron.job_run_details order by start_time desc limit 5;

-- Arrêt (à tout moment, sans autre effet) :
-- select cron.unschedule('rimco-generations-every-minute');
