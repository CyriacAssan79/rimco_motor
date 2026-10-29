-- RIMCO Studio initial schema. Safe to apply repeatedly on a clean or existing V1 database.
create extension if not exists pgcrypto;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  primary_color text not null default '#c51e1c', secondary_color text not null default '#831810',
  created_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '', role text not null default 'collaborateur' check (role in ('collaborateur','valideur','admin')),
  department text not null default '', brand_id uuid references public.brands(id),
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.pricing_settings (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null unique references public.brands(id) on delete cascade,
  grid_fcfa_per_second_standard numeric(12,2) not null default 460 check (grid_fcfa_per_second_standard >= 0),
  grid_fcfa_per_second_premium numeric(12,2) not null default 700 check (grid_fcfa_per_second_premium >= 0),
  updated_by uuid references public.profiles(id) on delete set null, updated_at timestamptz not null default now()
);
create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  tier text not null check (tier in ('standard','premium','test')), fal_endpoint_id text not null,
  adapter_family text not null, mode text not null check (mode in ('image_to_video','text_to_video')),
  price_usd_per_second numeric(12,6) not null check (price_usd_per_second >= 0),
  allowed_durations integer[] not null default '{5}', allowed_formats text[] not null default '{16:9,9:16,1:1,4:5}',
  is_active boolean not null default false, is_default boolean not null default false,
  constraint active_model_has_real_endpoint check (not is_active or fal_endpoint_id not like 'TODO%')
);
create unique index if not exists ai_models_one_default_per_tier on public.ai_models(tier) where is_default;
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(), brand_id uuid references public.brands(id) on delete cascade,
  kind text not null check (kind in ('vehicle','logo','audio')), make text, model text, color text,
  angle text, variant text, path text not null, status text not null default 'en_attente' check(status in ('en_attente','validée','rejetée')),
  review_reason text,
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.assets add column if not exists review_reason text;
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  brand_id uuid references public.brands(id), title text not null default 'Nouvelle vidéo', department text not null default '',
  status text not null default 'draft' check(status in ('draft','generating','ready','review','approved','rejected','failed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.video_versions (
  id uuid primary key default gen_random_uuid(), video_id uuid not null references public.videos(id) on delete cascade,
  number integer not null check(number > 0), brief_json jsonb not null default '{}', generated_prompt text not null default '',
  ai_model_id uuid references public.ai_models(id), provider_request_id text,
  status text not null default 'queued' check(status in ('queued','generating','postprocessing','ready','failed')),
  raw_path text, final_path text, overlay_variant text, audio_asset_id uuid references public.assets(id),
  generation_seconds integer not null default 5 check(generation_seconds = 5), error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(video_id,number)
);
create table if not exists public.validations (
  id uuid primary key default gen_random_uuid(), video_id uuid not null references public.videos(id) on delete cascade,
  version_id uuid not null references public.video_versions(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id), reviewed_by uuid references public.profiles(id),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reason text, created_at timestamptz not null default now(), reviewed_at timestamptz,
  constraint rejected_validation_requires_reason check(status <> 'rejected' or length(trim(coalesce(reason,''))) > 0)
);
create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(), version_id uuid references public.video_versions(id) on delete set null,
  user_id uuid not null references public.profiles(id), department text not null default '', ai_model_id uuid references public.ai_models(id),
  kind text not null check(kind in ('generation','postprod')), seconds numeric(10,3) not null check(seconds > 0),
  cost_usd numeric(14,6) not null default 0 check(cost_usd >= 0), cost_eur numeric(14,6) not null default 0 check(cost_eur >= 0),
  cost_real_fcfa numeric(14,2) not null default 0 check(cost_real_fcfa >= 0),
  applied_fcfa_per_second numeric(12,2) not null check(applied_fcfa_per_second >= 0),
  price_fcfa numeric(14,2) not null check(price_fcfa >= 0),
  status text not null check(status in ('reserved','charged','released')), created_at timestamptz not null default now()
);
create index if not exists usage_ledger_budget_idx on public.usage_ledger(status) where status in ('reserved','charged');
create table if not exists public.comparisons (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  brief_json jsonb not null, created_at timestamptz not null default now()
);

-- SECURITY DEFINER helpers have a fixed search_path and are not exposed as user-callable APIs.
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
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.create_profile_for_new_user();

-- Serialize role changes/deletes that could remove the last active administrator.
create or replace function public.guard_last_active_admin() returns trigger language plpgsql security definer set search_path = '' as $$
declare active_admins integer;
begin
  if tg_op='DELETE' then
    if old.role='admin' and old.is_active then
      perform pg_advisory_xact_lock(hashtext('rimco_active_admin_roster'));
      select count(*) into active_admins from public.profiles p where p.role='admin' and p.is_active and p.id<>old.id;
      if active_admins=0 then
        raise exception using errcode='P0001', message='Impossible de supprimer le dernier administrateur actif';
      end if;
    end if;
    return old;
  end if;
  if old.role='admin' and old.is_active and (new.role<>'admin' or not new.is_active) then
    perform pg_advisory_xact_lock(hashtext('rimco_active_admin_roster'));
    select count(*) into active_admins from public.profiles p where p.role='admin' and p.is_active and p.id<>old.id;
    if active_admins=0 then
      raise exception using errcode='P0001', message='Impossible de désactiver ou rétrograder le dernier administrateur actif';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_last_active_admin() from public, anon, authenticated;
drop trigger if exists guard_last_active_admin_update on public.profiles;
drop trigger if exists guard_last_active_admin_delete on public.profiles;
create trigger guard_last_active_admin_update before update of role,is_active on public.profiles for each row execute function public.guard_last_active_admin();
create trigger guard_last_active_admin_delete before delete on public.profiles for each row execute function public.guard_last_active_admin();

-- Only service_role may reserve budget. Advisory transaction lock serializes concurrent reservations;
-- the authenticated caller identity and all pricing inputs are supplied by trusted server code.
create or replace function public.reserve_budget(
  p_user_id uuid,p_version_id uuid,p_model_id uuid,p_seconds numeric,p_price_usd_second numeric,
  p_usd_to_eur numeric,p_eur_to_fcfa numeric,p_price_fcfa numeric,p_cap_eur numeric,
  p_department text,p_applied_fcfa_second numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare entry_id uuid; estimated_usd numeric; estimated_eur numeric;
begin
  if p_seconds is null or p_seconds <= 0 or p_price_usd_second is null or p_price_usd_second < 0
    or p_usd_to_eur is null or p_usd_to_eur <= 0 or p_eur_to_fcfa is null or p_eur_to_fcfa <= 0
    or p_cap_eur is null or p_cap_eur < 0 or p_price_fcfa is null or p_price_fcfa < 0
    or p_applied_fcfa_second is null or p_applied_fcfa_second < 0 then
    raise exception using errcode='22023', message='Paramètres de réservation invalides';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id and p.is_active)
    or not exists(select 1 from public.video_versions vv join public.videos v on v.id=vv.video_id where vv.id=p_version_id and v.user_id=p_user_id)
    or not exists(select 1 from public.ai_models m where m.id=p_model_id and m.is_active) then
    raise exception using errcode='22023', message='Réservation impossible pour cette version';
  end if;
  estimated_usd := p_seconds * p_price_usd_second;
  estimated_eur := estimated_usd * p_usd_to_eur;
  perform pg_advisory_xact_lock(hashtext('rimco_budget_cap_eur'));
  if coalesce((select sum(l.cost_eur) from public.usage_ledger l where l.status in ('reserved','charged')),0) + estimated_eur > p_cap_eur then
    raise exception using errcode='P0001', message='Plafond de coût réel dépassé';
  end if;
  insert into public.usage_ledger(version_id,user_id,department,ai_model_id,kind,seconds,cost_usd,cost_eur,cost_real_fcfa,applied_fcfa_per_second,price_fcfa,status)
  values(p_version_id,p_user_id,coalesce(p_department,''),p_model_id,'generation',p_seconds,estimated_usd,estimated_eur,estimated_eur*p_eur_to_fcfa,p_applied_fcfa_second,p_price_fcfa,'reserved') returning id into entry_id;
  return entry_id;
end $$;
revoke all on function public.reserve_budget(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric) from public, anon, authenticated;
grant execute on function public.reserve_budget(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric) to service_role;

-- Finalize a reservation exactly once. Actual charges cannot silently push the account over its cap.
create or replace function public.settle_budget(p_entry_id uuid,p_outcome text,p_actual_cost_usd numeric,p_usd_to_eur numeric,p_eur_to_fcfa numeric,p_cap_eur numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare entry public.usage_ledger%rowtype; final_eur numeric; final_usd numeric;
begin
  if p_outcome not in ('charged','released') or p_cap_eur is null or p_cap_eur < 0
    or p_usd_to_eur is null or p_usd_to_eur <= 0 or p_eur_to_fcfa is null or p_eur_to_fcfa <= 0
    or (p_outcome='charged' and (p_actual_cost_usd is null or p_actual_cost_usd < 0)) then
    raise exception using errcode='22023', message='Paramètres de clôture invalides';
  end if;
  perform pg_advisory_xact_lock(hashtext('rimco_budget_cap_eur'));
  select * into entry from public.usage_ledger where id=p_entry_id for update;
  if not found or entry.status <> 'reserved' then
    raise exception using errcode='P0001', message='Réservation introuvable ou déjà clôturée';
  end if;
  if p_outcome='released' then
    update public.usage_ledger set status='released' where id=p_entry_id;
    return;
  end if;
  final_usd := p_actual_cost_usd;
  final_eur := final_usd * p_usd_to_eur;
  if coalesce((select sum(l.cost_eur) from public.usage_ledger l where l.status in ('reserved','charged') and l.id<>p_entry_id),0)+final_eur > p_cap_eur then
    raise exception using errcode='P0001', message='Le coût réel dépasserait le plafond autorisé';
  end if;
  update public.usage_ledger set status='charged',cost_usd=final_usd,cost_eur=final_eur,cost_real_fcfa=final_eur*p_eur_to_fcfa where id=p_entry_id;
end $$;
revoke all on function public.settle_budget(uuid,text,numeric,numeric,numeric,numeric) from public, anon, authenticated;
grant execute on function public.settle_budget(uuid,text,numeric,numeric,numeric,numeric) to service_role;

-- A pending item is visible to active validators for review. Admins manage all state;
-- ordinary clients cannot write processing state, ledger rows, or role assignments.
do $$ declare t text; begin foreach t in array array['brands','pricing_settings','profiles','ai_models','assets','videos','video_versions','validations','usage_ledger','comparisons'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists brands_read_authenticated on public.brands;
create policy brands_read_authenticated on public.brands for select to authenticated using(true);
drop policy if exists brands_admin_manage on public.brands;
create policy brands_admin_manage on public.brands for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists pricing_read_authenticated on public.pricing_settings;
create policy pricing_read_authenticated on public.pricing_settings for select to authenticated using(true);
drop policy if exists pricing_admin_manage on public.pricing_settings;
create policy pricing_admin_manage on public.pricing_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists models_read_authenticated on public.ai_models;
drop policy if exists models_admin_read on public.ai_models;
create policy models_admin_read on public.ai_models for select to authenticated using(public.is_admin());
drop policy if exists models_admin_manage on public.ai_models;
create policy models_admin_manage on public.ai_models for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists assets_read on public.assets;
create policy assets_read on public.assets for select to authenticated using(created_by=auth.uid() or public.is_admin() or (status='validée' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.brand_id=assets.brand_id)));
drop policy if exists assets_insert_self on public.assets;
create policy assets_insert_self on public.assets for insert to authenticated with check(created_by=auth.uid() and status='en_attente');
drop policy if exists assets_admin_manage on public.assets;
create policy assets_admin_manage on public.assets for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists videos_read on public.videos;
create policy videos_read on public.videos for select to authenticated using(user_id=auth.uid() or public.is_admin() or (status='review' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='valideur' and p.is_active and p.brand_id=videos.brand_id and p.department=videos.department)));
drop policy if exists videos_insert_self on public.videos;
create policy videos_insert_self on public.videos for insert to authenticated with check(user_id=auth.uid() and status='draft');
drop policy if exists videos_admin_manage on public.videos;
create policy videos_admin_manage on public.videos for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists versions_read on public.video_versions;
create policy versions_read on public.video_versions for select to authenticated using(exists(select 1 from public.videos v where v.id=video_id and (v.user_id=auth.uid() or public.is_admin() or (v.status='review' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='valideur' and p.is_active and p.brand_id=v.brand_id and p.department=v.department)))));
drop policy if exists versions_admin_manage on public.video_versions;
create policy versions_admin_manage on public.video_versions for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists validations_read on public.validations;
create policy validations_read on public.validations for select to authenticated using(public.is_admin() or submitted_by=auth.uid() or (status='pending' and exists(select 1 from public.profiles p join public.videos v on v.id=validations.video_id where p.id=auth.uid() and p.role='valideur' and p.is_active and p.brand_id=v.brand_id and p.department=v.department)));
drop policy if exists validations_admin_manage on public.validations;
create policy validations_admin_manage on public.validations for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists validations_validator_review on public.validations;
create policy validations_validator_review on public.validations for update to authenticated using(status='pending' and exists(select 1 from public.profiles p join public.videos v on v.id=validations.video_id where p.id=auth.uid() and p.role='valideur' and p.is_active and p.brand_id=v.brand_id and p.department=v.department)) with check(reviewed_by=auth.uid() and status in ('approved','rejected') and reviewed_at is not null);
create or replace function public.guard_validation_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.video_id is distinct from old.video_id or new.version_id is distinct from old.version_id
    or new.submitted_by is distinct from old.submitted_by or new.created_at is distinct from old.created_at then
    raise exception using errcode='42501', message='Champs de validation non modifiables';
  end if;
  if old.status <> 'pending' or new.status not in ('approved','rejected')
    or (current_setting('request.jwt.claim.role', true) <> 'service_role' and new.reviewed_by <> auth.uid())
    or new.reviewed_at is null then
    raise exception using errcode='42501', message='Transition de validation non autorisée';
  end if;
  if new.status='rejected' and length(trim(coalesce(new.reason,'')))=0 then
    raise exception using errcode='22023', message='Un motif est obligatoire pour refuser une vidéo';
  end if;
  return new;
end $$;
drop trigger if exists guard_validation_update_trigger on public.validations;
create trigger guard_validation_update_trigger before update on public.validations for each row execute function public.guard_validation_update();
drop policy if exists ledger_admin_read on public.usage_ledger;
create policy ledger_admin_read on public.usage_ledger for select to authenticated using(public.is_admin());
drop policy if exists comparisons_admin_all on public.comparisons;
create policy comparisons_admin_all on public.comparisons for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- Expose model choices without revealing provider unit costs to collaborators or validators.
create or replace view public.model_catalog with (security_invoker=true) as
  select id,name,tier,adapter_family,mode,allowed_durations,allowed_formats,is_active,is_default from public.ai_models;
revoke all on public.ai_models from anon,authenticated;
grant select on public.ai_models to authenticated;
grant select on public.model_catalog to authenticated;

-- Storage objects are private. Uploads go into a first-level folder named with auth.uid().
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('assets','assets',false,26214400,array['image/jpeg','image/png','image/webp']::text[]),
  ('videos','videos',false,104857600,array['video/mp4','image/jpeg','image/png','image/webp']::text[]),
  ('audio','audio',false,26214400,array['audio/mpeg','audio/wav','audio/mp4']::text[]),
  ('brand','brand',false,26214400,array['image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists rimco_storage_read on storage.objects;
create policy rimco_storage_read on storage.objects for select to authenticated using(
  public.is_admin() or
  (bucket_id='brand' and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='brand' and exists(select 1 from public.assets a join public.profiles p on p.id=auth.uid() and p.brand_id=a.brand_id and p.is_active where a.path=name and a.kind='logo' and a.status='validée')) or
  (bucket_id in ('assets','audio') and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='assets' and exists(select 1 from public.assets a where a.path=name and a.status='validée')) or
  (bucket_id='audio' and exists(select 1 from public.assets a where a.path=name and a.kind='audio' and a.status='validée')) or
  (bucket_id='videos' and exists(select 1 from public.videos v join public.video_versions vv on vv.video_id=v.id where v.user_id=auth.uid() and v.status='approved' and vv.final_path=name)) or
  (bucket_id='videos' and exists(select 1 from public.profiles p join public.videos v on v.brand_id=p.brand_id and v.department=p.department and v.status='review' join public.video_versions vv on vv.video_id=v.id where p.id=auth.uid() and p.role='valideur' and p.is_active and vv.final_path=name))
);

-- Collaborator workflow extensions (idempotent).
alter table public.videos drop constraint if exists videos_status_check;
alter table public.videos add constraint videos_status_check check (status in ('draft','generating','ready','review','approved','rejected','failed','cancelled'));
alter table public.video_versions drop constraint if exists video_versions_status_check;
alter table public.video_versions add constraint video_versions_status_check check (status in ('queued','generating','postprocessing','ready','failed','cancelled'));
alter table public.assets add column if not exists title text;
alter table public.assets add column if not exists category text;
alter table public.assets drop constraint if exists assets_kind_check;
alter table public.assets add constraint assets_kind_check check (kind in ('vehicle','logo','audio','place','decor','wardrobe','badge')) not valid; -- superseded below: older rows are checked by the final rule
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  version_id uuid references public.video_versions(id) on delete cascade, type text not null check (type in ('ready','failed','cancelled','validation')),
  message text not null, read_at timestamptz, created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
drop policy if exists rimco_storage_upload on storage.objects;
create policy rimco_storage_upload on storage.objects for insert to authenticated with check(bucket_id in ('assets','audio','brand') and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists rimco_storage_update on storage.objects;
create policy rimco_storage_update on storage.objects for update to authenticated using(bucket_id in ('assets','audio','brand') and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id in ('assets','audio','brand') and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists rimco_storage_delete on storage.objects;
create policy rimco_storage_delete on storage.objects for delete to authenticated using(public.is_admin() or (bucket_id in ('assets','audio','brand') and (storage.foldername(name))[1]=auth.uid()::text));
-- Validators preview the composed file once it is ready for review.
drop policy if exists rimco_storage_read on storage.objects;
create policy rimco_storage_read on storage.objects for select to authenticated using(
  public.is_admin() or
  (bucket_id='brand' and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='brand' and exists(select 1 from public.assets a join public.profiles p on p.id=auth.uid() and p.brand_id=a.brand_id and p.is_active where a.path=name and a.kind='logo' and a.status='validée')) or
  (bucket_id in ('assets','audio') and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='assets' and exists(select 1 from public.assets a where a.path=name and a.status='validée')) or
  (bucket_id='audio' and exists(select 1 from public.assets a where a.path=name and a.kind='audio' and a.status='validée')) or
  (bucket_id='videos' and exists(select 1 from public.videos v join public.video_versions vv on vv.video_id=v.id where v.user_id=auth.uid() and v.status='approved' and vv.final_path=name)) or
  (bucket_id='videos' and exists(select 1 from public.profiles p join public.videos v on v.brand_id=p.brand_id and v.department=p.department and v.status='review' join public.video_versions vv on vv.video_id=v.id where p.id=auth.uid() and p.role='valideur' and p.is_active and vv.final_path=name))
);
-- Reserve the maximum configured token cost before each fal LLM request.
create or replace function public.reserve_llm_budget(
  p_user_id uuid, p_version_id uuid, p_max_cost_usd numeric,
  p_usd_to_eur numeric, p_eur_to_fcfa numeric, p_cap_eur numeric, p_department text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare entry_id uuid; estimated_eur numeric;
begin
  if p_max_cost_usd is null or p_max_cost_usd <= 0 or p_usd_to_eur is null or p_usd_to_eur <= 0
    or p_eur_to_fcfa is null or p_eur_to_fcfa <= 0 or p_cap_eur is null or p_cap_eur < 0 then
    raise exception using errcode='22023', message='Paramètres de réservation LLM invalides';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id and p.is_active)
    or not exists(select 1 from public.video_versions vv join public.videos v on v.id=vv.video_id where vv.id=p_version_id and v.user_id=p_user_id) then
    raise exception using errcode='22023', message='Réservation LLM impossible pour cette version';
  end if;
  estimated_eur := p_max_cost_usd * p_usd_to_eur;
  perform pg_advisory_xact_lock(hashtext('rimco_budget_cap_eur'));
  if coalesce((select sum(l.cost_eur) from public.usage_ledger l where l.status in ('reserved','charged')),0) + estimated_eur > p_cap_eur then
    raise exception using errcode='P0001', message='Plafond de coût réel dépassé';
  end if;
  insert into public.usage_ledger(version_id,user_id,department,ai_model_id,kind,seconds,cost_usd,cost_eur,cost_real_fcfa,applied_fcfa_per_second,price_fcfa,status)
  values(p_version_id,p_user_id,coalesce(p_department,''),null,'generation',1,p_max_cost_usd,estimated_eur,estimated_eur*p_eur_to_fcfa,0,0,'reserved') returning id into entry_id;
  return entry_id;
end $$;
revoke all on function public.reserve_llm_budget(uuid,uuid,numeric,numeric,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.reserve_llm_budget(uuid,uuid,numeric,numeric,numeric,numeric,text) to service_role;
-- The catalog below replays every past default switch (Veo, Seedance, Kling...). On an existing database two
-- models of a tier would briefly be default together: the one-default rule is lifted here and restored at the end.
drop index if exists public.ai_models_one_default_per_tier;
-- Refresh the catalog from verified provider schemas; unsupported models stay inactive.
update public.ai_models set is_active=false, is_default=false where fal_endpoint_id='TODO(verify-fal)';

update public.ai_models set allowed_durations='{6}', allowed_formats='{16:9,9:16}', is_active=true, is_default=true
where fal_endpoint_id='fal-ai/veo3.1/fast/image-to-video';

update public.ai_models set price_usd_per_second=0, allowed_durations='{}', allowed_formats='{}', is_active=false, is_default=false
where fal_endpoint_id='fal-ai/minimax/hailuo-2.3/pro/image-to-video';

insert into public.ai_models(name,tier,fal_endpoint_id,adapter_family,mode,price_usd_per_second,allowed_durations,allowed_formats,is_active,is_default)
values ('Wan 3.0','standard','alibaba/wan-3.0/image-to-video','wan','image_to_video',0.10,'{5}','{16:9,9:16,1:1}',true,false)
on conflict(name) do update set tier=excluded.tier,fal_endpoint_id=excluded.fal_endpoint_id,
  adapter_family=excluded.adapter_family,mode=excluded.mode,price_usd_per_second=excluded.price_usd_per_second,
  allowed_durations=excluded.allowed_durations,allowed_formats=excluded.allowed_formats,
  is_active=excluded.is_active,is_default=excluded.is_default;
alter table public.videos drop constraint if exists videos_status_check;
alter table public.videos add constraint videos_status_check check (status in ('draft','generating','ready','review','approved','rejected','failed','cancelled'));

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
-- Seed de démonstration idempotent. Endpoints et tarifs contrôlés dans la documentation fal.ai.
insert into public.brands(name,primary_color,secondary_color)
values ('RIMCO Motors','#c51e1c','#831810')
on conflict(name) do update set primary_color=excluded.primary_color,secondary_color=excluded.secondary_color;

insert into public.pricing_settings(brand_id,grid_fcfa_per_second_standard,grid_fcfa_per_second_premium)
select id,460,700 from public.brands where name='RIMCO Motors'
on conflict(brand_id) do update set grid_fcfa_per_second_standard=excluded.grid_fcfa_per_second_standard,
  grid_fcfa_per_second_premium=excluded.grid_fcfa_per_second_premium;

-- Les tarifs fal sont des estimations de coût unitaire; revalider avant activation commerciale.
update public.ai_models set is_active=false,is_default=false where fal_endpoint_id='fal-ai/kling-video/v2.6/pro/image-to-video';
update public.ai_models set is_default=false where tier='standard';
insert into public.ai_models(name,tier,fal_endpoint_id,adapter_family,mode,price_usd_per_second,allowed_durations,allowed_formats,is_active,is_default)
values
  ('Kling O3 Pro','standard','fal-ai/kling-video/o3/pro/image-to-video','kling','image_to_video',0.112,'{5,10,15}','{16:9,9:16,1:1}',true,true),
  ('Seedance 2.5','premium','bytedance/seedance-2.5/image-to-video','seedance','image_to_video',0.473,'{5,10,15,20,30}','{16:9,9:16,1:1}',true,false),
  ('Veo 3.1 Fast','premium','fal-ai/veo3.1/fast/image-to-video','veo','image_to_video',0.10,'{6}','{16:9,9:16}',true,true),
  ('Hailuo 2.3 Pro','test','fal-ai/minimax/hailuo-2.3/pro/image-to-video','minimax','image_to_video',0,'{}','{}',false,false),
  ('Wan 3.0','standard','alibaba/wan-3.0/image-to-video','wan','image_to_video',0.10,'{5}','{16:9,9:16,1:1}',true,false)
on conflict(name) do update set tier=excluded.tier,fal_endpoint_id=excluded.fal_endpoint_id,
  adapter_family=excluded.adapter_family,mode=excluded.mode,price_usd_per_second=excluded.price_usd_per_second,
  allowed_durations=excluded.allowed_durations,allowed_formats=excluded.allowed_formats,
  is_active=excluded.is_active,is_default=excluded.is_default;

-- Migration 0006: nouveaux modèles vidéo et remplacement de Kling 2.6 Pro.
update public.ai_models set is_active=false,is_default=false
where fal_endpoint_id='fal-ai/kling-video/v2.6/pro/image-to-video';
insert into public.ai_models(name,tier,fal_endpoint_id,adapter_family,mode,price_usd_per_second,allowed_durations,allowed_formats,is_active,is_default)
values
  ('Kling O3 Pro','standard','fal-ai/kling-video/o3/pro/image-to-video','kling','image_to_video',0.112,'{5}','{16:9,9:16,1:1}',true,true),
  ('Seedance 2.5','premium','bytedance/seedance-2.5/image-to-video','seedance','image_to_video',0.473,'{5}','{16:9,9:16,1:1}',true,false)
on conflict(name) do update set tier=excluded.tier,fal_endpoint_id=excluded.fal_endpoint_id,
  adapter_family=excluded.adapter_family,mode=excluded.mode,price_usd_per_second=excluded.price_usd_per_second,
  allowed_durations=excluded.allowed_durations,allowed_formats=excluded.allowed_formats,
  is_active=excluded.is_active,is_default=excluded.is_default;
update public.ai_models set is_default=false
where tier='premium' and fal_endpoint_id='bytedance/seedance-2.5/image-to-video';
-- Apply a 30% markup to the combined provider charge when a generation reservation is settled.
-- This changes the customer-facing price only; provider costs and the budget cap remain intact.
create or replace function public.settle_budget(p_entry_id uuid,p_outcome text,p_actual_cost_usd numeric,p_usd_to_eur numeric,p_eur_to_fcfa numeric,p_cap_eur numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare
  entry public.usage_ledger%rowtype;
  final_eur numeric;
  final_usd numeric;
  client_price_fcfa numeric;
begin
  if p_outcome not in ('charged','released') or p_cap_eur is null or p_cap_eur < 0
    or p_usd_to_eur is null or p_usd_to_eur <= 0 or p_eur_to_fcfa is null or p_eur_to_fcfa <= 0
    or (p_outcome='charged' and (p_actual_cost_usd is null or p_actual_cost_usd < 0)) then
    raise exception using errcode='22023', message='Paramètres de clôture invalides';
  end if;
  perform pg_advisory_xact_lock(hashtext('rimco_budget_cap_eur'));
  select * into entry from public.usage_ledger where id=p_entry_id for update;
  if not found or entry.status <> 'reserved' then
    raise exception using errcode='P0001', message='Réservation introuvable ou déjà clôturée';
  end if;
  if p_outcome='released' then
    update public.usage_ledger set status='released' where id=p_entry_id;
    return;
  end if;
  final_usd := p_actual_cost_usd;
  final_eur := final_usd * p_usd_to_eur;
  if coalesce((select sum(l.cost_eur) from public.usage_ledger l where l.status in ('reserved','charged') and l.id<>p_entry_id),0)+final_eur > p_cap_eur then
    raise exception using errcode='P0001', message='Le coût réel dépasserait le plafond autorisé';
  end if;
  client_price_fcfa := case when final_usd > 0 then ceil(final_eur * p_eur_to_fcfa * 1.30) else entry.price_fcfa end;
  update public.usage_ledger
    set status='charged', cost_usd=final_usd, cost_eur=final_eur,
        cost_real_fcfa=final_eur*p_eur_to_fcfa,
        price_fcfa=client_price_fcfa,
        applied_fcfa_per_second=case when entry.seconds > 0 then client_price_fcfa / entry.seconds else 0 end
    where id=p_entry_id;
end $$;
revoke all on function public.settle_budget(uuid,text,numeric,numeric,numeric,numeric) from public, anon, authenticated;
grant execute on function public.settle_budget(uuid,text,numeric,numeric,numeric,numeric) to service_role;
-- Enable requested output durations on the verified image-to-video endpoints.
-- Veo keeps a 5s final output (6s source); Kling supports up to 15s; Seedance up to 30s.
alter table public.video_versions drop constraint if exists video_versions_generation_seconds_check;
alter table public.video_versions add constraint video_versions_generation_seconds_check check (generation_seconds in (5,10,15,20,30)) not valid; -- superseded below: older rows are checked by the final rule

update public.ai_models
set allowed_durations='{5,10,15}'
where fal_endpoint_id='fal-ai/kling-video/o3/pro/image-to-video';

update public.ai_models
set allowed_durations='{5,10,15,20,30}'
where fal_endpoint_id='bytedance/seedance-2.5/image-to-video';

-- The application stores final output duration. Veo's six-second source remains adapter-owned.
update public.ai_models
set allowed_durations='{5}'
where fal_endpoint_id='fal-ai/veo3.1/fast/image-to-video';

-- 0009_generation_model_routing.sql: fixed model by level and output duration.
update public.ai_models set is_default=false where is_default;
update public.ai_models
set tier='standard', allowed_durations='{5}', is_default=false
where fal_endpoint_id='alibaba/wan-3.0/image-to-video';
update public.ai_models
set tier='standard', allowed_durations='{10,15}', is_default=true
where fal_endpoint_id='fal-ai/kling-video/o3/pro/image-to-video';
update public.ai_models
set tier='premium', allowed_durations='{5}', is_default=true
where fal_endpoint_id='fal-ai/veo3.1/fast/image-to-video';
update public.ai_models
set tier='premium', allowed_durations='{10,15,20,30}', is_default=false
where fal_endpoint_id='bytedance/seedance-2.5/image-to-video';

-- 0010_video_shots.sql: two independently generated 3-second shots per montage.
create table if not exists public.video_shots (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.video_versions(id) on delete cascade,
  shot_number integer not null check (shot_number between 1 and 2),
  duration_seconds integer not null check (duration_seconds = 3),
  title text not null,
  generated_prompt text not null,
  provider_request_id text,
  usage_ledger_id uuid references public.usage_ledger(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','generating','postprocessing','ready','failed')),
  raw_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(version_id, shot_number)
);
alter table public.video_versions drop constraint if exists video_versions_generation_seconds_check;
alter table public.video_versions add constraint video_versions_generation_seconds_check check (generation_seconds in (5,6,10,15,20,30)) not valid; -- superseded below: older rows are checked by the final rule
alter table public.video_shots enable row level security;
drop policy if exists video_shots_admin_read on public.video_shots;
create policy video_shots_admin_read on public.video_shots for select to authenticated using (public.is_admin());
create index if not exists video_shots_version_status_idx on public.video_shots(version_id, shot_number, status);

-- 0011_remove_app_budget_cap.sql: provider spending cap lives in fal.ai; app keeps cost accounting.
-- Fal owns the provider spending cap. Keep usage_ledger for cost reporting,
-- but remove application-level budget rejection from reserve and settle RPCs.
drop function if exists public.reserve_budget(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric);
drop function if exists public.reserve_llm_budget(uuid,uuid,numeric,numeric,numeric,numeric,text);
drop function if exists public.settle_budget(uuid,text,numeric,numeric,numeric,numeric);

create or replace function public.reserve_budget(
  p_user_id uuid,p_version_id uuid,p_model_id uuid,p_seconds numeric,p_price_usd_second numeric,
  p_usd_to_eur numeric,p_eur_to_fcfa numeric,p_price_fcfa numeric,
  p_department text,p_applied_fcfa_second numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare entry_id uuid; estimated_usd numeric; estimated_eur numeric;
begin
  if p_seconds is null or p_seconds <= 0 or p_price_usd_second is null or p_price_usd_second < 0
    or p_usd_to_eur is null or p_usd_to_eur <= 0 or p_eur_to_fcfa is null or p_eur_to_fcfa <= 0
    or p_price_fcfa is null or p_price_fcfa < 0 or p_applied_fcfa_second is null or p_applied_fcfa_second < 0 then
    raise exception using errcode='22023', message='Paramètres de réservation invalides';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id and p.is_active)
    or not exists(select 1 from public.video_versions vv join public.videos v on v.id=vv.video_id where vv.id=p_version_id and v.user_id=p_user_id)
    or not exists(select 1 from public.ai_models m where m.id=p_model_id and m.is_active) then
    raise exception using errcode='22023', message='Réservation impossible pour cette version';
  end if;
  estimated_usd := p_seconds * p_price_usd_second;
  estimated_eur := estimated_usd * p_usd_to_eur;
  insert into public.usage_ledger(version_id,user_id,department,ai_model_id,kind,seconds,cost_usd,cost_eur,cost_real_fcfa,applied_fcfa_per_second,price_fcfa,status)
  values(p_version_id,p_user_id,coalesce(p_department,''),p_model_id,'generation',p_seconds,estimated_usd,estimated_eur,estimated_eur*p_eur_to_fcfa,p_applied_fcfa_second,p_price_fcfa,'reserved') returning id into entry_id;
  return entry_id;
end $$;
revoke all on function public.reserve_budget(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,numeric) from public, anon, authenticated;
grant execute on function public.reserve_budget(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,numeric) to service_role;

create or replace function public.reserve_llm_budget(
  p_user_id uuid,p_version_id uuid,p_max_cost_usd numeric,
  p_usd_to_eur numeric,p_eur_to_fcfa numeric,p_department text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare entry_id uuid; estimated_eur numeric;
begin
  if p_max_cost_usd is null or p_max_cost_usd <= 0 or p_usd_to_eur is null or p_usd_to_eur <= 0
    or p_eur_to_fcfa is null or p_eur_to_fcfa <= 0 then
    raise exception using errcode='22023', message='Paramètres de réservation LLM invalides';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id and p.is_active)
    or not exists(select 1 from public.video_versions vv join public.videos v on v.id=vv.video_id where vv.id=p_version_id and v.user_id=p_user_id) then
    raise exception using errcode='22023', message='Réservation LLM impossible pour cette version';
  end if;
  estimated_eur := p_max_cost_usd * p_usd_to_eur;
  insert into public.usage_ledger(version_id,user_id,department,ai_model_id,kind,seconds,cost_usd,cost_eur,cost_real_fcfa,applied_fcfa_per_second,price_fcfa,status)
  values(p_version_id,p_user_id,coalesce(p_department,''),null,'generation',1,p_max_cost_usd,estimated_eur,estimated_eur*p_eur_to_fcfa,0,0,'reserved') returning id into entry_id;
  return entry_id;
end $$;
revoke all on function public.reserve_llm_budget(uuid,uuid,numeric,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.reserve_llm_budget(uuid,uuid,numeric,numeric,numeric,text) to service_role;

create or replace function public.settle_budget(
  p_entry_id uuid,p_outcome text,p_actual_cost_usd numeric,p_usd_to_eur numeric,p_eur_to_fcfa numeric
) returns void language plpgsql security definer set search_path = '' as $$
declare entry public.usage_ledger%rowtype; final_eur numeric; final_usd numeric; client_price_fcfa numeric;
begin
  if p_outcome not in ('charged','released') or p_usd_to_eur is null or p_usd_to_eur <= 0
    or p_eur_to_fcfa is null or p_eur_to_fcfa <= 0
    or (p_outcome='charged' and (p_actual_cost_usd is null or p_actual_cost_usd < 0)) then
    raise exception using errcode='22023', message='Paramètres de clôture invalides';
  end if;
  select * into entry from public.usage_ledger where id=p_entry_id for update;
  if not found or entry.status <> 'reserved' then
    raise exception using errcode='P0001', message='Réservation introuvable ou déjà clôturée';
  end if;
  if p_outcome='released' then
    update public.usage_ledger set status='released' where id=p_entry_id;
    return;
  end if;
  final_usd := p_actual_cost_usd;
  final_eur := final_usd * p_usd_to_eur;
  client_price_fcfa := case when final_usd > 0 then ceil(final_eur * p_eur_to_fcfa * 1.30) else entry.price_fcfa end;
  update public.usage_ledger
    set status='charged', cost_usd=final_usd, cost_eur=final_eur,
        cost_real_fcfa=final_eur*p_eur_to_fcfa,
        price_fcfa=client_price_fcfa,
        applied_fcfa_per_second=case when entry.seconds > 0 then client_price_fcfa / entry.seconds else 0 end
    where id=p_entry_id;
end $$;
revoke all on function public.settle_budget(uuid,text,numeric,numeric,numeric) from public, anon, authenticated;
grant execute on function public.settle_budget(uuid,text,numeric,numeric,numeric) to service_role;

-- 0012_generation_model_routing.sql: keep the live catalog aligned with the Studio.
update public.ai_models
set is_active=false, is_default=false
where fal_endpoint_id='fal-ai/kling-video/v2.6/pro/image-to-video';
update public.ai_models set is_default=false where tier in ('standard','premium');
update public.ai_models
set tier='standard', allowed_durations='{5}', is_active=true, is_default=false
where fal_endpoint_id='alibaba/wan-3.0/image-to-video';
update public.ai_models
set tier='standard', allowed_durations='{10,15}', is_active=true, is_default=true
where fal_endpoint_id='fal-ai/kling-video/o3/pro/image-to-video';
update public.ai_models
set tier='premium', allowed_durations='{5}', is_active=true, is_default=true
where fal_endpoint_id='fal-ai/veo3.1/fast/image-to-video';
update public.ai_models
set tier='premium', allowed_durations='{10,15,20,30}', is_active=true, is_default=false
where fal_endpoint_id='bytedance/seedance-2.5/image-to-video';

-- Canonical final state. This block intentionally runs last so the one-shot setup
-- remains idempotent even when it is applied over an older beta schema.
alter table public.videos drop constraint if exists videos_status_check;
alter table public.videos add constraint videos_status_check check (status in ('draft','generating','ready','review','approved','rejected','failed','cancelled'));
alter table public.video_versions drop constraint if exists video_versions_status_check;
alter table public.video_versions add constraint video_versions_status_check check (status in ('queued','generating','postprocessing','ready','failed','cancelled'));
alter table public.assets drop constraint if exists assets_kind_check;
alter table public.assets add constraint assets_kind_check check (kind in ('vehicle','logo','audio','place','decor','wardrobe','badge')) not valid; -- superseded below: older rows are checked by the final rule
-- notifications_user_version_type_idx is no longer created: 0036 replaced it by the dedupe_key index
-- (several « action requise » per video), and recreating it would fail on an existing database.

notify pgrst, 'reload schema';

-- Migration 0017 : matrice vidéo verrouillée (idempotent).
update public.ai_models set is_active = false, is_default = false
where fal_endpoint_id not in ('alibaba/wan-3.0/image-to-video','fal-ai/kling-video/o3/pro/image-to-video','fal-ai/veo3.1/fast/image-to-video','bytedance/seedance-2.5/image-to-video');
update public.ai_models set is_active=true,is_default=false,tier='standard',allowed_durations='{5}',allowed_formats='{16:9,9:16,1:1}' where fal_endpoint_id='alibaba/wan-3.0/image-to-video';
update public.ai_models set is_active=true,is_default=true,tier='standard',allowed_durations='{10,15}',allowed_formats='{16:9,9:16,1:1}' where fal_endpoint_id='fal-ai/kling-video/o3/pro/image-to-video';
update public.ai_models set is_active=true,is_default=true,tier='premium',allowed_durations='{6}',allowed_formats='{16:9,9:16}' where fal_endpoint_id='fal-ai/veo3.1/fast/image-to-video';
update public.ai_models set is_active=true,is_default=false,tier='premium',allowed_durations='{10,15,20,30}',allowed_formats='{16:9,9:16,1:1}' where fal_endpoint_id='bytedance/seedance-2.5/image-to-video';

-- 0018_vehicle_dossiers_places_admin.sql: explicit vehicle folders and photo roles.
create table if not exists public.vehicle_dossiers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  make text not null check (length(trim(make)) between 1 and 100),
  model text not null check (length(trim(model)) between 1 and 100),
  color text,
  variant text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.assets add column if not exists vehicle_dossier_id uuid references public.vehicle_dossiers(id) on delete set null;
alter table public.assets add column if not exists photo_role text;
alter table public.assets drop constraint if exists assets_photo_role_check;
alter table public.assets add constraint assets_photo_role_check check (photo_role is null or photo_role in ('exterior','interior','detail'));
create index if not exists vehicle_dossiers_brand_created_idx on public.vehicle_dossiers(brand_id, created_at desc);
create index if not exists assets_vehicle_dossier_idx on public.assets(vehicle_dossier_id) where vehicle_dossier_id is not null;
alter table public.vehicle_dossiers enable row level security;
drop policy if exists vehicle_dossiers_read_brand on public.vehicle_dossiers;
create policy vehicle_dossiers_read_brand on public.vehicle_dossiers for select to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.brand_id=vehicle_dossiers.brand_id));
drop policy if exists vehicle_dossiers_admin_manage on public.vehicle_dossiers;
create policy vehicle_dossiers_admin_manage on public.vehicle_dossiers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists assets_insert_self on public.assets;
create policy assets_insert_self on public.assets for insert to authenticated
  with check (created_by=auth.uid() and status='en_attente' and kind <> 'place');
notify pgrst, 'reload schema';

-- Migration 0019 : storyboard et montage multi-clips (idempotent).
alter table public.video_shots drop constraint if exists video_shots_shot_number_check;
alter table public.video_shots add constraint video_shots_shot_number_check check (shot_number between 1 and 6);
alter table public.video_shots drop constraint if exists video_shots_duration_seconds_check;
alter table public.video_shots add constraint video_shots_duration_seconds_check check (duration_seconds between 2 and 30);
insert into public.ai_models(name,tier,fal_endpoint_id,adapter_family,mode,price_usd_per_second,allowed_durations,allowed_formats,is_active,is_default)
values
  ('Wan 2.7 Reference to Video','standard','fal-ai/wan/v2.7/reference-to-video','wan','image_to_video',0.10,'{2,3,4,5,6,7,8,9,10}','{16:9,9:16,1:1,4:3,3:4}',true,false),
  ('Kling O3 Pro Reference to Video','standard','fal-ai/kling-video/o3/pro/reference-to-video','kling','image_to_video',0.112,'{3,4,5,6,7,8,9,10,11,12,13,14,15}','{16:9,9:16,1:1}',true,false),
  ('Seedance 2.5 Reference to Video','premium','bytedance/seedance-2.5/reference-to-video','seedance','image_to_video',0.473,'{4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30}','{16:9,9:16,1:1,4:3,3:4,21:9}',true,false)
on conflict(name) do update set tier=excluded.tier,fal_endpoint_id=excluded.fal_endpoint_id,
  adapter_family=excluded.adapter_family,mode=excluded.mode,price_usd_per_second=excluded.price_usd_per_second,
  allowed_durations=excluded.allowed_durations,allowed_formats=excluded.allowed_formats,is_active=excluded.is_active,is_default=false;
notify pgrst, 'reload schema';

-- 0020_storyboard_cost_guardrails.sql
alter table public.ai_models add column if not exists pricing_verified_at timestamptz;
alter table public.video_shots add column if not exists price_usd_per_second numeric(12,6);
alter table public.video_shots add column if not exists estimated_cost_usd numeric(12,6);
alter table public.video_shots add column if not exists actual_cost_usd numeric(12,6);
create or replace function public.reserve_storyboard_comparison_budget(p_campaign_id uuid,p_amount_usd numeric,p_max_usd numeric)
returns numeric language plpgsql security definer set search_path=public as $$
declare current_brief jsonb; current_reserved numeric; next_reserved numeric; old_durations jsonb;
begin
  if p_amount_usd<=0 or p_max_usd<=0 then raise exception 'Invalid storyboard budget amount'; end if;
  select brief_json into current_brief from public.comparisons where id=p_campaign_id for update;
  if current_brief is null or current_brief->>'kind'<>'storyboard_multiclip_comparison' then raise exception 'Storyboard comparison campaign not found'; end if;
  current_reserved:=coalesce((current_brief->>'reservedUsd')::numeric,0); next_reserved:=current_reserved+p_amount_usd;
  if next_reserved>p_max_usd then return null; end if;
  old_durations:=coalesce(current_brief->'durations','[]'::jsonb);
  update public.comparisons set brief_json=current_brief||jsonb_build_object('reservedUsd',next_reserved,'durations',old_durations,'budgetUpdatedAt',now()) where id=p_campaign_id;
  return next_reserved;
end; $$;
revoke all on function public.reserve_storyboard_comparison_budget(uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.reserve_storyboard_comparison_budget(uuid,numeric,numeric) to service_role;

-- 0021_generation_pro_tier.sql
alter table public.ai_models drop constraint if exists ai_models_tier_check;
alter table public.ai_models add constraint ai_models_tier_check check (tier in ('standard','pro','premium','test'));
update public.ai_models set is_default=false where tier in ('standard','pro','premium');
update public.ai_models set tier='standard',allowed_durations='{5}',is_default=true where fal_endpoint_id='alibaba/wan-3.0/image-to-video';
update public.ai_models set tier='pro',allowed_durations='{5,10,15}',is_default=true where fal_endpoint_id='fal-ai/kling-video/o3/pro/image-to-video';
update public.ai_models set tier='pro',is_default=false where fal_endpoint_id='fal-ai/kling-video/o3/pro/reference-to-video';
update public.ai_models set tier='premium',is_default=true where fal_endpoint_id='fal-ai/veo3.1/fast/image-to-video';
update public.ai_models set tier='premium',is_default=false where fal_endpoint_id in ('bytedance/seedance-2.5/image-to-video','bytedance/seedance-2.5/reference-to-video');
notify pgrst, 'reload schema';

-- 0022_seedance_premium_and_logo_duration.sql
-- Selected durations represent generated footage; post-production adds the 2s logo card.
update public.ai_models set is_active=false,is_default=false where fal_endpoint_id='fal-ai/veo3.1/fast/image-to-video';
update public.ai_models set is_active=true,is_default=true,tier='premium',allowed_durations='{5,10,15,20,30}' where fal_endpoint_id='bytedance/seedance-2.5/image-to-video';
update public.ai_models set is_active=true,is_default=false,tier='premium' where fal_endpoint_id='bytedance/seedance-2.5/reference-to-video';
alter table public.video_versions drop constraint if exists video_versions_generation_seconds_check;
alter table public.video_versions add constraint video_versions_generation_seconds_check check (generation_seconds in (5,6,7,10,12,15,17,20,22,30,32));
notify pgrst, 'reload schema';
-- Store replaceable Fal API keys encrypted by the application server.
create table if not exists public.fal_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  ciphertext text not null,
  nonce text not null,
  auth_tag text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  is_active boolean not null default false
);

create unique index if not exists fal_provider_credentials_one_active_idx
  on public.fal_provider_credentials(is_active) where is_active;

alter table public.video_versions
  add column if not exists fal_credential_id uuid references public.fal_provider_credentials(id) on delete set null;

create index if not exists video_versions_fal_credential_idx
  on public.video_versions(fal_credential_id) where fal_credential_id is not null;

alter table public.fal_provider_credentials enable row level security;
revoke all on public.fal_provider_credentials from anon, authenticated;
grant select, insert, update, delete on public.fal_provider_credentials to service_role;

create or replace function public.activate_fal_provider_credential(p_credential_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fal_provider_credentials set is_active=false where is_active;
  update public.fal_provider_credentials set is_active=true where id=p_credential_id;
  if not found then
    raise exception using errcode='P0002', message='Fal credential not found';
  end if;
end $$;
revoke all on function public.activate_fal_provider_credential(uuid) from public, anon, authenticated;
grant execute on function public.activate_fal_provider_credential(uuid) to service_role;

notify pgrst, 'reload schema';

-- 0024_keyframe_generation.sql
-- Persist image generation and quality-gate state before any video clip is submitted.
alter table public.video_shots add column if not exists keyframe_status text not null default 'skipped'
  check (keyframe_status in ('skipped','queued','generating','checking','ready','failed'));
alter table public.video_shots add column if not exists keyframe_request_id text;
alter table public.video_shots add column if not exists keyframe_quality_request_id text;
alter table public.video_shots add column if not exists keyframe_path text;
alter table public.video_shots add column if not exists keyframe_retry_count integer not null default 0 check (keyframe_retry_count between 0 and 1);
alter table public.video_shots add column if not exists keyframe_quality jsonb;
alter table public.video_shots add column if not exists keyframe_image_ledger_ids uuid[] not null default '{}';
alter table public.video_shots add column if not exists keyframe_quality_ledger_ids uuid[] not null default '{}';

alter table public.usage_ledger drop constraint if exists usage_ledger_kind_check;
alter table public.usage_ledger add constraint usage_ledger_kind_check check (kind in ('generation','postprod','keyframe'));
create index if not exists video_shots_keyframe_status_idx on public.video_shots(version_id, keyframe_status);
-- These image-to-video models animate the accepted keyframe as the actual start frame.
-- fal schemas and rates were rechecked on 2026-10-18.
update public.ai_models set tier='pro',adapter_family='kling',mode='image_to_video',is_active=true,
  price_usd_per_second=0.112,allowed_durations='{3,4,5,6,7,8,9,10,11,12,13,14,15}',
  allowed_formats='{16:9,9:16,1:1}',pricing_verified_at=now()
where fal_endpoint_id='fal-ai/kling-video/o3/pro/image-to-video';
update public.ai_models set tier='premium',adapter_family='seedance',mode='image_to_video',is_active=true,
  price_usd_per_second=0.473,allowed_durations='{4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30}',
  allowed_formats='{16:9,9:16,1:1}',pricing_verified_at=now()
where fal_endpoint_id='bytedance/seedance-2.5/image-to-video';
notify pgrst, 'reload schema';

-- 0025_standard_keyframe_animation.sql
update public.ai_models set
  tier='standard', adapter_family='wan', mode='image_to_video',
  is_active=true, price_usd_per_second=0.10, allowed_durations='{5}',
  allowed_formats='{16:9,9:16,1:1}', pricing_verified_at=now()
where fal_endpoint_id='alibaba/wan-3.0/image-to-video';
notify pgrst, 'reload schema';

-- 0026_allow_keyframe_images_in_video_storage.sql
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type order by mime_type)
  from unnest(coalesce(allowed_mime_types, array[]::text[]) || array['image/jpeg','image/png','image/webp']::text[]) as mime_type
)
where id = 'videos';

-- 0027_fal_poll_recovery.sql
alter table public.video_shots add column if not exists provider_endpoint text;
alter table public.video_shots add column if not exists keyframe_endpoint text;
alter table public.video_shots add column if not exists keyframe_quality_endpoint text;
alter table public.video_shots add column if not exists provider_poll_failure_count integer not null default 0;
alter table public.video_shots add column if not exists provider_next_poll_at timestamptz;
alter table public.video_shots add column if not exists provider_last_poll_error text;
alter table public.video_shots add column if not exists provider_reconciliation_required boolean not null default false;
alter table public.video_shots drop constraint if exists video_shots_provider_poll_failure_count_check;
alter table public.video_shots add constraint video_shots_provider_poll_failure_count_check
  check (provider_poll_failure_count between 0 and 4);
create index if not exists video_shots_provider_poll_due_idx
  on public.video_shots(provider_next_poll_at)
  where status = 'generating' or keyframe_status in ('generating','checking');
notify pgrst, 'reload schema';

-- 0028_premium_ad_quality.sql
alter table public.usage_ledger add column if not exists billable_seconds numeric(10,3)
  check (billable_seconds is null or billable_seconds >= 0);
alter table public.usage_ledger add column if not exists billable_cost_usd numeric(10,6)
  check (billable_cost_usd is null or billable_cost_usd >= 0);
alter table public.video_shots add column if not exists video_quality_status text not null default 'skipped'
  check (video_quality_status in ('skipped','queued','checking','passed','retrying','failed'));
alter table public.video_shots add column if not exists video_quality_request_id text;
alter table public.video_shots add column if not exists video_quality_endpoint text;
alter table public.video_shots add column if not exists video_quality_retry_count integer not null default 0
  check (video_quality_retry_count between 0 and 1);
alter table public.video_shots add column if not exists video_quality jsonb;
alter table public.video_shots add column if not exists video_quality_previous_path text;
alter table public.video_shots add column if not exists video_quality_ledger_ids uuid[] not null default '{}';
create index if not exists video_shots_video_quality_status_idx
  on public.video_shots(version_id, video_quality_status)
  where video_quality_status in ('queued','checking','retrying');
notify pgrst, 'reload schema';

-- 0029_premium_twenty_and_atomic_submission.sql
alter table public.video_shots add column if not exists animation_submit_state text not null default 'queued'
  check (animation_submit_state in ('queued','submitting','submitted','failed','reconciliation'));
alter table public.video_shots add column if not exists animation_submit_started_at timestamptz;
update public.video_shots
set animation_submit_state = case
  when provider_request_id is not null then 'submitted'
  when provider_reconciliation_required then 'reconciliation'
  when status = 'failed' then 'failed'
  else 'queued'
end
where animation_submit_state = 'queued';
create index if not exists video_shots_animation_submit_state_idx
  on public.video_shots(version_id, animation_submit_state, shot_number);
notify pgrst, 'reload schema';

-- 0030_casting_and_end_keyframes.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.

-- 1. New media kind « character » (Casting): one approved photo per real person, with image rights cleared.
alter table public.assets drop constraint if exists assets_kind_check;
alter table public.assets add constraint assets_kind_check
  check (kind in ('vehicle','logo','audio','place','decor','wardrobe','badge','character'));

-- 2. Optional closing frame of rolling shots (KEYFRAME_END_FRAME_ROLLING). 'skipped' = not used.
alter table public.video_shots add column if not exists end_keyframe_status text not null default 'skipped';
alter table public.video_shots drop constraint if exists video_shots_end_keyframe_status_check;
alter table public.video_shots add constraint video_shots_end_keyframe_status_check
  check (end_keyframe_status in ('skipped','queued','generating','checking','ready','failed'));
alter table public.video_shots add column if not exists end_keyframe_request_id text;
alter table public.video_shots add column if not exists end_keyframe_quality_request_id text;
alter table public.video_shots add column if not exists end_keyframe_path text;
alter table public.video_shots add column if not exists end_keyframe_quality jsonb;
-- [image reservation, quality reservation], reserved before any paid call.
alter table public.video_shots add column if not exists end_keyframe_ledger_ids uuid[] not null default '{}';

notify pgrst, 'reload schema';

-- 0031_brand_driving_and_market.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Brand settings read by the prompts (multi-brand: never hard-coded).

-- 1. Traffic side of the roads shown in the videos, and steering wheel side of the vehicles.
alter table public.brands add column if not exists traffic_side text not null default 'right';
alter table public.brands drop constraint if exists brands_traffic_side_check;
alter table public.brands add constraint brands_traffic_side_check check (traffic_side in ('right','left'));
alter table public.brands add column if not exists steering_side text not null default 'left';
alter table public.brands drop constraint if exists brands_steering_side_check;
alter table public.brands add constraint brands_steering_side_check check (steering_side in ('left','right'));

-- 2. City and country of the brand's market, used as the geographic anchor of every scene.
alter table public.brands add column if not exists market_location text not null default '';
update public.brands set market_location = 'Abidjan, Côte d''Ivoire' where name = 'RIMCO Motors' and market_location = '';

notify pgrst, 'reload schema';

-- 0033_verification_loop.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Verification loop (25/10): a rejected keyframe goes back to the director (2 corrections at most);
-- a shot still rejected after that waits for a human decision instead of being animated.
-- (0032 is left free: the 24/10 version used it for the place geometry.)

-- 1. New keyframe states: 'revising' (the director corrects the shot), 'awaiting_review' (human decision).
alter table public.video_shots drop constraint if exists video_shots_keyframe_status_check;
alter table public.video_shots add constraint video_shots_keyframe_status_check
  check (keyframe_status in ('skipped','queued','generating','checking','revising','awaiting_review','ready','failed'));

-- 2. Up to 2 automatic corrections, plus the relaunches asked by a human (bounded).
alter table public.video_shots drop constraint if exists video_shots_keyframe_retry_count_check;
alter table public.video_shots add constraint video_shots_keyframe_retry_count_check
  check (keyframe_retry_count between 0 and 6);

-- 3. A clip still rejected after its retry also waits for a human decision.
alter table public.video_shots drop constraint if exists video_shots_video_quality_status_check;
alter table public.video_shots add constraint video_shots_video_quality_status_check
  check (video_quality_status in ('skipped','queued','checking','passed','retrying','awaiting_review','failed'));

-- 4. Shot corrected by the director, its pending request, and the history of every check (kept for the cost study).
alter table public.video_shots add column if not exists revised_draft jsonb;
alter table public.video_shots add column if not exists revision_request_id text;
alter table public.video_shots add column if not exists revision_ledger_id uuid references public.usage_ledger(id);
alter table public.video_shots add column if not exists verification_history jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

-- 0034_place_profile.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Motion matrix (26/10): what an uploaded place allows, described by an admin in the media library
-- (inside or outside, viewpoint, directions along or across the road, shot types, dust, top speed).
-- Validated by the application (Zod); an undescribed place gets a prudent default.
-- (0032 is left free: the 24/10 version used it for the place geometry.)

alter table public.assets add column if not exists place_profile jsonb;
alter table public.assets drop constraint if exists assets_place_profile_check;
alter table public.assets add constraint assets_place_profile_check
  check (place_profile is null or (kind = 'place' and jsonb_typeof(place_profile) = 'object'));

notify pgrst, 'reload schema';

-- 0035_place_profile_proposal.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Place sheet proposed by the vision model when a place is uploaded (26/10), once per place.
-- place_profile (0034) keeps the sheet validated by an admin; the proposal is only shown to the admin.

alter table public.assets add column if not exists place_profile_proposal jsonb;
alter table public.assets drop constraint if exists assets_place_profile_proposal_check;
alter table public.assets add constraint assets_place_profile_proposal_check
  check (place_profile_proposal is null or (kind = 'place' and jsonb_typeof(place_profile_proposal) = 'object'));

alter table public.assets add column if not exists place_profile_proposal_status text;
alter table public.assets drop constraint if exists assets_place_profile_proposal_status_check;
alter table public.assets add constraint assets_place_profile_proposal_status_check
  check (place_profile_proposal_status is null or place_profile_proposal_status in ('pending','ready','failed'));

-- The fal request and its cost line: a place is never proposed twice.
alter table public.assets add column if not exists place_profile_request_id text;
alter table public.assets add column if not exists place_profile_ledger_id uuid references public.usage_ledger(id) on delete set null;
alter table public.assets add column if not exists place_profile_requested_at timestamptz;

notify pgrst, 'reload schema';

-- 0036_notifications_actions.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Notifications « action requise », validation requests and decisions (26/10).
-- `dedupe_key` replaces the (user, version, type) uniqueness: several « action requise » per video (one per shot
-- and per refusal), still without duplicates when a refresh sees the same state again.

alter table public.notifications add column if not exists dedupe_key text;
update public.notifications set dedupe_key = type where dedupe_key is null;

-- Writes that do not give a key (older deployments) keep the former behaviour: one row per type.
create or replace function public.notifications_default_dedupe_key() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.dedupe_key := coalesce(new.dedupe_key, new.type);
  return new;
end;
$$;
drop trigger if exists notifications_default_dedupe_key on public.notifications;
create trigger notifications_default_dedupe_key before insert on public.notifications
  for each row execute function public.notifications_default_dedupe_key();
alter table public.notifications alter column dedupe_key set not null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('ready','failed','cancelled','validation','action_required','review_requested','approved','rejected','expired'));

-- The former index was partial (where version_id is not null): ON CONFLICT (user_id, version_id, type)
-- without a predicate could not use it. The new index is complete, so the upsert can rely on it.
drop index if exists public.notifications_user_version_type_idx;
create unique index if not exists notifications_user_version_dedupe_idx
  on public.notifications(user_id, version_id, dedupe_key);

notify pgrst, 'reload schema';

-- 0037_keyframe_approval.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Validation of the keyframes before the paid animation (27/10): a setting per brand, chosen in the Admin.
--   off             : no validation (behaviour before 27/10)
--   optional        : a box in the Studio, unticked by default
--   premium_default : the box is ticked by default in Premium
--   always          : validation on every video (default, and RIMCO during the beta)
-- The validations themselves are stored in video_shots.verification_history (no new column).

alter table public.brands add column if not exists keyframe_approval_mode text not null default 'always';
alter table public.brands drop constraint if exists brands_keyframe_approval_mode_check;
alter table public.brands add constraint brands_keyframe_approval_mode_check
  check (keyframe_approval_mode in ('off','optional','premium_default','always'));
update public.brands set keyframe_approval_mode = 'always' where name = 'RIMCO Motors';

-- A video whose keyframes were not validated within 48 h expires (reservations released, keyframes kept).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('ready','failed','cancelled','validation','action_required','review_requested','approved','rejected','expired'));

notify pgrst, 'reload schema';

-- BEGIN 0038_human_review_and_pricing.sql
-- Human clip review: service-only mutations share a version lock with the montage claim.
-- No new table: approvals, disabled clips and corrections live in verification_history.
-- Initialize Pro BEFORE changing Premium. The null-only backfill preserves it on subsequent runs.
alter table public.pricing_settings add column if not exists grid_fcfa_per_second_pro numeric;
update public.pricing_settings set grid_fcfa_per_second_pro=grid_fcfa_per_second_premium where grid_fcfa_per_second_pro is null;
alter table public.pricing_settings alter column grid_fcfa_per_second_pro set default 700;
alter table public.pricing_settings alter column grid_fcfa_per_second_pro set not null;
alter table public.pricing_settings drop constraint if exists pricing_settings_pro_positive;
alter table public.pricing_settings add constraint pricing_settings_pro_positive check (grid_fcfa_per_second_pro > 0);
update public.pricing_settings set grid_fcfa_per_second_premium=950 where brand_id in (select id from public.brands where name='RIMCO Motors');

-- Merge only the changed fields. A status refresh or preview must not overwrite a concurrent review decision.
create or replace function public.rimco_patch_version_brief(p_version_id uuid, p_patch jsonb)
returns void language sql security definer set search_path = public as $$
  update public.video_versions set brief_json=coalesce(brief_json,'{}'::jsonb)||p_patch||
    case when p_patch ? 'processingMetrics' then jsonb_build_object('processingMetrics',coalesce(brief_json->'processingMetrics','{}'::jsonb)||p_patch->'processingMetrics') else '{}'::jsonb end
    where id=p_version_id and (not (p_patch ? 'clipApproval') or (status='generating' and brief_json->'clipApproval'->>'approvedAt' is null));
$$;
revoke all on function public.rimco_patch_version_brief(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.rimco_patch_version_brief(uuid,jsonb) to service_role;

create or replace function public.rimco_clip_active(history jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce((select not coalesce((item->>'disabled')::boolean, false)
    from jsonb_array_elements(coalesce(history, '[]'::jsonb)) with ordinality h(item, n)
    where item->>'stage' = 'video' and item->>'decision' = 'human_disable' order by n desc limit 1), true);
$$;
create or replace function public.rimco_clip_approved(history jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce((select item->>'by' = 'human' and item->>'decision' in ('human_approve','human_accept')
    from jsonb_array_elements(coalesce(history, '[]'::jsonb)) with ordinality h(item, n)
    where item->>'stage' = 'video' and item->>'decision' not in ('human_disable','human_disagree') order by n desc limit 1), false);
$$;

create or replace function public.rimco_clip_review(p_version_id uuid, p_action text, p_shot integer default null, p_expected_history jsonb default null, p_patch jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.video_versions%rowtype; s public.video_shots%rowtype; updated public.video_shots%rowtype;
  entry jsonb; disagreement jsonb; approval jsonb; duration numeric; at_time timestamptz := clock_timestamp();
begin
  select * into v from public.video_versions where id = p_version_id for update;
  if not found or v.status <> 'generating' then return jsonb_build_object('changed',false,'status',v.status); end if;
  approval := coalesce(v.brief_json->'clipApproval', '{}'::jsonb);
  if coalesce((approval->>'required')::boolean,false) is not true or approval->>'requestedAt' is null or approval->>'approvedAt' is not null then return jsonb_build_object('changed',false,'status',v.status); end if;
  if p_action='release_unused' then
    if at_time < (approval->>'requestedAt')::timestamptz + interval '48 hours' or exists(select 1 from public.video_shots where version_id=p_version_id and video_quality_status not in ('passed','awaiting_review')) then return jsonb_build_object('changed',false,'status',v.status); end if;
    update public.usage_ledger set status='released' where version_id=p_version_id and status='reserved' and ai_model_id is null and kind in ('keyframe','generation');
    return jsonb_build_object('changed',true);
  end if;
  if p_action = 'claim' then
    if not exists(select 1 from public.video_shots where version_id = p_version_id and public.rimco_clip_active(verification_history)) or exists(
      select 1 from public.video_shots where version_id = p_version_id and public.rimco_clip_active(verification_history)
      and (status <> 'ready' or raw_path is null or not public.rimco_clip_approved(verification_history))
    ) then return jsonb_build_object('changed',false,'status',v.status); end if;
    select sum(duration_seconds) into duration from public.video_shots where version_id = p_version_id and public.rimco_clip_active(verification_history);
    approval := approval || jsonb_build_object('approvedAt',at_time,'waitSeconds',greatest(0,extract(epoch from at_time-(approval->>'requestedAt')::timestamptz)));
    update public.video_versions set status='postprocessing', brief_json = brief_json || jsonb_build_object('clipApproval',approval,'finalDurationSeconds',duration+2,'clipDurationSeconds',duration), updated_at=at_time where id=p_version_id;
    return jsonb_build_object('changed',true,'durationSeconds',duration);
  end if;
  if p_action not in ('approve','unapprove','disable','enable','revise') then raise exception 'Invalid clip action'; end if;
  for s in select * from public.video_shots where version_id=p_version_id and (p_shot is null or shot_number=p_shot) order by shot_number for update loop
    if p_action='revise' then
      if p_shot is null or s.verification_history is distinct from p_expected_history then return jsonb_build_object('changed',false,'status',v.status); end if;
      updated := jsonb_populate_record(s, p_patch);
      update public.video_shots set keyframe_status=updated.keyframe_status,end_keyframe_status=updated.end_keyframe_status,end_keyframe_path=updated.end_keyframe_path,
        keyframe_image_ledger_ids=updated.keyframe_image_ledger_ids,keyframe_quality_ledger_ids=updated.keyframe_quality_ledger_ids,video_quality_ledger_ids=updated.video_quality_ledger_ids,
        revision_request_id=updated.revision_request_id,revision_ledger_id=updated.revision_ledger_id,verification_history=updated.verification_history,
        status=updated.status,video_quality_status=updated.video_quality_status,video_quality_retry_count=updated.video_quality_retry_count,video_quality_request_id=updated.video_quality_request_id,
        video_quality_previous_path=updated.video_quality_previous_path,animation_submit_state=updated.animation_submit_state,provider_request_id=updated.provider_request_id,
        provider_poll_failure_count=0,provider_next_poll_at=null,provider_last_poll_error=null,error_message=null,updated_at=at_time
        where version_id=p_version_id and shot_number=s.shot_number;
      if p_patch->'verification_history'->-1->>'scope'='full' then
        update public.video_versions set brief_json=jsonb_set(brief_json,'{keyframeApproval}',
          coalesce(brief_json->'keyframeApproval','{}'::jsonb) || jsonb_build_object('approvedAt',null,'requestedAt',at_time,'expiredAt',null,'remindedAt',null,'shotNumbers',jsonb_build_array(p_shot))) where id=p_version_id;
      end if;
    else
      if s.raw_path is null or s.video_quality_status not in ('passed','awaiting_review') then continue; end if;
      if p_action='approve' and public.rimco_clip_approved(s.verification_history) then continue; end if;
      if p_action='unapprove' and not public.rimco_clip_approved(s.verification_history) then continue; end if;
      if p_action='disable' and not public.rimco_clip_active(s.verification_history) then continue; end if;
      if p_action='enable' and public.rimco_clip_active(s.verification_history) then continue; end if;
      if p_action='disable' and public.rimco_clip_active(s.verification_history) and (select count(*) from public.video_shots where version_id=p_version_id and public.rimco_clip_active(verification_history)) <= 1 then raise exception 'Gardez au moins un clip actif.'; end if;
      entry := jsonb_build_object('stage','video','attempt',s.video_quality_retry_count,'at',at_time,'approved',coalesce((s.video_quality->>'approved')::boolean,false),'issues',coalesce(s.video_quality->'issues','[]'::jsonb),'reason','Décision utilisateur','by','human','decision',case when p_action in ('disable','enable') then 'human_disable' when p_action='unapprove' then 'human_unapprove' else 'human_approve' end);
      if p_action in ('disable','enable') then entry:=entry || jsonb_build_object('disabled',p_action='disable'); end if;
      disagreement := '[]'::jsonb;
      if p_action='disable' and public.rimco_clip_active(s.verification_history) and s.video_quality->>'approved'='true' then
        disagreement := jsonb_build_array(jsonb_build_object('stage','video','attempt',s.video_quality_retry_count,'at',at_time,'approved',true,'issues',coalesce(s.video_quality->'issues','[]'::jsonb),'reason','Clip accepté par le juge puis désactivé','by','human','decision','human_disagree','reasons',jsonb_build_array('disabled'),'feedback','',
          'disagreement',jsonb_build_object('versionId',v.id,'videoId',v.video_id,'shotNumber',s.shot_number,'tier',coalesce(v.brief_json->>'generationTier',v.brief_json->>'storyMode',''),'placeId',v.brief_json->'storyboard'->(s.shot_number-1)->>'locationPhotoId','shotType',v.brief_json->'storyboard'->(s.shot_number-1)->>'shotType','judge',s.video_quality)));
      end if;
      update public.video_shots set verification_history=coalesce(verification_history,'[]'::jsonb)||disagreement||jsonb_build_array(entry),
        status=case when p_action='approve' then 'ready' else status end,
        video_quality_status=case when p_action='approve' then 'passed' else video_quality_status end,
        video_quality=case when p_action='approve' and video_quality->>'approved'='false' then video_quality || jsonb_build_object('warning',true,'humanAccepted',true,'warningIssues',coalesce(video_quality->'issues','[]'::jsonb)||jsonb_build_array('Accepté par décision humaine malgré le refus du contrôle automatique')) else video_quality end,
        updated_at=at_time where version_id=p_version_id and shot_number=s.shot_number;
    end if;
  end loop;
  return jsonb_build_object('changed',true);
end;
$$;
revoke all on function public.rimco_clip_review(uuid,text,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.rimco_clip_review(uuid,text,integer,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';

-- One default model per tier again, on the final catalog (lifted before the catalog replay above).
create unique index if not exists ai_models_one_default_per_tier on public.ai_models(tier) where is_default;
notify pgrst, 'reload schema';

-- 0039_default_driver.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- « Voiture fantôme » (27/10): a car that drives has a discreet driver at the wheel. Their description is a brand
-- setting (multi-brand, never in the code), frozen in each video at launch so every shot shows the same person.
-- Without a value, the application uses a neutral description. Re-running never overwrites a value already set.

alter table public.brands add column if not exists default_driver_description text;
alter table public.brands drop constraint if exists brands_default_driver_description_check;
alter table public.brands add constraint brands_default_driver_description_check
  check (default_driver_description is null or char_length(default_driver_description) between 3 and 240);
update public.brands
  set default_driver_description = 'one adult West African driver in neat smart-casual clothes, calm and natural'
  where name = 'RIMCO Motors' and default_driver_description is null;

notify pgrst, 'reload schema';

-- 0040_member_deletion.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- « Supprimer un membre » (27/10, Admin only). A member without history is deleted outright. A member with videos,
-- costs or validations stays as their author (the cost journal never changes) but is archived: deleted_at is set,
-- the account is inactive, hidden from the team, and its login is blocked by the application.

alter table public.profiles add column if not exists deleted_at timestamptz;
create index if not exists profiles_active_members_idx on public.profiles(created_at) where deleted_at is null;

notify pgrst, 'reload schema';

-- 0041_roles_operator.sql
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

-- 0042_billing_and_credits.sql
-- 0042_billing_and_credits.sql
-- Idempotent: safe to run several times in the Supabase SQL editor. Requires 0041_roles_operator.sql.
-- Décisions du 27/10 (docs/specs/ROLES-CREDITS-2026-10-27.md) :
-- - réglages de facturation par client, modifiables par l'opérateur KÔMIAN seulement ;
-- - journal des changements de tarifs et de réglages ;
-- - crédits clients en FCFA, sans découvert : prix bloqué au lancement, débité à la livraison, libéré en cas
--   d'échec, d'annulation ou de suppression ; expiration par lot ; consommation du lot qui expire le plus tôt.
-- Mise en service : crédits_enforced = false par défaut (montants tracés, aucun blocage). L'opérateur fait une
-- première recharge, puis active « Appliquer les crédits » dans Espace KÔMIAN · Paramètres.

-- Réglages de facturation (un par client)
create table if not exists public.client_billing_settings (
  client_id uuid primary key references public.clients(id) on delete cascade,
  credits_enforced boolean not null default false,
  low_balance_threshold_fcfa numeric(14,0) not null default 50000 check (low_balance_threshold_fcfa >= 0),
  expiry_warning_days int not null default 30 check (expiry_warning_days between 0 and 365),
  purchase_validity_months int not null default 12 check (purchase_validity_months between 1 and 60),
  gift_validity_months int not null default 3 check (gift_validity_months between 1 and 60),
  human_revisions_per_shot int not null default 1 check (human_revisions_per_shot between 0 and 5),
  human_clip_revisions_per_shot int not null default 1 check (human_clip_revisions_per_shot between 0 and 5),
  revision_price_fcfa numeric(14,0) not null default 0 check (revision_price_fcfa >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.client_billing_settings add column if not exists human_clip_revisions_per_shot int not null default 1;
insert into public.client_billing_settings(client_id) select id from public.clients on conflict do nothing;

-- Journal des changements de tarifs et de réglages (qui, quand, ancienne et nouvelle valeur)
create table if not exists public.pricing_change_log (
  id bigint generated always as identity primary key,
  scope text not null check (scope in ('pricing','billing_settings')),
  brand_id uuid references public.brands(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists pricing_change_log_recent_idx on public.pricing_change_log(changed_at desc);

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

-- Lecture seule depuis le navigateur ; toute écriture passe par les routes serveur (service_role).
alter table public.client_billing_settings enable row level security;
alter table public.pricing_change_log enable row level security;
alter table public.credit_lots enable row level security;
alter table public.credit_holds enable row level security;
alter table public.credit_hold_allocations enable row level security;
alter table public.credit_movements enable row level security;
drop policy if exists billing_settings_read on public.client_billing_settings;
create policy billing_settings_read on public.client_billing_settings for select to authenticated using (client_id = public.my_client_id() or public.is_operator());
drop policy if exists pricing_change_log_read on public.pricing_change_log;
create policy pricing_change_log_read on public.pricing_change_log for select to authenticated using (public.is_operator());
drop policy if exists credit_lots_read on public.credit_lots;
create policy credit_lots_read on public.credit_lots for select to authenticated using (public.is_operator() or (public.is_admin() and client_id = public.my_client_id()));
drop policy if exists credit_holds_read on public.credit_holds;
create policy credit_holds_read on public.credit_holds for select to authenticated using (public.is_operator() or (client_id = public.my_client_id() and (public.is_admin() or user_id = auth.uid())));
drop policy if exists credit_movements_read on public.credit_movements;
create policy credit_movements_read on public.credit_movements for select to authenticated using (public.is_operator() or (client_id = public.my_client_id() and (public.is_admin() or user_id = auth.uid())));

-- Nouvelles notifications : solde bas et crédits qui expirent (liste de 0036/0037 étendue).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('ready','failed','cancelled','validation','action_required','review_requested','approved','rejected','expired','credit_low','credit_expiring'));

notify pgrst, 'reload schema';

-- 0044_flat_video_pricing.sql
-- 0044_flat_video_pricing.sql · O01 (29/10/2026) : forfait par vidéo et par niveau, jusqu'à 30 s de clips.
-- Idempotent. Requiert 0042. Numéro 0044 : le 0043 est réservé au patch « optimisation vitesse » (L04).
-- Les colonnes de la grille à la seconde (grid_fcfa_per_second_*) restent en place : historique et retour arrière.
-- Le journal des coûts (usage_ledger.price_fcfa) garde le prix figé de chaque vidéo déjà lancée : rien n'est réécrit.
alter table public.pricing_settings add column if not exists video_price_fcfa_standard numeric(14,0) not null default 13000;
alter table public.pricing_settings add column if not exists video_price_fcfa_pro numeric(14,0) not null default 18000;
alter table public.pricing_settings add column if not exists video_price_fcfa_premium numeric(14,0) not null default 19000;
alter table public.pricing_settings drop constraint if exists pricing_settings_video_price_positive;
alter table public.pricing_settings add constraint pricing_settings_video_price_positive
  check (video_price_fcfa_standard > 0 and video_price_fcfa_pro > 0 and video_price_fcfa_premium > 0);

-- Trace du passage au forfait dans le journal des tarifs (une seule fois par marque).
insert into public.pricing_change_log(scope, brand_id, client_id, field, old_value, new_value)
select 'pricing', p.brand_id, b.client_id, 'Passage au forfait par vidéo (0044)', 'Grille à la seconde',
       p.video_price_fcfa_standard::text || ' / ' || p.video_price_fcfa_pro::text || ' / ' || p.video_price_fcfa_premium::text || ' FCFA (Standard / Pro / Premium)'
from public.pricing_settings p join public.brands b on b.id = p.brand_id
where not exists (select 1 from public.pricing_change_log l where l.brand_id = p.brand_id and l.field = 'Passage au forfait par vidéo (0044)');

notify pgrst, 'reload schema';

-- 0045_video_validation_setting.sql
-- 0045_video_validation_setting.sql · O03 (29/10/2026) : la validation d'une vidéo avant téléchargement devient un
-- réglage du client, désactivé par défaut. Désactivée : une vidéo prête se télécharge tout de suite (auteur, Manager).
-- Idempotent. Requiert 0042. La règle d'accès au stockage n'est pas modifiée : les liens de téléchargement sont signés
-- par le serveur (clé service), après le contrôle de droits fait dans /api/versions.
alter table public.client_billing_settings add column if not exists video_validation_enabled boolean not null default false;
notify pgrst, 'reload schema';
