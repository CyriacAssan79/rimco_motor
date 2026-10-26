import { NextResponse } from 'next/server';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { reviewShot, shotReviewSchema } from '@/core/versions/shot-review';
import { env } from '@/env';

/** Human decision on a shot stopped by a verifier: accept it, or send it back to the director once more. */
export async function POST(request: Request, context: { params: Promise<{ id: string; shot: string }> }) {
  try {
    if (env.PROVIDERS_MODE !== 'live') throw new HttpError(409, 'La décision sur un plan est disponible uniquement pour une génération réelle.');
    const actor = await getActor();
    const { id, shot } = await context.params;
    const shotNumber = Number(shot);
    if (!Number.isInteger(shotNumber) || shotNumber < 1 || shotNumber > 6) throw new HttpError(400, 'Numéro de plan invalide.');
    const parsed = shotReviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, 'Décision invalide : choisissez « accepter » ou « relancer ».');
    return NextResponse.json(await reviewShot(actor, id, shotNumber, parsed.data.decision));
  } catch (error) { return errorResponse(error); }
}
