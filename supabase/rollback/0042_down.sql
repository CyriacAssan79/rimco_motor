-- Retour arrière de 0042_billing_and_credits.sql — À N'UTILISER QU'AVANT LA PREMIÈRE VRAIE RECHARGE.
-- Supprime les crédits (lots, blocages, journal), les réglages de facturation et le journal des tarifs.
-- Ne fait pas partie de setup.sql. À coller seul dans l'éditeur SQL de Supabase.
drop trigger if exists videos_settle_credits on public.videos;
drop trigger if exists videos_release_credits_on_delete on public.videos;
drop function if exists public.settle_video_credits();
drop function if exists public.credit_extend(uuid,timestamptz,text,uuid);
drop function if exists public.credit_adjust(uuid,numeric,text,uuid);
drop function if exists public.credit_topup(uuid,text,numeric,timestamptz,text,text,text,uuid);
drop function if exists public.credit_release(uuid,text);
drop function if exists public.credit_capture(uuid);
drop function if exists public.credit_hold(uuid,uuid,uuid,uuid,text,numeric,text);
drop function if exists public.credit_expire_due(uuid);
drop function if exists public.credit_available(uuid);
drop table if exists public.credit_movements;
drop table if exists public.credit_hold_allocations;
drop table if exists public.credit_holds;
drop table if exists public.credit_lots;
drop table if exists public.pricing_change_log;
drop table if exists public.client_billing_settings;
delete from public.notifications where type in ('credit_low','credit_expiring');
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('ready','failed','cancelled','validation','action_required','review_requested','approved','rejected','expired'));
notify pgrst, 'reload schema';
