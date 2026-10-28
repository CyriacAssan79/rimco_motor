import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { approveKeyframes } from '@/core/versions/keyframe-approval-actions';
import { refreshLiveVersion } from '@/core/versions/live';
import { env } from '@/env';

// The follow-up started after the answer (submissions, downloads) gets the same time budget as /refresh.
export const maxDuration = 60;

/** « Valider » one shot, or « Tout valider et lancer la vidéo »: the animation of the validated shots starts at once. */
const approveSchema = z.object({ shots: z.union([z.literal('all'), z.array(z.number().int().min(1).max(6)).min(1).max(6)]) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    const { id } = await context.params;
    const parsed = approveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, 'Choisissez les plans à valider.');
    // Simulation: nothing to animate, the validation is answered at once.
    if (env.PROVIDERS_MODE !== 'live') return NextResponse.json({ approved: parsed.data.shots === 'all' ? 'all' : parsed.data.shots.length, allApproved: true, simulated: true });
    const result = await approveKeyframes(actor, id, parsed.data.shots);
    // 28/10 · the validated shot leaves for its animation right after the answer, without waiting for the next follow-up.
    if (result.approved > 0) after(() => refreshLiveVersion(id, actor).then(() => undefined, (cause) => console.warn('refresh_after_approval_failed', cause instanceof Error ? cause.message : cause)));
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
