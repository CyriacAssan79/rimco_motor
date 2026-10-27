import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireOperator } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined);
/** « Recharger » (achat) ou « Offrir » : références de facture et de paiement facultatives (décision du 27/10). */
const topupSchema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(['purchase', 'gift']),
  amountFcfa: z.number().int().positive().max(1_000_000_000),
  expiresAt: z.string().date().optional(),
  invoiceRef: optionalText(120),
  paymentRef: optionalText(120),
  note: optionalText(500),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await requireOperator();
    const input = topupSchema.parse(await request.json());
    const admin = createStorageAdminClient();
    const { data, error } = await admin.rpc('credit_topup', {
      p_client: input.clientId, p_kind: input.kind, p_amount: input.amountFcfa,
      p_expires_at: input.expiresAt ? `${input.expiresAt}T23:59:59Z` : null,
      p_invoice_ref: input.invoiceRef ?? null, p_payment_ref: input.paymentRef ?? null, p_note: input.note ?? null, p_actor: actor.id,
    });
    if (error || !data) throw new HttpError(error?.message?.includes('expiration') ? 422 : 503, error?.message?.includes('expiration') ? 'La date d’expiration doit être dans le futur.' : 'La recharge n’a pas pu être enregistrée. Vérifiez que la migration 0042 est appliquée.');
    return NextResponse.json({ lotId: data }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
