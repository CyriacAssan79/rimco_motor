import { NextResponse } from 'next/server';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { mockVideoProvider } from '@/core/providers/mock';
import { getVersion, putVersion } from '@/core/versions/store';
import { env } from '@/env';
import { refreshLiveVersion } from '@/core/versions/live';
import { refreshPersistedMockVersion } from '@/core/versions/mock-persistence';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    const { id } = await context.params;
    if (env.PROVIDERS_MODE === 'live') return NextResponse.json(await refreshLiveVersion(id, actor));
    if (env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json(await refreshPersistedMockVersion(id, actor));
    const current = getVersion(id);
    if (!current || current.userId !== actor.id && actor.role !== 'admin') throw new HttpError(404, 'Cette version est introuvable.');
    if (current.status === 'ready' || current.status === 'failed') return NextResponse.json({ id, status: current.status, videoUrl: current.status === 'ready' ? current.videoUrl : undefined, error: current.error });
    const result = await mockVideoProvider.status(current.requestId);
    const updated = putVersion({ ...current, status: result.status, ...(result.videoUrl ? { videoUrl: result.videoUrl } : {}), ...(result.error ? { error: result.error } : {}) });
    return NextResponse.json({ id, status: updated.status, videoUrl: updated.status === 'ready' ? updated.videoUrl : undefined, error: updated.error });
  } catch (error) { return errorResponse(error); }
}
