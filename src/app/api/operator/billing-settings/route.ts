import { NextResponse } from 'next/server';
import { errorResponse, HttpError, requireOperator } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
import { BILLING_COLUMNS, BILLING_LABELS, billingSettingsPatchSchema, DEFAULT_BILLING_SETTINGS, settingsFromRow, type BillingSettings } from '@/core/billing/settings';
import { changedFields, logPricingChanges } from '@/core/billing/change-log';

/** Réglages de facturation par client (27/10) : réservés à l'opérateur KÔMIAN. */
export async function GET() {
  try {
    await requireOperator();
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ clients: [{ id: 'rimco', name: 'RIMCO Motors', settings: DEFAULT_BILLING_SETTINGS }] });
    const admin = createStorageAdminClient();
    const [{ data: clients, error }, { data: rows }] = await Promise.all([
      admin.from('clients').select('id,name').order('name'),
      admin.from('client_billing_settings').select('*'),
    ]);
    if (error) throw new HttpError(503, 'Les réglages ne sont pas disponibles : appliquez les migrations 0041 et 0042 dans Supabase.');
    const byClient = new Map((rows ?? []).map((row) => [row.client_id as string, row as Record<string, unknown>]));
    return NextResponse.json({ clients: (clients ?? []).map((client) => ({ id: client.id, name: client.name, settings: settingsFromRow(byClient.get(client.id)) })) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireOperator();
    const input = billingSettingsPatchSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ settings: { ...DEFAULT_BILLING_SETTINGS, ...input } });
    const admin = createStorageAdminClient();
    const patch: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(BILLING_COLUMNS) as Array<[keyof BillingSettings, string]>) {
      if (input[key] !== undefined) patch[column] = input[key];
    }
    if (!Object.keys(patch).length) throw new HttpError(422, 'Aucune modification fournie.');
    const { data: before } = await admin.from('client_billing_settings').select('*').eq('client_id', input.clientId).maybeSingle();
    const { data, error } = await admin.from('client_billing_settings')
      .upsert({ client_id: input.clientId, ...patch, updated_by: actor.id, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
      .select('*').single();
    if (error || !data) throw new HttpError(400, 'Les réglages n’ont pas pu être enregistrés.');
    const labels = Object.fromEntries(Object.keys(patch).map((column) => [column, BILLING_LABELS[column] ?? column]));
    await logPricingChanges(admin, { scope: 'billing_settings', clientId: input.clientId, actorId: actor.id, changes: changedFields(before as Record<string, unknown> | null, patch, labels) });
    return NextResponse.json({ settings: settingsFromRow(data as Record<string, unknown>) });
  } catch (error) { return errorResponse(error); }
}
