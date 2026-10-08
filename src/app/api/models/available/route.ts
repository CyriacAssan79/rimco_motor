import { NextResponse } from 'next/server';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';

export async function GET() {
  try {
    const actor = await getActor();
    if (env.PROVIDERS_MODE === 'mock') return NextResponse.json({ tiers: [] });
    const admin = createStorageAdminClient();
    const { data, error } = await admin.from('ai_models').select('tier,fal_endpoint_id,adapter_family,allowed_durations,allowed_formats,is_active').eq('is_active', true);
    if (error) throw new HttpError(503, 'Impossible de charger les modèles disponibles.');
    const tiers = (data ?? []).flatMap((model) => {
      const supported = model.adapter_family === 'kling' && model.fal_endpoint_id === 'fal-ai/kling-video/v2.6/pro/image-to-video' && model.allowed_durations.includes(5)
        || model.adapter_family === 'veo' && model.fal_endpoint_id === 'fal-ai/veo3.1/fast/image-to-video' && model.allowed_durations.includes(6)
        || actor.role === 'admin' && model.adapter_family === 'wan' && model.fal_endpoint_id === 'alibaba/wan-3.0/image-to-video' && model.allowed_durations.includes(5);
      if (!supported) return [];
      const tier = model.adapter_family === 'veo' ? 'premium' : model.adapter_family === 'wan' ? 'test' : 'standard';
      return [{ tier, formats: model.allowed_formats }];
    });
    return NextResponse.json({ tiers });
  } catch (error) { return errorResponse(error); }
}
