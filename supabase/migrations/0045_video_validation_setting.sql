-- 0045_video_validation_setting.sql · O03 (29/10/2026) : la validation d'une vidéo avant téléchargement devient un
-- réglage du client, désactivé par défaut. Désactivée : une vidéo prête se télécharge tout de suite (auteur, Manager).
-- Idempotent. Requiert 0042. La règle d'accès au stockage n'est pas modifiée : les liens de téléchargement sont signés
-- par le serveur (clé service), après le contrôle de droits fait dans /api/versions.
alter table public.client_billing_settings add column if not exists video_validation_enabled boolean not null default false;
notify pgrst, 'reload schema';
