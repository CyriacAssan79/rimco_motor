-- Refresh the catalog from verified provider schemas; unsupported models stay inactive.
update public.ai_models set is_active=false, is_default=false where fal_endpoint_id='TODO(verify-fal)';

update public.ai_models set allowed_durations='{6}', allowed_formats='{16:9,9:16}', is_active=true, is_default=true
where fal_endpoint_id='fal-ai/veo3.1/fast/image-to-video';

update public.ai_models set price_usd_per_second=0, allowed_durations='{}', allowed_formats='{}', is_active=false, is_default=false
where fal_endpoint_id='fal-ai/minimax/hailuo-2.3/pro/image-to-video';

insert into public.ai_models(name,tier,fal_endpoint_id,adapter_family,mode,price_usd_per_second,allowed_durations,allowed_formats,is_active,is_default)
values ('Wan 3.0','test','alibaba/wan-3.0/image-to-video','wan','image_to_video',0.10,'{5}','{16:9,9:16,1:1}',true,false)
on conflict(name) do update set tier=excluded.tier,fal_endpoint_id=excluded.fal_endpoint_id,
  adapter_family=excluded.adapter_family,mode=excluded.mode,price_usd_per_second=excluded.price_usd_per_second,
  allowed_durations=excluded.allowed_durations,allowed_formats=excluded.allowed_formats,
  is_active=excluded.is_active,is_default=excluded.is_default;
