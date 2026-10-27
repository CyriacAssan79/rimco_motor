import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { authorizeClipBoard } from '@/core/versions/clip-gate';
import { env } from '@/env';

const schema = z.object({ action: z.enum(['approve', 'unapprove', 'disable', 'enable']), shotNumber: z.number().int().min(1).max(6).optional() }).strict().refine((value) => value.action === 'approve' || value.shotNumber !== undefined);
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, 'Choisissez le clip et la décision.');
    if (env.PROVIDERS_MODE === 'mock') return NextResponse.json({ changed: true, simulated: true });
    const { admin } = await authorizeClipBoard(actor, id);
    const { data, error } = await admin.rpc('rimco_clip_review', { p_version_id: id, p_action: parsed.data.action, p_shot: parsed.data.shotNumber ?? null });
    if (error) throw new HttpError(409, error.message.includes('au moins un') ? 'Gardez au moins un clip actif.' : 'Cette décision n’a pas pu être enregistrée. Vérifiez la migration 0038.');
    if (!data?.changed) throw new HttpError(409, 'Le montage a déjà commencé ou le clip a changé. Actualisez la planche.');
    return NextResponse.json(data);
  } catch (error) { return errorResponse(error); }
}
