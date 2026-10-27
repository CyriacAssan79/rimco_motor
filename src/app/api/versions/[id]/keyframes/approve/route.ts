import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { approveKeyframes } from '@/core/versions/keyframe-approval-actions';
import { env } from '@/env';

/** « Valider » one shot, or « Tout valider et lancer la vidéo »: the next follow-up starts the animation once. */
const approveSchema = z.object({ shots: z.union([z.literal('all'), z.array(z.number().int().min(1).max(6)).min(1).max(6)]) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    const { id } = await context.params;
    const parsed = approveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, 'Choisissez les plans à valider.');
    // Simulation: nothing to animate, the validation is answered at once.
    if (env.PROVIDERS_MODE !== 'live') return NextResponse.json({ approved: parsed.data.shots === 'all' ? 'all' : parsed.data.shots.length, allApproved: true, simulated: true });
    return NextResponse.json(await approveKeyframes(actor, id, parsed.data.shots));
  } catch (error) { return errorResponse(error); }
}
