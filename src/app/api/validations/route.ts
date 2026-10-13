import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';

const submitSchema = z.object({ versionId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (actor.role !== 'collaborateur' && actor.role !== 'admin') throw new HttpError(403, 'Seuls les créateurs et administrateurs peuvent envoyer une vidéo en validation.');
    const input = submitSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ status: 'review' }, { status: 201 });
    const admin = createStorageAdminClient();
    const { data: version, error: versionError } = await admin.from('video_versions').select('id,video_id,video:videos!inner(id,user_id,brand_id,department,status)').eq('id', input.versionId).single();
    if (versionError || !version) throw new HttpError(404, 'Version introuvable.');
    const video = Array.isArray(version.video) ? version.video[0] : version.video;
    if (!video || actor.role !== 'admin' && video.user_id !== actor.id) throw new HttpError(403, 'Cette vidéo ne vous appartient pas.');
    if (!['ready', 'approved'].includes(video.status)) throw new HttpError(409, 'La vidéo doit être prête avant sa validation.');
    const { data, error } = await admin.from('validations').insert({ video_id: video.id, version_id: version.id, submitted_by: actor.id, status: 'pending' }).select('id,status').single();
    if (error) throw error;
    await admin.from('videos').update({ status: 'review', updated_at: new Date().toISOString() }).eq('id', video.id);
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
