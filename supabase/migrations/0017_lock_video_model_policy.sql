-- Matrice vidéo active unique et durable pour le Studio.
-- Les endpoints restent ceux vérifiés dans les adaptateurs fal du projet.
update public.ai_models
set is_active = false, is_default = false
where fal_endpoint_id not in (
  'alibaba/wan-3.0/image-to-video',
  'fal-ai/kling-video/o3/pro/image-to-video',
  'fal-ai/veo3.1/fast/image-to-video',
  'bytedance/seedance-2.5/image-to-video'
);

update public.ai_models set is_active = true, is_default = false, tier = 'standard', allowed_durations = '{5}', allowed_formats = '{16:9,9:16,1:1}'
where fal_endpoint_id = 'alibaba/wan-3.0/image-to-video';
update public.ai_models set is_active = true, is_default = true, tier = 'standard', allowed_durations = '{10,15}', allowed_formats = '{16:9,9:16,1:1}'
where fal_endpoint_id = 'fal-ai/kling-video/o3/pro/image-to-video';
update public.ai_models set is_active = true, is_default = true, tier = 'premium', allowed_durations = '{6}', allowed_formats = '{16:9,9:16}'
where fal_endpoint_id = 'fal-ai/veo3.1/fast/image-to-video';
update public.ai_models set is_active = true, is_default = false, tier = 'premium', allowed_durations = '{10,15,20,30}', allowed_formats = '{16:9,9:16,1:1}'
where fal_endpoint_id = 'bytedance/seedance-2.5/image-to-video';

notify pgrst, 'reload schema';
