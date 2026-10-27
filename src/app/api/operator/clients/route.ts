import { NextResponse } from 'next/server';
import { errorResponse, HttpError, requireOperator } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
import { creditSummary } from '@/core/billing/credits';
import { DEFAULT_BILLING_SETTINGS, loadBillingSettings } from '@/core/billing/settings';

/** Espace KÔMIAN · clients, their balance and their credit lots (27/10). */
export async function GET() {
  try {
    await requireOperator();
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ clients: [{ id: 'rimco', name: 'RIMCO Motors', settings: DEFAULT_BILLING_SETTINGS, summary: { enforced: false, availableFcfa: 0, heldFcfa: 0, lowBalance: false, thresholdFcfa: 50000, nextExpiry: null }, lots: [] }] });
    const admin = createStorageAdminClient();
    const { data: clients, error } = await admin.from('clients').select('id,name,is_active').order('name');
    if (error) throw new HttpError(503, 'Les crédits ne sont pas disponibles : appliquez les migrations 0041 et 0042 dans Supabase.');
    const rows = await Promise.all((clients ?? []).map(async (client) => {
      const settings = await loadBillingSettings(admin, client.id);
      const [summary, { data: lots }] = await Promise.all([
        creditSummary(admin, client.id, settings),
        admin.from('credit_lots').select('id,kind,amount_fcfa,remaining_fcfa,expires_at,invoice_ref,payment_ref,note,created_at').eq('client_id', client.id).order('created_at', { ascending: false }).limit(100),
      ]);
      return {
        id: client.id, name: client.name, settings, summary,
        lots: (lots ?? []).map((lot) => ({ id: lot.id, kind: lot.kind, amountFcfa: Number(lot.amount_fcfa), remainingFcfa: Number(lot.remaining_fcfa), expiresAt: lot.expires_at, invoiceRef: lot.invoice_ref, paymentRef: lot.payment_ref, note: lot.note, createdAt: lot.created_at })),
      };
    }));
    return NextResponse.json({ clients: rows });
  } catch (error) { return errorResponse(error); }
}
