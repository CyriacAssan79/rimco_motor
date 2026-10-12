-- Enforce the user-facing routing table used by the Studio.
-- Standard: Wan 3.0 at 5s, Kling O3 Pro at 10/15s.
-- Premium: Veo 3.1 Fast at 5s, Seedance 2.5 at 10/15/20/30s.
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

notify pgrst, 'reload schema';
