import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireRole, HttpError } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { createSignedStorageObjectUrl } from '@/core/storage/signed-video';
import { retryFailedMontage } from '@/core/postproduction/retry-montage';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole('admin');
    const parsed = z.object({ id: z.string().uuid() }).safeParse(await context.params);
    if (!parsed.success) throw new HttpError(400, 'Version invalide.');
    const admin = createStorageAdminClient();
    const { finalPath } = await retryFailedMontage(admin, parsed.data.id, actor);
    const videoUrl = await createSignedStorageObjectUrl((path, expires) => admin.storage.from('videos').createSignedUrl(path, expires), 'videos', finalPath);
    return NextResponse.json({ id: parsed.data.id, status: 'ready', videoUrl, generationResubmitted: false });
  } catch (error) { return errorResponse(error); }
}
