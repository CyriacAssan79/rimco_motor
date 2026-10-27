import { NextResponse } from 'next/server';
import { errorResponse, getActor } from '@/core/auth/guards';
import { isOperator } from '@/core/auth/roles';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
import { creditSummary } from '@/core/billing/credits';
import { loadBillingSettings } from '@/core/billing/settings';
import { loadHistory, perPersonSummary } from '@/core/billing/credit-history';
import { creditScope, periodFilters } from '@/core/billing/credit-access';

/** Page « Crédits » (27/10): balance for everyone, the history by role. Never any production cost. */
export async function GET(request: Request) {
  try {
    const actor = await getActor();
    const params = new URL(request.url).searchParams;
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ summary: { enforced: false, availableFcfa: 0, heldFcfa: 0, lowBalance: false, thresholdFcfa: 50000, nextExpiry: null }, lines: [], people: {}, perPerson: [], prices: null, scope: { seesAll: true, operator: true } });
    }
    const admin = createStorageAdminClient();
    const scope = await creditScope(admin, actor, params);
    const settings = await loadBillingSettings(admin, scope.clientId);
    const summary = await creditSummary(admin, scope.clientId, settings);
    const operator = isOperator(actor);
    // Rollout (credits not applied): the client's users see nothing yet; the operator sees what is traced.
    if (!settings.creditsEnforced && !operator) return NextResponse.json({ summary, lines: [], people: {}, perPerson: [], prices: null, scope: { seesAll: scope.seesAll, operator } });
    const { data: pricing } = actor.brandId ? await admin.from('pricing_settings').select('grid_fcfa_per_second_standard,grid_fcfa_per_second_pro,grid_fcfa_per_second_premium').eq('brand_id', actor.brandId).maybeSingle() : { data: null };
    const prices = pricing ? { standard: Number(pricing.grid_fcfa_per_second_standard), pro: Number(pricing.grid_fcfa_per_second_pro), premium: Number(pricing.grid_fcfa_per_second_premium) } : null;
    if (params.get('history') === 'false') return NextResponse.json({ summary, prices, scope: { seesAll: scope.seesAll, operator } });
    const history = await loadHistory(admin, { clientId: scope.clientId, userId: scope.userId, ...periodFilters(params) });
    const type = params.get('type');
    const lines = type ? history.lines.filter((line) => line.kind.startsWith(type)) : history.lines;
    return NextResponse.json({
      summary, prices, lines,
      people: Object.fromEntries(history.people), videos: Object.fromEntries(history.videos),
      perPerson: scope.seesAll ? perPersonSummary(lines).map((row) => ({ ...row, name: history.people.get(row.userId) ?? 'Membre' })) : [],
      scope: { seesAll: scope.seesAll, operator, clientId: operator ? scope.clientId : undefined },
    });
  } catch (error) { return errorResponse(error); }
}
