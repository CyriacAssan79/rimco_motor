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
