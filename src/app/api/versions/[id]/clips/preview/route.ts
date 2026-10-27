import { NextResponse } from 'next/server';
import { errorResponse, getActor } from '@/core/auth/guards';
import { authorizeClipBoard } from '@/core/versions/clip-gate';
import { createClipPreview } from '@/core/postproduction/pipeline';
import { env } from '@/env';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    const { id } = await context.params;
    if (env.PROVIDERS_MODE === 'mock') return NextResponse.json({ url: '/mock/mock-video.mp4', simulated: true });
    const { admin, version, brief } = await authorizeClipBoard(actor, id);
    return NextResponse.json(await createClipPreview(admin, version, brief));
  } catch (error) { return errorResponse(error); }
}
