-- 0041_roles_operator.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Rôles du 27/10 (docs/specs/ROLES-CREDITS-2026-10-27.md) :
--   collaborateur · admin (administrateur du client) · operateur (KÔMIAN, rôle à part entière).
--   Valider devient un droit (profiles.can_validate). Plus aucun filtrage par département.
-- Hypothèse de la bêta, confirmée par l'équipe : les administrateurs actuels sont des membres KÔMIAN ;
-- ils deviennent opérateurs (une seule fois). L'opérateur repasse ensuite le référent RIMCO en Administrateur.

-- 1. Clients : un client (RIMCO Motors) possède ses marques et, plus tard, un solde de crédits unique.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.clients(name) values ('RIMCO Motors') on conflict (name) do nothing;
alter table public.brands add column if not exists client_id uuid references public.clients(id);
update public.brands set client_id = (select id from public.clients where name = 'RIMCO Motors') where client_id is null;

-- 2. Droit de valider.
alter table public.profiles add column if not exists can_validate boolean not null default false;

-- 3. Le garde-fou protège le dernier OPÉRATEUR actif. Remplacé avant les changements de rôle ci-dessous.
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
revoke all on function public.guard_last_active_admin() from public, anon, authenticated;

-- 4. Conversion des rôles (une seule fois pour les admins : seulement s'il n'existe encore aucun opérateur).
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set can_validate = true, role = 'collaborateur' where role = 'valideur';
update public.profiles set role = 'operateur'
  where role = 'admin' and not exists (select 1 from public.profiles where role = 'operateur');
alter table public.profiles add constraint profiles_role_check check (role in ('collaborateur','admin','operateur'));

-- 5. Fonctions d'accès. L'opérateur hérite de toutes les règles « admin » existantes.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operateur') and p.is_active)
$$;
create or replace function public.is_operator() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operateur' and p.is_active)
$$;
create or replace function public.my_client_id() returns uuid language sql stable security definer set search_path = '' as $$
  select b.client_id from public.profiles p join public.brands b on b.id = p.brand_id where p.id = auth.uid() and p.is_active
$$;
-- Une marque appartient-elle au client de la personne connectée ? (sa propre marque, ou une marque du même client)
create or replace function public.in_my_client(p_brand uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select p_brand is not null and exists(
    select 1 from public.profiles p
    join public.brands mine on mine.id = p.brand_id
    join public.brands target on target.id = p_brand
    where p.id = auth.uid() and p.is_active
      and (target.id = mine.id or (target.client_id is not null and target.client_id = mine.client_id)))
$$;
-- Peut-elle valider des vidéos ? (administrateur, opérateur, ou collaborateur avec le droit)
create or replace function public.can_validate_videos() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active and (p.role in ('admin','operateur') or p.can_validate))
$$;
revoke all on function public.is_operator() from public, anon;
revoke all on function public.my_client_id() from public, anon;
revoke all on function public.in_my_client(uuid) from public, anon;
revoke all on function public.can_validate_videos() from public, anon;
grant execute on function public.is_operator() to authenticated, service_role;
grant execute on function public.my_client_id() to authenticated, service_role;
grant execute on function public.in_my_client(uuid) to authenticated, service_role;
grant execute on function public.can_validate_videos() to authenticated, service_role;

-- 6. Base vide : le premier compte devient opérateur KÔMIAN.
create or replace function public.create_profile_for_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare first_brand uuid; new_role text;
begin
  perform pg_advisory_xact_lock(hashtext('rimco_first_admin'));
  select b.id into first_brand from public.brands b order by b.created_at limit 1;
  new_role := case when exists(select 1 from public.profiles p where p.role = 'operateur') then 'collaborateur' else 'operateur' end;
  insert into public.profiles(id,name,role,brand_id) values(new.id,coalesce(new.raw_user_meta_data->>'name',''),new_role,first_brand);
  return new;
end $$;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

-- 7. Profils : un administrateur client ne voit ni ne crée, modifie ou promeut un compte opérateur.
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_operator() or (public.is_admin() and role <> 'operateur' and public.in_my_client(brand_id)));
drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles for all to authenticated
  using (public.is_operator() or (public.is_admin() and role <> 'operateur' and public.in_my_client(brand_id)))
  with check (public.is_operator() or (public.is_admin() and role <> 'operateur' and public.in_my_client(brand_id)));

-- 8. Vidéos, versions, validations : sans département ; le valideur et l'administrateur restent dans leur client.
drop policy if exists videos_read on public.videos;
create policy videos_read on public.videos for select to authenticated using (
  user_id = auth.uid() or public.is_operator()
  or (public.is_admin() and public.in_my_client(brand_id))
  or (status = 'review' and public.can_validate_videos() and public.in_my_client(brand_id)));
drop policy if exists versions_read on public.video_versions;
create policy versions_read on public.video_versions for select to authenticated using (exists(
  select 1 from public.videos v where v.id = video_id and (
    v.user_id = auth.uid() or public.is_operator()
    or (public.is_admin() and public.in_my_client(v.brand_id))
    or (v.status = 'review' and public.can_validate_videos() and public.in_my_client(v.brand_id)))));
drop policy if exists validations_read on public.validations;
create policy validations_read on public.validations for select to authenticated using (
  public.is_operator() or submitted_by = auth.uid() or exists(
    select 1 from public.videos v where v.id = validations.video_id and public.in_my_client(v.brand_id)
      and (public.is_admin() or (validations.status = 'pending' and public.can_validate_videos()))));
drop policy if exists validations_validator_review on public.validations;
create policy validations_validator_review on public.validations for update to authenticated
  using (status = 'pending' and public.can_validate_videos() and exists(select 1 from public.videos v where v.id = validations.video_id and public.in_my_client(v.brand_id)))
  with check (reviewed_by = auth.uid() and status in ('approved','rejected') and reviewed_at is not null);

-- 9. Coûts de production, modèles, comparaisons, tarifs : opérateur KÔMIAN uniquement (lecture des tarifs : tout le monde).
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
alter table public.clients enable row level security;
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated using (id = public.my_client_id() or public.is_operator());

-- 10. Fichiers vidéo : l'aperçu « en validation » suit le droit de valider, dans le client, sans département.
drop policy if exists rimco_storage_read on storage.objects;
create policy rimco_storage_read on storage.objects for select to authenticated using(
  public.is_admin() or
  (bucket_id='brand' and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='brand' and exists(select 1 from public.assets a join public.profiles p on p.id=auth.uid() and p.brand_id=a.brand_id and p.is_active where a.path=name and a.kind='logo' and a.status='validée')) or
  (bucket_id in ('assets','audio') and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='assets' and exists(select 1 from public.assets a where a.path=name and a.status='validée')) or
  (bucket_id='audio' and exists(select 1 from public.assets a where a.path=name and a.kind='audio' and a.status='validée')) or
  (bucket_id='videos' and exists(select 1 from public.videos v join public.video_versions vv on vv.video_id=v.id where v.user_id=auth.uid() and v.status in ('approved','review') and vv.final_path=name)) or
  (bucket_id='videos' and public.can_validate_videos() and exists(select 1 from public.videos v join public.video_versions vv on vv.video_id=v.id where v.status='review' and public.in_my_client(v.brand_id) and vv.final_path=name))
);

notify pgrst, 'reload schema';
