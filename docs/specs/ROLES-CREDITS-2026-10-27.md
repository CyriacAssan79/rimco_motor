# RIMCO Studio · Rôles et crédits clients : proposition (27/10/2026)

Suite de `claude/RIMCO_Studio_audit_roles_droits_27-10-2026.md`. Cette proposition intègre les réponses de l'équipe du 27/10.

Légende : **[vérifié]** = lu dans le code de l'archive `rimco_motor-preambule` ; **[supposé]** = à confirmer (tableau de bord Supabase, tests).

## 0. Décisions prises par l'équipe le 27/10

| Sujet | Décision |
|---|---|
| Départements | Pas de segmentation pour l'instant |
| Valideur | Un collaborateur qui a le droit de valider |
| Unité | Solde en FCFA, sans découvert |
| Prix d'une vidéo | Le calcul existant (grille FCFA/s par niveau), paramétrable par KÔMIAN |
| Modifications humaines | Incluses dans le prix pour l'instant. Prix et nombre maximal paramétrables par KÔMIAN |
| Débit | Montant bloqué au lancement, débité à la livraison, libéré en cas d'échec ou d'annulation |
| Expiration et alertes | À proposer, paramétrables par KÔMIAN |
| Recharge | Montant, expiration, note ; références de facture et de paiement **facultatives** ; KÔMIAN peut aussi **offrir** des crédits ; corrections par écriture inverse |
| Visibilité | Tout le monde voit le solde. L'admin client voit l'historique et l'export. Seul KÔMIAN voit les coûts de production |
| Plafonds par utilisateur | Pas en V1 |
| Client | Une entité « client » (RIMCO) avec un solde unique pour toutes ses marques |
| Vidéos KÔMIAN | Ne débitent pas le client |
| Validation | Obligatoire avant téléchargement, même pour l'admin. Un admin client ou un valideur **peut** valider ses propres vidéos |
| E-mails | Aucun service d'envoi pour l'instant. L'admin crée les accès, Supabase gère le reste (comptes, mots de passe, sessions) |
| Dépenses du collaborateur | Il voit ses propres dépenses |
| Valeurs par défaut | Validées : achat 12 mois, offert 3 mois, alerte 30 jours avant expiration, seuil de solde bas à 50 000 FCFA (tous paramétrables) |
| Prix des relances (non facturées) | Affiché **barré**, suivi de « (non facturé) » |
| Tarif Pro | Distinct du Premium, réglé par KÔMIAN |

## 1. Constats nouveaux dans le code

| # | Constat [vérifié] | Fichier | Conséquence |
|---|---|---|---|
| C1 | Le prix client vient de la grille `pricing_settings` : durée totale × tarif. La grille n'a que deux colonnes. `estimateGridPriceFcfa` applique le tarif Premium à tout ce qui n'est pas Standard, **Pro compris**. | `core/pricing.ts` l. 17, `storyboard-live.ts` l. 249, `api/models/available` | Décision : un tarif Pro distinct. La colonne Pro est pré-remplie avec le tarif Premium (prix actuel inchangé), puis KÔMIAN la règle (§ 4.4). |
| C2 | Le coût d'une relance s'affiche au client en FCFA (coût fal + 30 %), alors que la relance est enregistrée avec un prix client nul : le client voit un montant qu'il ne paie pas. | `versions/review-details.ts` l. 25 et 65, `billing/ledger.ts` l. 112 | Décision : prix barré et « (non facturé) » ; prix normal si KÔMIAN rend les modifications payantes (§ 4.4). |
| C3 | Deux règles de marge restent dans le code sans servir à la facturation : `CLIENT_MARKUP_RATE = 0.30` (affichages et mode simulation) et +20 % dans `settle_budget` (migration 0007), qui n'est plus appelée nulle part. | `core/pricing.ts` l. 2, `0007_fal_markup.sql` | Source de confusion : à retirer quand les crédits seront en place. |
| C4 | La limite de modifications humaines est une constante : `HUMAN_REVISIONS_PER_SHOT = 2`. | `core/verification/loop.ts` l. 25 | Elle doit devenir un réglage du client. |
| C5 | En cas d'erreur, le lancement **supprime** la vidéo qu'il vient de créer. | `storyboard-live.ts` l. 286-310 | Un montant bloqué rattaché à cette vidéo serait perdu : il faut le libérer avant toute suppression (déclencheur SQL, § 4). |
| C6 | Comme le valideur devient un collaborateur, le défaut P0-1 de l'audit (valideur qui lance des appels payants) disparaît. Le défaut P0-2b (interdire de valider sa propre vidéo) est abandonné à la demande de l'équipe. | — | — |

## 2. Rôles : modèle retenu

| Profil | `role` | Indicateurs | Droits |
|---|---|---|---|
| Collaborateur | `collaborateur` | — | Créer et modifier ses vidéos, les envoyer en validation, voir le solde et ses propres dépenses |
| Collaborateur valideur | `collaborateur` | `can_validate = true` | En plus : approuver ou refuser les vidéos de son client, y compris les siennes |
| Admin client (référent RIMCO) | `admin` | — | Tout ce que fait un valideur, plus les comptes, la médiathèque, l'historique des crédits et l'export CSV. **Aucun coût de production** |
| Opérateur KÔMIAN | **`operateur`** (rôle à part entière) | — | Tout, plus les tarifs, les recharges, les réglages de facturation, les coûts réels et la marge, la clé fal, les modèles, la comparaison et le stockage. Lui seul crée ou modifie un compte opérateur. Ses vidéos ne débitent pas le client |

**Opérateur : un rôle, pas une case (décision du 27/10).** L'opérateur KÔMIAN n'appartient pas au client. Il a sa propre valeur de rôle et son propre espace dans la navigation. Pour ne pas réécrire les règles d'accès, la fonction SQL `is_admin()` renvoie vrai pour `admin` **et** `operateur` : l'opérateur hérite des droits d'admin dans toutes les règles d'accès actuelles. `is_operator()` ne renvoie vrai que pour `operateur`. Côté TypeScript, les 93 occurrences de `'admin'` [vérifié] sont revues une par une et passent par deux fonctions : `hasAdminRights(actor)` (admin ou opérateur) et `isOperator(actor)`.

**Migration des comptes existants [supposé, à confirmer par l'équipe] :** en bêta, tous les admins actuels sont des membres de KÔMIAN. La migration les passe donc en `operateur`. L'opérateur repasse ensuite le référent RIMCO en `admin` depuis l'écran Équipe. Le dernier opérateur actif est protégé (il ne peut être ni désactivé ni rétrogradé). Le premier compte créé sur une base vide devient opérateur.

**Autres changements :**
- Retirer le filtre par département des règles d'accès, des files de validation et des notifications (`0001_initial.sql` l. 213-227, `api/validations/*`, `api/versions/route.ts` l. 104-106, `core/versions/live.ts` l. 274 et 292). La colonne `department` reste en base, sans effet.
- Supprimer l'auto-approbation des vidéos d'admin (`live.ts` l. 281 et 381, `mock-persistence.ts`) : la validation se fait toujours par un clic explicite.
- Quand l'auteur valide sa propre vidéo, l'historique de validation l'indique (« Validée par son auteur »), pour la traçabilité.
- Une vidéo s'adresse à tous les valideurs de son client, et aux admins s'il n'y a aucun valideur.

## 3. Crédits : fonctionnement proposé

### 3.1 Principes

- **Lots de crédits.** Chaque recharge, achetée ou offerte, crée un lot avec un montant, un reste et une date d'expiration.
- **Solde disponible** = somme des restes des lots non expirés. Un montant bloqué par une vidéo en cours est déjà déduit du disponible.
- **Ordre de consommation.** Le lot qui expire le plus tôt est consommé en premier.
- **Lancement.** Le prix de la vidéo (grille existante) est bloqué. Si le disponible ne suffit pas, le lancement est refusé **avant tout appel payant**, avec le montant manquant.
- **Livraison.** Quand la vidéo passe à l'état « prête », le montant bloqué est **débité**.
- **Échec, annulation ou expiration de la vidéo.** Le montant bloqué est **libéré** et retourne dans ses lots d'origine.
- **Livraison partielle.** Si des plans sont désactivés, le prix ne change pas (règle déjà retenue pour la planche des clips).
- **Journal.** Chaque opération écrit une ligne dans un journal en lecture seule, jamais modifiable : recharge, offre, blocage, débit, libération, expiration, correction, prolongation, avec le solde après opération.
- **Coûts internes.** `usage_ledger` reste le journal des coûts de KÔMIAN (coût fal, juges, relances). Les crédits sont la vérité côté client. Les deux sont reliés par `version_id`.
- **Activation progressive.** Le réglage « crédits appliqués » est désactivé par défaut. Tant qu'il l'est, les montants sont tracés sans bloquer personne. KÔMIAN fait une première recharge, puis active le réglage.

### 3.2 Proposition pour l'expiration (paramétrable)

| Réglage | Valeur par défaut proposée |
|---|---|
| Validité d'un crédit acheté | 12 mois après la recharge |
| Validité d'un crédit offert | 3 mois |
| Date d'expiration | Pré-remplie au moment de la recharge, modifiable lot par lot |
| Prolongation | Possible par KÔMIAN, tracée dans le journal, uniquement pour un lot pas encore expiré |
| Alerte d'expiration | 30 jours avant, à l'admin client et à KÔMIAN |
| Crédits bloqués par une vidéo en cours | Protégés : ils n'expirent pas pendant la génération |
| Vidéo en échec dont le lot a expiré entre-temps | Le montant libéré expire aussitôt, et c'est tracé |

### 3.3 Alerte de solde bas (paramétrable)

- **Seuil par défaut** : 50 000 FCFA. Hypothèse : environ 3 vidéos Premium de 20 s à 14 000 FCFA (20 s × 700 FCFA/s).
- **Destinataires** : l'admin client et KÔMIAN.
- **Déclenchement** : au moment où le solde passe sous le seuil, une seule fois par franchissement.
- **Canal** : la cloche de l'application uniquement (pas de service d'envoi pour l'instant).

### 3.4 Ce que voit chacun

| Écran | Collaborateur | Admin client | Opérateur KÔMIAN |
|---|---|---|---|
| Studio : solde disponible et prix avant lancement | ✔ | ✔ | ✔ (avec la mention « non débité ») |
| Message « Solde insuffisant : il manque X FCFA, contactez votre administrateur » | ✔ | ✔ | — |
| Crédits : solde, montants bloqués, prochaine expiration | ✔ (ses propres dépenses) | ✔ | ✔ |
| Historique (date, type, utilisateur, vidéo cliquable, montant, solde après) et filtres par personne et par période | ses lignes | ✔ | ✔ |
| Synthèse par utilisateur et par mois, export CSV | ✘ | ✔ | ✔ |
| Recharger, offrir, corriger, prolonger | ✘ | ✘ | ✔ |
| Réglages de facturation (§ 3.5) | ✘ | lecture du tarif | ✔ |
| Coût réel, marge, dollars (`/couts`) | ✘ | ✘ | ✔ |

### 3.5 Réglages KÔMIAN par client

Table `client_billing_settings` :
- crédits appliqués (oui ou non) ;
- seuil d'alerte en FCFA ;
- nombre de jours d'alerte avant expiration ;
- validité par défaut d'un crédit acheté et d'un crédit offert ;
- nombre de modifications humaines par plan (aujourd'hui 2, la constante C4) ;
- prix d'une modification en FCFA (0 = incluse).

La grille FCFA/s reste dans `pricing_settings`, avec une colonne Pro en plus. Seul l'opérateur peut la modifier.

**Modifier les prix : constat [vérifié].** La route `PATCH /api/admin/pricing` existe, mais elle ne gère que Standard et Premium, et elle est ouverte à tout admin. L'onglet « Facturation » de `AdminCenter.tsx` n'affiche qu'un texte : **aucun écran ne permet de modifier les prix**. À livrer : l'écran « Tarifs et réglages », réservé à l'opérateur, avec la grille par marque (Standard, Pro, Premium en FCFA/s), des exemples de prix calculés, les réglages des modifications (nombre et prix), des alertes et de l'expiration, et l'interrupteur « Appliquer les crédits ». Un changement ne vaut que pour les vidéos lancées ensuite : chaque ligne du journal fige déjà son tarif. Chaque changement est tracé (auteur, date, ancienne et nouvelle valeur).

## 4. Code prêt à intégrer

### 4.1 Migration `supabase/migrations/0038_roles_and_client_credits.sql`

À reporter aussi dans `supabase/setup.sql`. Le script est idempotent.

```sql
-- 0038 : rôles (valideur = droit, opérateur KÔMIAN) et crédits clients en FCFA.

-- Clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.clients(name) values ('RIMCO Motors') on conflict (name) do nothing;
alter table public.brands add column if not exists client_id uuid references public.clients(id);
update public.brands set client_id = (select id from public.clients where name = 'RIMCO Motors') where client_id is null;

-- Rôles : collaborateur, admin (client), operateur (KÔMIAN). Valider devient un droit (can_validate).
alter table public.profiles add column if not exists can_validate boolean not null default false;

-- Le garde-fou protège désormais le dernier opérateur actif (remplacé AVANT les mises à jour de rôle ci-dessous).
create or replace function public.guard_last_active_admin() returns trigger language plpgsql security definer set search_path = '' as $$
declare active_operators integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'operateur' and old.is_active then
      perform pg_advisory_xact_lock(hashtext('rimco_active_admin_roster'));
      select count(*) into active_operators from public.profiles p where p.role = 'operateur' and p.is_active and p.id <> old.id;
      if active_operators = 0 then raise exception using errcode = 'P0001', message = 'Impossible de supprimer le dernier opérateur KÔMIAN actif'; end if;
    end if;
    return old;
  end if;
  if old.role = 'operateur' and old.is_active and (new.role <> 'operateur' or not new.is_active) then
    perform pg_advisory_xact_lock(hashtext('rimco_active_admin_roster'));
    select count(*) into active_operators from public.profiles p where p.role = 'operateur' and p.is_active and p.id <> old.id;
    if active_operators = 0 then raise exception using errcode = 'P0001', message = 'Impossible de désactiver ou rétrograder le dernier opérateur KÔMIAN actif'; end if;
  end if;
  return new;
end $$;

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set can_validate = true, role = 'collaborateur' where role = 'valideur';
-- Hypothèse bêta (à confirmer) : les admins actuels sont des membres KÔMIAN ; ils deviennent opérateurs une seule fois.
update public.profiles set role = 'operateur'
  where role = 'admin' and not exists (select 1 from public.profiles where role = 'operateur');
alter table public.profiles add constraint profiles_role_check check (role in ('collaborateur','admin','operateur'));

-- L'opérateur hérite de toutes les règles d'accès « admin » existantes.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operateur') and p.is_active)
$$;
create or replace function public.is_operator() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operateur' and p.is_active)
$$;

-- Base vide : le premier compte devient opérateur.
create or replace function public.create_profile_for_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare first_brand uuid; new_role text;
begin
  perform pg_advisory_xact_lock(hashtext('rimco_first_admin'));
  select b.id into first_brand from public.brands b order by b.created_at limit 1;
  new_role := case when exists(select 1 from public.profiles p where p.role = 'operateur') then 'collaborateur' else 'operateur' end;
  insert into public.profiles(id,name,role,brand_id) values(new.id,coalesce(new.raw_user_meta_data->>'name',''),new_role,first_brand);
  return new;
end $$;

-- Un admin client ne peut ni voir ni créer, modifier ou promouvoir un compte opérateur.
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_operator() or (public.is_admin() and role <> 'operateur'));
drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles for all to authenticated
  using (public.is_operator() or (public.is_admin() and role <> 'operateur'))
  with check (public.is_operator() or (public.is_admin() and role <> 'operateur'));
-- À faire dans le même lot : réécrire les règles qui testent p.role = 'valideur' et p.department
-- (videos_read, versions_read, validations_read, validations_validator_review, rimco_storage_read) :
-- un valideur = (p.can_validate or p.role in ('admin','operateur')), même client, sans département.
create or replace function public.my_client_id() returns uuid language sql stable security definer set search_path = '' as $$
  select b.client_id from public.profiles p join public.brands b on b.id = p.brand_id where p.id = auth.uid() and p.is_active
$$;

-- Coûts de production : opérateur seulement
drop policy if exists ledger_admin_read on public.usage_ledger;
create policy ledger_admin_read on public.usage_ledger for select to authenticated using (public.is_operator());
drop policy if exists models_admin_read on public.ai_models;
create policy models_admin_read on public.ai_models for select to authenticated using (public.is_operator());
drop policy if exists models_admin_manage on public.ai_models;
create policy models_admin_manage on public.ai_models for all to authenticated using (public.is_operator()) with check (public.is_operator());
drop policy if exists comparisons_admin_all on public.comparisons;
create policy comparisons_admin_all on public.comparisons for all to authenticated using (public.is_operator()) with check (public.is_operator());
drop policy if exists pricing_admin_manage on public.pricing_settings;
create policy pricing_admin_manage on public.pricing_settings for all to authenticated using (public.is_operator()) with check (public.is_operator());
alter table public.pricing_settings add column if not exists grid_fcfa_per_second_pro numeric(12,2);
update public.pricing_settings set grid_fcfa_per_second_pro = grid_fcfa_per_second_premium where grid_fcfa_per_second_pro is null; -- comportement actuel conservé (C1)
-- TODO : appliquer la même règle aux politiques de fal_credentials (migration 0023), après relecture.

-- Réglages de facturation
create table if not exists public.client_billing_settings (
  client_id uuid primary key references public.clients(id) on delete cascade,
  credits_enforced boolean not null default false,
  low_balance_threshold_fcfa numeric(14,0) not null default 50000 check (low_balance_threshold_fcfa >= 0),
  expiry_warning_days int not null default 30 check (expiry_warning_days between 0 and 365),
  purchase_validity_months int not null default 12 check (purchase_validity_months between 1 and 60),
  gift_validity_months int not null default 3 check (gift_validity_months between 1 and 60),
  human_revisions_per_shot int not null default 2 check (human_revisions_per_shot between 0 and 5),
  revision_price_fcfa numeric(14,0) not null default 0 check (revision_price_fcfa >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.client_billing_settings(client_id) select id from public.clients on conflict do nothing;

-- Lots, blocages, journal
create table if not exists public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  kind text not null check (kind in ('purchase','gift')),
  amount_fcfa numeric(14,0) not null check (amount_fcfa > 0),
  remaining_fcfa numeric(14,0) not null check (remaining_fcfa >= 0),
  expires_at timestamptz not null,
  invoice_ref text, payment_ref text, note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (remaining_fcfa <= amount_fcfa)
);
create index if not exists credit_lots_fifo_idx on public.credit_lots(client_id, expires_at, created_at) where remaining_fcfa > 0;

create table if not exists public.credit_holds (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  video_id uuid references public.videos(id) on delete set null,
  version_id uuid references public.video_versions(id) on delete set null,
  user_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('video','revision')),
  amount_fcfa numeric(14,0) not null check (amount_fcfa > 0),
  enforced boolean not null,
  status text not null default 'held' check (status in ('held','captured','released')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists credit_holds_video_idx on public.credit_holds(video_id) where status = 'held';

create table if not exists public.credit_hold_allocations (
  hold_id uuid not null references public.credit_holds(id) on delete cascade,
  lot_id uuid not null references public.credit_lots(id),
  amount_fcfa numeric(14,0) not null check (amount_fcfa > 0),
  primary key (hold_id, lot_id)
);

create table if not exists public.credit_movements (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id),
  type text not null check (type in ('topup','gift','hold','capture','release','expiry','adjustment','extension')),
  amount_fcfa numeric(14,0) not null,            -- effet signé sur le solde disponible
  available_after_fcfa numeric(14,0) not null,
  lot_id uuid references public.credit_lots(id),
  hold_id uuid references public.credit_holds(id),
  user_id uuid references public.profiles(id), video_id uuid, version_id uuid,
  note text, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists credit_movements_client_idx on public.credit_movements(client_id, created_at desc);

-- Fonctions (service_role uniquement ; les routes vérifient le rôle avant l'appel)
create or replace function public.credit_available(p_client uuid) returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(remaining_fcfa), 0) from public.credit_lots where client_id = p_client and expires_at > now()
$$;

create or replace function public.credit_expire_due(p_client uuid default null) returns int language plpgsql security definer set search_path = '' as $$
declare lot record; n int := 0;
begin
  for lot in select id, client_id, remaining_fcfa from public.credit_lots
             where (p_client is null or client_id = p_client) and expires_at <= now() and remaining_fcfa > 0 for update loop
    update public.credit_lots set remaining_fcfa = 0 where id = lot.id;
    insert into public.credit_movements(client_id, type, amount_fcfa, available_after_fcfa, lot_id, note)
    values (lot.client_id, 'expiry', -lot.remaining_fcfa, public.credit_available(lot.client_id), lot.id, 'Crédits expirés');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.credit_hold(p_client uuid, p_user uuid, p_video uuid, p_version uuid, p_kind text, p_amount numeric, p_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_hold uuid; v_left numeric := p_amount; v_take numeric; lot record; v_avail numeric; v_enforced boolean;
begin
  if p_amount is null or p_amount <= 0 or p_key is null then
    raise exception using errcode = '22023', message = 'Réservation de crédits invalide';
  end if;
  perform pg_advisory_xact_lock(hashtext('rimco_credits:' || p_client::text));
  select id into v_hold from public.credit_holds where idempotency_key = p_key;
  if found then return v_hold; end if;
  perform public.credit_expire_due(p_client);
  select coalesce(credits_enforced, false) into v_enforced from public.client_billing_settings where client_id = p_client;
  v_enforced := coalesce(v_enforced, false);
  v_avail := public.credit_available(p_client);
  if v_enforced and v_avail < p_amount then
    raise exception using errcode = 'P0001', message = 'CREDIT_INSUFFICIENT:' || (p_amount - v_avail)::text;
  end if;
  insert into public.credit_holds(client_id, video_id, version_id, user_id, kind, amount_fcfa, enforced, idempotency_key)
  values (p_client, p_video, p_version, p_user, p_kind, p_amount, v_enforced, p_key) returning id into v_hold;
  if v_enforced then
    for lot in select id, remaining_fcfa from public.credit_lots
               where client_id = p_client and expires_at > now() and remaining_fcfa > 0
               order by expires_at, created_at for update loop
      exit when v_left <= 0;
      v_take := least(lot.remaining_fcfa, v_left);
      update public.credit_lots set remaining_fcfa = remaining_fcfa - v_take where id = lot.id;
      insert into public.credit_hold_allocations(hold_id, lot_id, amount_fcfa) values (v_hold, lot.id, v_take);
      v_left := v_left - v_take;
    end loop;
  end if;
  insert into public.credit_movements(client_id, type, amount_fcfa, available_after_fcfa, hold_id, user_id, video_id, version_id, note)
  values (p_client, 'hold', case when v_enforced then -p_amount else 0 end, public.credit_available(p_client), v_hold, p_user, p_video, p_version,
          case when v_enforced then null else 'Crédits non appliqués : montant tracé sans débit' end);
  return v_hold;
end $$;

create or replace function public.credit_capture(p_hold uuid) returns void language plpgsql security definer set search_path = '' as $$
declare h public.credit_holds%rowtype;
begin
  update public.credit_holds set status = 'captured', settled_at = now() where id = p_hold and status = 'held' returning * into h;
  if not found then return; end if;  -- idempotent
  insert into public.credit_movements(client_id, type, amount_fcfa, available_after_fcfa, hold_id, user_id, video_id, version_id, note)
  values (h.client_id, 'capture', 0, public.credit_available(h.client_id), h.id, h.user_id, h.video_id, h.version_id,
          case when h.kind = 'revision' then 'Modification débitée' else 'Vidéo livrée : débitée' end);
end $$;

create or replace function public.credit_release(p_hold uuid, p_note text default null) returns void language plpgsql security definer set search_path = '' as $$
declare h public.credit_holds%rowtype; a record;
begin
  update public.credit_holds set status = 'released', settled_at = now() where id = p_hold and status = 'held' returning * into h;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtext('rimco_credits:' || h.client_id::text));
  for a in select lot_id, amount_fcfa from public.credit_hold_allocations where hold_id = h.id loop
    update public.credit_lots set remaining_fcfa = remaining_fcfa + a.amount_fcfa where id = a.lot_id;
  end loop;
  insert into public.credit_movements(client_id, type, amount_fcfa, available_after_fcfa, hold_id, user_id, video_id, version_id, note)
  values (h.client_id, 'release', case when h.enforced then h.amount_fcfa else 0 end, public.credit_available(h.client_id), h.id, h.user_id, h.video_id, h.version_id, coalesce(p_note, 'Montant libéré'));
  perform public.credit_expire_due(h.client_id);  -- un montant rendu à un lot expiré expire aussitôt (tracé)
end $$;

create or replace function public.credit_topup(p_client uuid, p_kind text, p_amount numeric, p_expires_at timestamptz,
  p_invoice_ref text, p_payment_ref text, p_note text, p_actor uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_lot uuid; v_exp timestamptz; s public.client_billing_settings%rowtype;
begin
  if p_kind not in ('purchase','gift') or p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Recharge invalide';
  end if;
  if not exists(select 1 from public.profiles where id = p_actor and role = 'operateur' and is_active) then
    raise exception using errcode = '42501', message = 'Recharge réservée à KÔMIAN';
  end if;
  select * into s from public.client_billing_settings where client_id = p_client;
  v_exp := coalesce(p_expires_at, now() + make_interval(months => case when p_kind = 'gift' then coalesce(s.gift_validity_months, 3) else coalesce(s.purchase_validity_months, 12) end));
  if v_exp <= now() then raise exception using errcode = '22023', message = 'La date d’expiration doit être dans le futur'; end if;
  perform pg_advisory_xact_lock(hashtext('rimco_credits:' || p_client::text));
  insert into public.credit_lots(client_id, kind, amount_fcfa, remaining_fcfa, expires_at, invoice_ref, payment_ref, note, created_by)
  values (p_client, p_kind, p_amount, p_amount, v_exp, nullif(trim(p_invoice_ref), ''), nullif(trim(p_payment_ref), ''), nullif(trim(p_note), ''), p_actor)
  returning id into v_lot;
  insert into public.credit_movements(client_id, type, amount_fcfa, available_after_fcfa, lot_id, note, created_by)
  values (p_client, case when p_kind = 'gift' then 'gift' else 'topup' end, p_amount, public.credit_available(p_client), v_lot, nullif(trim(p_note), ''), p_actor);
  return v_lot;
end $$;

-- Correction (toujours à la baisse ; une correction à la hausse = un crédit offert) et prolongation
create or replace function public.credit_adjust(p_lot uuid, p_amount numeric, p_note text, p_actor uuid) returns void language plpgsql security definer set search_path = '' as $$
declare lot public.credit_lots%rowtype;
begin
  if p_amount is null or p_amount <= 0 or length(trim(coalesce(p_note, ''))) = 0 then
    raise exception using errcode = '22023', message = 'Correction invalide : montant positif et motif obligatoires';
  end if;
  if not exists(select 1 from public.profiles where id = p_actor and role = 'operateur' and is_active) then
    raise exception using errcode = '42501', message = 'Correction réservée à KÔMIAN';
  end if;
  select * into lot from public.credit_lots where id = p_lot for update;
  if not found or lot.remaining_fcfa < p_amount then raise exception using errcode = '22023', message = 'Montant supérieur au reste du lot'; end if;
  update public.credit_lots set remaining_fcfa = remaining_fcfa - p_amount where id = p_lot;
  insert into public.credit_movements(client_id, type, amount_fcfa, available_after_fcfa, lot_id, note, created_by)
  values (lot.client_id, 'adjustment', -p_amount, public.credit_available(lot.client_id), p_lot, p_note, p_actor);
end $$;

create or replace function public.credit_extend(p_lot uuid, p_expires_at timestamptz, p_note text, p_actor uuid) returns void language plpgsql security definer set search_path = '' as $$
declare lot public.credit_lots%rowtype;
begin
  if not exists(select 1 from public.profiles where id = p_actor and role = 'operateur' and is_active) then
    raise exception using errcode = '42501', message = 'Prolongation réservée à KÔMIAN';
  end if;
  select * into lot from public.credit_lots where id = p_lot for update;
  if not found or lot.expires_at <= now() or p_expires_at <= lot.expires_at then
    raise exception using errcode = '22023', message = 'Seul un lot non expiré peut être prolongé, vers une date plus lointaine';
  end if;
  update public.credit_lots set expires_at = p_expires_at where id = p_lot;
  insert into public.credit_movements(client_id, type, amount_fcfa, available_after_fcfa, lot_id, note, created_by)
  values (lot.client_id, 'extension', 0, public.credit_available(lot.client_id), p_lot,
          coalesce(nullif(trim(p_note), ''), 'Expiration prolongée au ' || to_char(p_expires_at, 'DD/MM/YYYY')), p_actor);
end $$;

-- Règlement automatique, quel que soit le parcours qui change l'état de la vidéo
create or replace function public.settle_video_credits() returns trigger language plpgsql security definer set search_path = '' as $$
declare h record;
begin
  if tg_op = 'DELETE' then
    for h in select id from public.credit_holds where video_id = old.id and status = 'held' loop
      perform public.credit_release(h.id, 'Lancement interrompu : montant libéré');
    end loop;
    return old;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status in ('ready','approved') then
    for h in select id from public.credit_holds where video_id = new.id and status = 'held' loop perform public.credit_capture(h.id); end loop;
  elsif new.status in ('failed','cancelled') then
    for h in select id from public.credit_holds where video_id = new.id and status = 'held' loop
      perform public.credit_release(h.id, case when new.status = 'failed' then 'Vidéo en échec : montant libéré' else 'Vidéo annulée : montant libéré' end);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists videos_settle_credits on public.videos;
create trigger videos_settle_credits after update of status on public.videos for each row execute function public.settle_video_credits();
drop trigger if exists videos_release_credits_on_delete on public.videos;
create trigger videos_release_credits_on_delete before delete on public.videos for each row execute function public.settle_video_credits();

do $$ declare f text; begin
  foreach f in array array[
    'credit_hold(uuid,uuid,uuid,uuid,text,numeric,text)','credit_capture(uuid)','credit_release(uuid,text)',
    'credit_topup(uuid,text,numeric,timestamptz,text,text,text,uuid)','credit_adjust(uuid,numeric,text,uuid)',
    'credit_extend(uuid,timestamptz,text,uuid)','credit_expire_due(uuid)','credit_available(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Lecture (aucune écriture directe depuis le navigateur)
alter table public.clients enable row level security;
alter table public.client_billing_settings enable row level security;
alter table public.credit_lots enable row level security;
alter table public.credit_holds enable row level security;
alter table public.credit_hold_allocations enable row level security;
alter table public.credit_movements enable row level security;
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated using (id = public.my_client_id() or public.is_operator());
drop policy if exists billing_settings_read on public.client_billing_settings;
create policy billing_settings_read on public.client_billing_settings for select to authenticated using (client_id = public.my_client_id() or public.is_operator());
drop policy if exists credit_lots_read on public.credit_lots;
create policy credit_lots_read on public.credit_lots for select to authenticated using (public.is_operator() or (public.is_admin() and client_id = public.my_client_id()));
drop policy if exists credit_holds_read on public.credit_holds;
create policy credit_holds_read on public.credit_holds for select to authenticated using (public.is_operator() or (client_id = public.my_client_id() and (public.is_admin() or user_id = auth.uid())));
drop policy if exists credit_movements_read on public.credit_movements;
create policy credit_movements_read on public.credit_movements for select to authenticated using (public.is_operator() or (client_id = public.my_client_id() and (public.is_admin() or user_id = auth.uid())));
```

**Testé le 27/10 [vérifié]** sur Postgres 16, après le `setup.sql` du repo (schémas `auth` et `storage` simulés), en partant d'un état bêta (un admin, un valideur, un collaborateur) :
- **Migration** : appliquée deux fois sans erreur.
- **Rôles** : l'admin devient `operateur` ; le valideur devient `collaborateur` avec `can_validate` ; le dernier opérateur ne peut pas être rétrogradé ; un nouveau compte est collaborateur.
- **Admin client** : il ne voit pas le compte opérateur, ne peut pas promouvoir un compte en opérateur (refusé par les règles d'accès) et ne peut pas désactiver l'opérateur (aucune ligne modifiée).
- **Crédits** : recharge de 30 000 et offre de 10 000 FCFA ; consommation dans l'ordre d'expiration ; blocage idempotent ; refus `CREDIT_INSUFFICIENT:2000` ; débit quand la vidéo est prête ; libération en cas d'échec et de suppression ; expiration tracée.
- **Droits des fonctions** : refusées pour le rôle `authenticated` ; recharge refusée si l'auteur n'est pas opérateur.

**À vérifier [supposé]** : le nom réel de la contrainte de rôle (`profiles_role_check`, nom par défaut de Postgres) dans le projet Supabase, et la compatibilité de `make_interval(months => …)` avec la version de Postgres du projet.

### 4.2 Module `src/core/billing/credits.ts`

```ts
import type { createStorageAdminClient } from '@/core/storage/supabase';
import { HttpError } from '@/core/auth/guards';
import { formatFcfa } from '@/core/pricing';

type AdminClient = ReturnType<typeof createStorageAdminClient>;

/** Montant manquant si l'erreur SQL est un refus pour solde insuffisant, sinon null. */
export function insufficientCreditAmount(error: unknown): number | null {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  const match = /^CREDIT_INSUFFICIENT:(\d+(?:\.\d+)?)$/.exec(message);
  return match ? Math.ceil(Number(match[1])) : null;
}

export function insufficientCreditMessage(missingFcfa: number, isClientAdmin: boolean): string {
  return `Solde insuffisant : il manque ${formatFcfa(missingFcfa)} pour lancer cette vidéo. `
    + (isClientAdmin ? 'Contactez KÔMIAN pour recharger vos crédits.' : 'Contactez votre administrateur RIMCO Studio.');
}

/** Bloque le prix d'une vidéo ou d'une modification. Idempotent sur `key`. Lève une 402 si le solde ne suffit pas. */
export async function holdCredits(admin: AdminClient, input: {
  clientId: string; userId: string; videoId: string; versionId: string;
  kind: 'video' | 'revision'; amountFcfa: number; key: string; isClientAdmin: boolean;
}): Promise<string> {
  if (!Number.isFinite(input.amountFcfa) || input.amountFcfa <= 0) throw new Error('Montant de crédits invalide.');
  const { data, error } = await admin.rpc('credit_hold', {
    p_client: input.clientId, p_user: input.userId, p_video: input.videoId, p_version: input.versionId,
    p_kind: input.kind, p_amount: Math.ceil(input.amountFcfa), p_key: input.key,
  });
  const missing = insufficientCreditAmount(error);
  if (missing !== null) throw new HttpError(402, insufficientCreditMessage(missing, input.isClientAdmin));
  if (error || !data) throw new HttpError(503, 'Impossible de réserver les crédits. Réessayez dans un instant.');
  return data as string;
}

export async function creditSummary(admin: AdminClient, clientId: string) {
  const [{ data: available }, { data: holds }, { data: lots }, { data: settings }] = await Promise.all([
    admin.rpc('credit_available', { p_client: clientId }),
    admin.from('credit_holds').select('amount_fcfa').eq('client_id', clientId).eq('status', 'held').eq('enforced', true),
    admin.from('credit_lots').select('remaining_fcfa,expires_at').eq('client_id', clientId).gt('remaining_fcfa', 0).gt('expires_at', new Date().toISOString()).order('expires_at').limit(1),
    admin.from('client_billing_settings').select('credits_enforced,low_balance_threshold_fcfa').eq('client_id', clientId).maybeSingle(),
  ]);
  return {
    availableFcfa: Number(available ?? 0),
    heldFcfa: (holds ?? []).reduce((sum, row) => sum + Number(row.amount_fcfa), 0),
    nextExpiry: lots?.[0] ? { amountFcfa: Number(lots[0].remaining_fcfa), at: lots[0].expires_at as string } : null,
    enforced: Boolean(settings?.credits_enforced),
    lowBalance: Number(available ?? 0) < Number(settings?.low_balance_threshold_fcfa ?? 0),
  };
}
```

Tests Vitest à écrire (`credits.test.ts`) : analyse du message `CREDIT_INSUFFICIENT` ; message différent pour un admin client et pour un collaborateur ; montant arrondi au FCFA supérieur ; refus d'un montant nul.

### 4.3 Points d'intégration

| Où | Modification |
|---|---|
| `core/auth/guards.ts` | `Role` = `'collaborateur' \| 'admin' \| 'operateur'`. `Actor` reçoit `clientId` et `canValidate`. Fonctions : `isOperator(actor)` (rôle `operateur`), `hasAdminRights(actor)` (`admin` ou `operateur`), `canValidate(actor)` (`hasAdminRights` ou `can_validate`), `requireOperator()`. |
| `core/versions/storyboard-live.ts` (après l'insertion de la version, l. 290, avant `reserveGenerationCost`) | Si `!isOperator(actor)` : `holdCredits(… kind: 'video', amountFcfa: priceFcfa, key: 'video:' + version.id)`. Si la réservation est refusée, la vidéo est supprimée, comme dans les autres erreurs. Faire de même dans `photo-fidelity.ts` et dans `live.ts` (parcours historique). |
| Avant la création de la vidéo | Vérifier le solde au préalable (`creditSummary`) pour refuser vite, sans créer de ligne. La vérification qui fait foi reste `credit_hold`. |
| `api/storyboard/suggest/route.ts` | Si les crédits sont appliqués et que le disponible est inférieur au prix minimal (Standard, durée la plus courte) : 402, pour ne pas payer un storyboard qui ne pourra pas être lancé. |
| `core/versions/shot-review.ts` | La limite vient de `client_billing_settings.human_revisions_per_shot` (au lieu de `HUMAN_REVISIONS_PER_SHOT`). Si `revision_price_fcfa > 0` : `holdCredits(kind: 'revision', key: 'revision:' + versionId + ':' + shot + ':' + n)`, débité à la livraison de la vidéo par le déclencheur. |
| `core/versions/review-details.ts` | Prix barré et « (non facturé) » si la modification est incluse, sinon le prix paramétré (corrige C2, code au § 4.4). Les dollars sont réservés à l'opérateur. |
| Règlement | Le déclencheur SQL `videos_settle_credits` traite tous les parcours : prête = débit ; échec ou annulation = libération ; suppression = libération. Aucun code applicatif à modifier pour cela. |
| `api/cron/reconcile/route.ts` | Ajouter `credit_expire_due()` et les alertes d'expiration (lots qui expirent dans les N jours, une notification par lot). |
| Alerte de solde bas | Après chaque `holdCredits` : si le disponible passe sous le seuil, `notify` l'admin client et les opérateurs avec la clé de déduplication `credit_low:<client>:<lot de la dernière recharge>`. Ajouter les types `credit_low` et `credit_expiring` à la contrainte de `notifications.type`. |
| Nouvelles routes | `GET /api/credits` (résumé et historique, filtré selon le rôle), `GET /api/credits/export` (CSV, admin client et opérateur), `POST /api/operator/credits` (recharge ou offre), `PATCH /api/operator/credits/[lotId]` (correction ou prolongation), `GET/PATCH /api/operator/billing-settings`. |
| Interface | Pastille du solde dans le Studio et bouton de lancement désactivé avec le montant manquant ; page « Crédits » (tous) ; onglet « Clients et crédits » dans Admin (opérateur) ; `/couts`, Modèles, Connexion fal, Comparaison et Stockage réservés à l'opérateur. |
| `AdminCenter.tsx` / Équipe | Rôle : Collaborateur, Administrateur (et Opérateur KÔMIAN, proposé seulement à un opérateur) ; case « Peut valider » ; colonne Département masquée ; les comptes opérateur sont invisibles pour l'admin client. |

## 5. Plan par lots

| Lot | Contenu | Étape | Statut qui évolue | Effort |
|---|---|---|---|---|
| L1 | Déconnexion, page mot de passe oublié publique, fin de l'auto-approbation admin, vérification de l'inscription publique | 8 et socle | Valideur RIMCO conforme à la règle n° 7 | S |
| L2 | Rôles : valideur devient un droit, indicateur opérateur, plus de filtre par département, coûts réservés à l'opérateur | 8 et socle | Supabase Auth : À étendre | M |
| L3 | Crédits, socle : migration 0038, `credits.ts`, blocage au lancement, déclencheur, pastille du solde, message de solde insuffisant (crédits non appliqués par défaut) | 8 | Journal des coûts : À étendre (côté client) | M |
| L4 | Écrans crédits : historique et CSV côté client ; recharge, offre, correction, prolongation et réglages côté opérateur | 8 | Tableau de consommation : À étendre | M |
| L5 | Alertes de solde bas et d'expiration dans l'application, modifications paramétrables (prix et nombre), nettoyage des marges héritées (C3) | 8 | — | S à M |
| L6 | Comptes sans e-mail : mot de passe généré côté serveur, changement imposé à la première connexion, réinitialisation par l'admin (§ 4.4) | socle | Supabase Auth : À étendre | S |
| Plus tard | Service d'envoi d'e-mails (invitations, alertes, validation demandée), quand l'équipe le décidera | socle | notifications | M |

**Mise en service des crédits** : déployer L3 avec les crédits non appliqués ; vérifier quelques jours que les blocages, débits et libérations tracés correspondent bien aux vidéos ; faire la première recharge ; activer le réglage.

### 4.4 Compléments décidés le 27/10 (deuxième série)

**a) Prix des relances barré, avec « (non facturé) » (C2).**

Le type, dans `src/core/verification/loop.ts` (l. 229 et 237) : ajouter `billed: boolean` à `cost` et aux deux options de `clipOptions`.

```ts
cost?: { fcfa: number; usd?: number; minutes: number; billed: boolean };
```

Le serveur, dans `src/core/versions/review-details.ts` : le rôle est remplacé par `showUsd` (opérateur seulement) et le prix paramétré est ajouté.

```ts
/** Prix d'une modification humaine : `revisionPriceFcfa` > 0 = facturée à ce prix ; sinon le montant indicatif est
 * affiché barré, « non facturé ». Les dollars ne partent que vers l'opérateur KÔMIAN. */
export function relaunchCost(input: { brief: Record<string, unknown>; showUsd: boolean; usdToEur: number; eurToFcfa: number; revisionPriceFcfa: number }) {
  const usd = relaunchCostUsd(input.brief);
  const billed = input.revisionPriceFcfa > 0;
  return {
    fcfa: billed ? input.revisionPriceFcfa : calculateClientPriceFcfa(usd, input.usdToEur, input.eurToFcfa),
    billed, minutes: RELAUNCH_MINUTES, ...(input.showUsd ? { usd } : {}),
  };
}
```

Appliquer la même règle dans `inFcfa`, pour `clipOptions`. `decorateReviewRequests` et `decorateKeyframeBoard` reçoivent `showUsd: isOperator(actor)` et `revisionPriceFcfa` (lu dans `client_billing_settings`) à la place de `role`. Il faut l'adapter dans `api/versions/[id]/refresh/route.ts` (l. 32 et 35).

L'affichage, dans `src/components/shot-review-panel.tsx` : un composant remplace la fonction texte `relaunchCostText`.

```tsx
/** Coût d'une modification : barré et « (non facturé) » quand elle est incluse ; dollars pour l'opérateur seulement. */
export function RelaunchCost({ cost }: { cost: NonNullable<ReviewRequest["cost"]> }) {
  const usd = cost.usd != null ? ` · coût réel ${cost.usd.toFixed(2).replace(".", ",")} $` : "";
  return (
    <>
      {cost.billed
        ? <>environ {formatFcfa(cost.fcfa)}</>
        : <><s className="text-[#8a8990]" aria-label={`${formatFcfa(cost.fcfa)}, non facturé`}>{formatFcfa(cost.fcfa)}</s> (non facturé)</>}
      {usd}, environ {cost.minutes} min
    </>
  );
}
```

Remplacements, en gardant le texte existant autour :
- `shot-review-panel.tsx` l. 73 : `Coût de la correction : <RelaunchCost cost={cost} />.`
- `shot-review-panel.tsx` l. 269 : `{item.cost ? <> ; <RelaunchCost cost={item.cost} /></> : null}`
- `keyframe-board.tsx` l. 127 : `{shot.cost ? <> ; <RelaunchCost cost={shot.cost} /></> : null}` (mettre à jour l'import l. 6).

Tests : relance incluse, avec le prix barré et « (non facturé) » ; relance payante, avec « environ X FCFA » non barré ; dollars absents pour un admin client et présents pour un opérateur.

**b) Tarif Pro distinct (C1).** Dans `src/core/pricing.ts` :

```ts
export function estimateGridPriceFcfa(seconds: number, tier: Tier, grid: { standard: number; pro?: number | null; premium: number }): number {
  assertPositive(seconds, 'La durée');
  assertNonNegative(grid.standard, 'Le tarif Standard');
  assertNonNegative(grid.premium, 'Le tarif Premium');
  if (grid.pro != null) assertNonNegative(grid.pro, 'Le tarif Pro');
  // Sans tarif Pro renseigné, le Pro reste au tarif Premium (comportement d'avant le 27/10).
  const pricePerSecond = tier === 'standard' ? grid.standard : tier === 'pro' && grid.pro != null ? grid.pro : grid.premium;
  return Math.round(seconds * pricePerSecond);
}
```

Lire `grid_fcfa_per_second_pro` et le transmettre comme `pro` dans `storyboard-live.ts` (l. 247-250), `live.ts` (l. 130) et `api/models/available/route.ts` (l. 27). Ajouter le champ Pro à l'écran des réglages de l'opérateur. La migration 0038 crée la colonne et la pré-remplit avec le tarif Premium : aucun prix ne change avant que KÔMIAN règle le tarif Pro. Tests : Pro avec un tarif Pro ; Pro sans tarif Pro (retour au tarif Premium) ; Standard et Premium inchangés.

**c) Comptes sans service d'envoi.** On garde le parcours actuel, où l'admin crée l'accès et Supabase stocke le compte, avec trois renforts :
1. **Mot de passe généré par le serveur** (`api/admin/users`, POST), et non plus dans le navigateur (`AdminCenter.tsx` l. 11). Il est renvoyé une seule fois dans `temporaryPassword`, que l'écran lit déjà.
2. **Changement imposé à la première connexion.** À la création, `app_metadata: { must_change_password: true }` : l'utilisateur ne peut pas modifier lui-même ce champ. Après `signInWithPassword`, si l'indicateur est présent, `LoginForm.tsx` affiche le formulaire « Nouveau mot de passe », qui existe déjà pour `firstAccess`. Une route `POST /api/me/password-changed` (client service role, session vérifiée) retire ensuite l'indicateur. Tant qu'il est présent, `getActor()` renvoie 403 « Choisissez votre mot de passe pour continuer » sur toutes les routes, sauf `/api/me`.
3. **« Réinitialiser le mot de passe » dans Équipe** (admin) : `auth.admin.updateUserById(id, { password, app_metadata: { must_change_password: true } })`, avec un nouveau mot de passe provisoire affiché une fois.

À vérifier dans le tableau de bord Supabase [supposé] : « Mot de passe oublié » s'appuie sur l'envoi intégré de Supabase. Ce service est prévu pour les tests : il est limité à quelques e-mails par heure (limite déjà atteinte, `DECISIONS.md` l. 626) et peut être réservé aux adresses de l'équipe Supabase. La réinitialisation par l'admin (point 3) est donc le recours fiable tant qu'aucun service d'envoi n'est choisi.

## 6. Décisions

Toutes les questions de cette proposition sont tranchées (§ 0). Reste pour plus tard : **le service d'envoi d'e-mails**, quand l'équipe le décidera. Il faudra alors un fournisseur, un domaine d'envoi vérifié (SPF, DKIM) et le même fournisseur configuré comme SMTP de Supabase Auth.

| Option | Pour | Contre |
|---|---|---|
| Resend | Simple, bonne intégration Next.js | Service américain |
| Brevo | Société française, interface en français, e-mails et SMS | API moins orientée développeurs |
| Postmark | Très bonne délivrabilité des e-mails transactionnels | Pas d'offre gratuite durable |

Les tarifs et quotas sont à vérifier au moment du choix.
