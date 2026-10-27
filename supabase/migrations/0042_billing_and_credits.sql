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
