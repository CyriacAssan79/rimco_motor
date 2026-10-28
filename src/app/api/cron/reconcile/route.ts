import { NextResponse } from 'next/server';
import { cleanupClipPreviews } from '@/core/postproduction/pipeline';
import { env } from '@/env';
import { allVersions, putVersion } from '@/core/versions/store';
import { mockVideoProvider } from '@/core/providers/mock';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { refreshLiveVersion } from '@/core/versions/live';
import { refreshPersistedMockVersion } from '@/core/versions/mock-persistence';
import type { Actor } from '@/core/auth/guards';
import { runCreditMaintenance } from '@/core/notifications/credit-alerts';
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return NextResponse.json({ error: 'Accès refusé.' }, { status: 401 });
  if (env.PROVIDERS_MODE !== 'live') {
    if (env.NEXT_PUBLIC_SUPABASE_URL) {
      const admin = createStorageAdminClient();
      await runCreditMaintenance(admin).catch(() => undefined);
      const { data, error } = await admin.from('video_versions').select('id').like('provider_request_id', 'mock:%').in('status', ['queued','generating','postprocessing']).order('updated_at', { ascending: true }).limit(10);
      if (error) return NextResponse.json({ error: 'Impossible de charger les simulations en cours.' }, { status: 503 });
      const systemActor: Actor = { id: 'cron-reconcile', role: 'operateur', department: '', brandId: null };
      const results = await Promise.all((data ?? []).map(async ({ id }) => {
        try { const result = await refreshPersistedMockVersion(id, systemActor); return { id, status: result.status }; }
        catch { return { id, status: 'reconcile_failed' }; }
      }));
      return NextResponse.json({ reconciled: results.filter((row) => row.status !== 'reconcile_failed').length, failed: results.filter((row) => row.status === 'reconcile_failed').length, results });
    }
    const results = await Promise.all(allVersions().filter((v) => ['queued','generating','postprocessing'].includes(v.status)).map(async (version) => {
      const status = await mockVideoProvider.status(version.requestId);
      putVersion({ ...version, status: status.status, ...(status.videoUrl ? { videoUrl: status.videoUrl } : {}) });
      return { id: version.id, status: status.status };
    }));
    return NextResponse.json({ reconciled: results.length, results });
  }
  const admin = createStorageAdminClient();
  // 28/10 · ?scope=generations : appel fréquent (Supabase pg_cron, chaque minute) qui fait seulement avancer les
  // générations en cours ; le nettoyage et les crédits restent dans l'appel quotidien de Vercel.
  const generationsOnly = new URL(request.url).searchParams.get('scope') === 'generations';
  if (!generationsOnly) await cleanupClipPreviews(admin);
  // 27/10 · crédits : lots échus expirés (tracé dans le journal), alertes d'expiration et de solde bas.
  const credits = generationsOnly ? null : await runCreditMaintenance(admin).catch(() => ({ expiredLots: 0, warnings: 0, available: false }));
  const { data, error } = await admin.from('video_versions').select('id').in('status', ['queued','generating','postprocessing']).order('updated_at', { ascending: true }).limit(10);
  if (error) return NextResponse.json({ error: 'Impossible de charger les générations en cours.' }, { status: 503 });
  const systemActor: Actor = { id: 'cron-reconcile', role: 'operateur', department: '', brandId: null };
  const results = await Promise.all((data ?? []).map(async ({ id }) => {
    try { const result = await refreshLiveVersion(id, systemActor); return { id, status: result.status }; }
    catch { return { id, status: 'reconcile_failed' }; }
  }));
  return NextResponse.json({ credits, reconciled: results.filter((row) => row.status !== 'reconcile_failed').length, failed: results.filter((row) => row.status === 'reconcile_failed').length, results });
}
