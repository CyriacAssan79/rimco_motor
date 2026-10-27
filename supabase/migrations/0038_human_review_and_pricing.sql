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
