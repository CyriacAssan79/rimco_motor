-- Retour arrière de 0041_roles_operator.sql (à appliquer APRÈS rollback/0042_down.sql s'il y a lieu).
-- Rôles d'avant le 27/10 : opérateur → admin, collaborateur avec droit de valider → valideur ; anciennes règles d'accès.
-- Ne fait pas partie de setup.sql. À coller seul dans l'éditeur SQL de Supabase, puis revenir au code précédent.
drop trigger if exists guard_last_active_admin_update on public.profiles;
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'admin' where role = 'operateur';
update public.profiles set role = 'valideur' where role = 'collaborateur' and can_validate;
alter table public.profiles add constraint profiles_role_check check (role in ('collaborateur','valideur','admin'));
create or replace function public.guard_last_active_admin() returns trigger language plpgsql security definer set search_path = '' as $$
declare active_admins integer;
begin
  if tg_op='DELETE' then
    if old.role='admin' and old.is_active then
      perform pg_advisory_xact_lock(hashtext('rimco_active_admin_roster'));
      select count(*) into active_admins from public.profiles p where p.role='admin' and p.is_active and p.id<>old.id;
      if active_admins=0 then raise exception using errcode='P0001', message='Impossible de supprimer le dernier administrateur actif'; end if;
    end if;
    return old;
  end if;
  if old.role='admin' and old.is_active and (new.role<>'admin' or not new.is_active) then
    perform pg_advisory_xact_lock(hashtext('rimco_active_admin_roster'));
    select count(*) into active_admins from public.profiles p where p.role='admin' and p.is_active and p.id<>old.id;
    if active_admins=0 then raise exception using errcode='P0001', message='Impossible de désactiver ou rétrograder le dernier administrateur actif'; end if;
  end if;
  return new;
end $$;
create trigger guard_last_active_admin_update before update of role,is_active on public.profiles for each row execute function public.guard_last_active_admin();
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active)
$$;
create or replace function public.create_profile_for_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare first_brand uuid; new_role text;
begin
  perform pg_advisory_xact_lock(hashtext('rimco_first_admin'));
  select b.id into first_brand from public.brands b order by b.created_at limit 1;
  new_role := case when exists(select 1 from public.profiles p where p.role = 'admin') then 'collaborateur' else 'admin' end;
  insert into public.profiles(id,name,role,brand_id) values(new.id,coalesce(new.raw_user_meta_data->>'name',''),new_role,first_brand);
  return new;
end $$;
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists videos_read on public.videos;
create policy videos_read on public.videos for select to authenticated using(user_id=auth.uid() or public.is_admin() or (status='review' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='valideur' and p.is_active and p.brand_id=videos.brand_id and p.department=videos.department)));
drop policy if exists versions_read on public.video_versions;
create policy versions_read on public.video_versions for select to authenticated using(exists(select 1 from public.videos v where v.id=video_id and (v.user_id=auth.uid() or public.is_admin() or (v.status='review' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='valideur' and p.is_active and p.brand_id=v.brand_id and p.department=v.department)))));
drop policy if exists validations_read on public.validations;
create policy validations_read on public.validations for select to authenticated using(public.is_admin() or submitted_by=auth.uid() or (status='pending' and exists(select 1 from public.profiles p join public.videos v on v.id=validations.video_id where p.id=auth.uid() and p.role='valideur' and p.is_active and p.brand_id=v.brand_id and p.department=v.department)));
drop policy if exists validations_validator_review on public.validations;
create policy validations_validator_review on public.validations for update to authenticated using(status='pending' and exists(select 1 from public.profiles p join public.videos v on v.id=validations.video_id where p.id=auth.uid() and p.role='valideur' and p.is_active and p.brand_id=v.brand_id and p.department=v.department)) with check(reviewed_by=auth.uid() and status in ('approved','rejected') and reviewed_at is not null);
drop policy if exists ledger_admin_read on public.usage_ledger;
create policy ledger_admin_read on public.usage_ledger for select to authenticated using(public.is_admin());
drop policy if exists models_admin_read on public.ai_models;
create policy models_admin_read on public.ai_models for select to authenticated using(public.is_admin());
drop policy if exists models_admin_manage on public.ai_models;
create policy models_admin_manage on public.ai_models for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists comparisons_admin_all on public.comparisons;
create policy comparisons_admin_all on public.comparisons for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists pricing_admin_manage on public.pricing_settings;
create policy pricing_admin_manage on public.pricing_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists rimco_storage_read on storage.objects;
create policy rimco_storage_read on storage.objects for select to authenticated using(
  public.is_admin() or
  (bucket_id='brand' and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='brand' and exists(select 1 from public.assets a join public.profiles p on p.id=auth.uid() and p.brand_id=a.brand_id and p.is_active where a.path=name and a.kind='logo' and a.status='validée')) or
  (bucket_id in ('assets','audio') and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='assets' and exists(select 1 from public.assets a where a.path=name and a.status='validée')) or
  (bucket_id='audio' and exists(select 1 from public.assets a where a.path=name and a.kind='audio' and a.status='validée')) or
  (bucket_id='videos' and exists(select 1 from public.videos v join public.video_versions vv on vv.video_id=v.id where v.user_id=auth.uid() and v.status in ('approved','review') and vv.final_path=name)) or
  (bucket_id='videos' and exists(select 1 from public.profiles p join public.videos v on v.brand_id=p.brand_id and v.department=p.department and v.status='review' join public.video_versions vv on vv.video_id=v.id where p.id=auth.uid() and p.role='valideur' and p.is_active and vv.final_path=name))
);
drop policy if exists clients_read on public.clients;
drop function if exists public.can_validate_videos();
drop function if exists public.in_my_client(uuid);
drop function if exists public.my_client_id();
drop function if exists public.is_operator();
-- Les colonnes can_validate et brands.client_id, et la table clients, sont conservées (sans effet sur l'ancien code).
notify pgrst, 'reload schema';
