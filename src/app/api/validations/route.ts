import { notify } from '@/core/notifications/notify';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, getActor, hasAdminRights, HttpError } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';

const submitSchema = z.object({ versionId: z.string().uuid() }).strict();

type AdminClient = ReturnType<typeof createStorageAdminClient>;

async function activeIds(query: PromiseLike<{ data: Array<{ id: string }> | null; error: unknown }>) {
  const { data, error } = await query;
  return error ? null : (data ?? []).map((row) => String(row.id));
}

/**
 * 27/10 · who is told that a video waits: the collaborators holding the right to validate, in the client of the video
 * (no departments); without any, the client's administrators; without any, the KÔMIAN operators.
 */
async function notifyValidators(admin: AdminClient, input: { validationId: string; versionId: string; title?: string | null; brandId: string | null; submittedBy: string }) {
  const { data: brand } = input.brandId ? await admin.from('brands').select('client_id').eq('id', input.brandId).maybeSingle() : { data: null };
  const brandIds = brand?.client_id
    ? ((await admin.from('brands').select('id').eq('client_id', brand.client_id)).data ?? []).map((row) => String(row.id))
    : input.brandId ? [input.brandId] : [];
  let validators = brandIds.length ? await activeIds(admin.from('profiles').select('id').eq('role', 'collaborateur').eq('can_validate', true).eq('is_active', true).in('brand_id', brandIds)) : [];
  // Before migration 0041 the right to validate was the role « valideur ».
  if (validators === null) validators = brandIds.length ? await activeIds(admin.from('profiles').select('id').eq('role', 'valideur').eq('is_active', true).in('brand_id', brandIds)) ?? [] : [];
  // The author may validate their own video, but is not told about it: the next level is told instead.
  const others = (ids: string[]) => ids.filter((id) => id !== input.submittedBy);
  validators = others(validators);
  const admins = validators.length || !brandIds.length ? [] : others(await activeIds(admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).in('brand_id', brandIds)) ?? []);
  const operators = validators.length || admins.length ? [] : others(await activeIds(admin.from('profiles').select('id').in('role', ['operateur', 'admin']).eq('is_active', true)) ?? []);
  const recipients = [...new Set([...validators, ...admins, ...operators])];
  await notify(admin, recipients.map((userId) => ({
    userId, versionId: input.versionId, type: 'review_requested' as const,
    message: `Une vidéo${input.title ? ` « ${input.title} »` : ''} attend votre validation.`,
    dedupeKey: `review_requested:${input.validationId}`,
  })));
}

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    const input = submitSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ status: 'review' }, { status: 201 });
    const admin = createStorageAdminClient();
    const { data: version, error: versionError } = await admin.from('video_versions').select('id,video_id,video:videos!inner(id,user_id,title,brand_id,department,status)').eq('id', input.versionId).single();
    if (versionError || !version) throw new HttpError(404, 'Version introuvable.');
    const video = Array.isArray(version.video) ? version.video[0] : version.video;
    if (!video || !hasAdminRights(actor) && video.user_id !== actor.id) throw new HttpError(403, 'Cette vidéo ne vous appartient pas.');
    if (!['ready', 'approved'].includes(video.status)) throw new HttpError(409, 'La vidéo doit être prête avant sa validation.');
    const { data, error } = await admin.from('validations').insert({ video_id: video.id, version_id: version.id, submitted_by: actor.id, status: 'pending' }).select('id,status').single();
    if (error) throw error;
    await admin.from('videos').update({ status: 'review', updated_at: new Date().toISOString() }).eq('id', video.id);
    await notifyValidators(admin, { validationId: data.id, versionId: version.id, title: video.title, brandId: video.brand_id, submittedBy: actor.id });
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
