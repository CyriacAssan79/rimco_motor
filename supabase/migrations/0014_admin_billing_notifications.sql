-- 0014: coût affiché avec une majoration de 30 % et notifications idempotentes.
-- Le montant présenté à l'administration est le total combiné LLM + fournisseur Fal.
create unique index if not exists notifications_user_version_type_idx
  on public.notifications(user_id, version_id, type)
  where version_id is not null;

drop function if exists public.settle_budget(uuid,text,numeric,numeric,numeric);
create function public.settle_budget(
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

-- Les téléchargements sont réservés aux vidéos approuvées.
drop policy if exists rimco_storage_read on storage.objects;
create policy rimco_storage_read on storage.objects for select to authenticated using(
  public.is_admin() or
  (bucket_id='brand' and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='brand' and exists(select 1 from public.assets a join public.profiles p on p.id=auth.uid() and p.brand_id=a.brand_id and p.is_active where a.path=name and a.kind='logo' and a.status='validée')) or
  (bucket_id in ('assets','audio') and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='assets' and exists(select 1 from public.assets a where a.path=name and a.status='validée')) or
  (bucket_id='audio' and exists(select 1 from public.assets a where a.path=name and a.kind='audio' and a.status='validée')) or
  (bucket_id='videos' and exists(select 1 from public.videos v join public.video_versions vv on vv.video_id=v.id where v.status='approved' and vv.final_path=name)) or
  (bucket_id='videos' and exists(select 1 from public.profiles p join public.videos v on v.brand_id=p.brand_id and v.department=p.department and v.status='review' join public.video_versions vv on vv.video_id=v.id where p.id=auth.uid() and p.role='valideur' and p.is_active and vv.final_path=name))
);
