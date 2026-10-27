import { errorResponse, HttpError, getActor } from '@/core/auth/guards';
import { hasAdminRights } from '@/core/auth/roles';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { historyCsv, loadHistory } from '@/core/billing/credit-history';
import { creditScope, periodFilters } from '@/core/billing/credit-access';

/** CSV of the credits history (administrator of the client and KÔMIAN operator). */
export async function GET(request: Request) {
  try {
    const actor = await getActor();
    if (!hasAdminRights(actor)) throw new HttpError(403, 'L’export est réservé à l’administration.');
    const params = new URL(request.url).searchParams;
    const admin = createStorageAdminClient();
    const scope = await creditScope(admin, actor, params);
    const history = await loadHistory(admin, { clientId: scope.clientId, userId: scope.userId, ...periodFilters(params), limit: 5000 });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(historyCsv(history.lines, history.people, history.videos), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="credits-rimco-studio-${date}.csv"` } });
  } catch (error) { return errorResponse(error); }
}
