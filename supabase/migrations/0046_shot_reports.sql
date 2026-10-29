-- 0046_shot_reports.sql · S01 / S03 simple (29/10/2026) : plans déclarés non conformes avant le montage.
-- Un plan est conforme (validé comme avant) ou non conforme : reprise créative (commentaire) ou erreur technique
-- (motifs cochés), puis une décision : accepter le plan, relancer la génération, ou rejeter le plan (clip désactivé).
-- L'opérateur KÔMIAN suit ces plans ; il recrédite les erreurs techniques à la main (Clients et crédits › Crédit offert)
-- et inscrit ici le montant et le motif. Insert seulement côté client ; lecture et suivi par la clé service.
-- Idempotent. Requiert 0042. Rien ne se supprime : une vidéo supprimée garde ses signalements (liens mis à null).
create table if not exists public.shot_reports (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references public.video_versions(id) on delete set null,
  video_id uuid references public.videos(id) on delete set null,
  video_title text,
  brand_id uuid references public.brands(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  shot_number int not null check (shot_number between 1 and 6),
  stage text not null check (stage in ('keyframe','video')),
  kind text not null check (kind in ('creative','technical')),
  reasons text[] not null default '{}',
  comment text check (comment is null or length(comment) <= 400),
  decision text not null check (decision in ('accept','relaunch','reject')),
  reported_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  -- Suivi KÔMIAN (erreurs techniques) : open → credited (montant inscrit) ou refused (motif).
  status text not null default 'open' check (status in ('open','credited','refused')),
  credited_fcfa numeric(14,0) check (credited_fcfa is null or credited_fcfa >= 0),
  handling_note text check (handling_note is null or length(handling_note) <= 400),
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  constraint shot_reports_kind_content check (
    (kind = 'technical' and cardinality(reasons) > 0) or (kind = 'creative' and length(coalesce(comment, '')) > 0)
  ),
  constraint shot_reports_creative_relaunch check (kind = 'technical' or decision = 'relaunch')
);
create index if not exists shot_reports_recent_idx on public.shot_reports(created_at desc);
create index if not exists shot_reports_open_idx on public.shot_reports(client_id, created_at desc) where kind = 'technical' and status = 'open';
alter table public.shot_reports enable row level security;
-- Aucune règle d'accès : seules les routes serveur (clé service) lisent et écrivent, après contrôle du rôle.
notify pgrst, 'reload schema';
