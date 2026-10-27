import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireOperator } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';

/** Corriger (montant retiré, motif obligatoire) ou prolonger un lot. Jamais de suppression : tout reste au journal. */
const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('adjust'), amountFcfa: z.number().int().positive().max(1_000_000_000), note: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal('extend'), expiresAt: z.string().date(), note: z.string().trim().max(500).optional() }).strict(),
]);

export async function PATCH(request: Request, context: { params: Promise<{ lotId: string }> }) {
  try {
    const actor = await requireOperator();
    const { lotId } = await context.params;
    if (!z.string().uuid().safeParse(lotId).success) throw new HttpError(404, 'Lot introuvable.');
    const input = patchSchema.parse(await request.json());
    const admin = createStorageAdminClient();
    const { error } = input.action === 'adjust'
      ? await admin.rpc('credit_adjust', { p_lot: lotId, p_amount: input.amountFcfa, p_note: input.note, p_actor: actor.id })
      : await admin.rpc('credit_extend', { p_lot: lotId, p_expires_at: `${input.expiresAt}T23:59:59Z`, p_note: input.note ?? null, p_actor: actor.id });
    if (error) {
      const message = error.message ?? '';
      if (message.includes('supérieur au reste')) throw new HttpError(422, 'Le montant à retirer dépasse ce qui reste sur ce lot.');
      if (message.includes('prolongé')) throw new HttpError(422, 'Seul un lot non expiré peut être prolongé, vers une date plus lointaine.');
      throw new HttpError(503, 'L’opération n’a pas pu être enregistrée.');
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
