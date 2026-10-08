import { NextResponse } from 'next/server';
import { env } from '@/env';
import { allVersions, putVersion } from '@/core/versions/store';
import { mockVideoProvider } from '@/core/providers/mock';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { refreshLiveVersion } from '@/core/versions/live';
import { refreshPersistedMockVersion } from '@/core/versions/mock-persistence';
import type { Actor } from '@/core/auth/guards';
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return NextResponse.json({ error: 'Accès refusé.' }, { status: 401 });
  if (env.PROVIDERS_MODE !== 'live') {
    if (env.NEXT_PUBLIC_SUPABASE_URL) {
      const admin = createStorageAdminClient();
      const { data, error } = await admin.from('video_versions').select('id').like('provider_request_id', 'mock:%').in('status', ['queued','generating','postprocessing']).order('updated_at', { ascending: true }).limit(10);
      if (error) return NextResponse.json({ error: 'Impossible de charger les simulations en cours.' }, { status: 503 });
      const systemActor: Actor = { id: 'cron-reconcile', role: 'admin', department: '', brandId: null };
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
  const { data, error } = await admin.from('video_versions').select('id').in('status', ['queued','generating','postprocessing']).order('updated_at', { ascending: true }).limit(10);
  if (error) return NextResponse.json({ error: 'Impossible de charger les générations en cours.' }, { status: 503 });
  const systemActor: Actor = { id: 'cron-reconcile', role: 'admin', department: '', brandId: null };
  const results = await Promise.all((data ?? []).map(async ({ id }) => {
    try { const result = await refreshLiveVersion(id, systemActor); return { id, status: result.status }; }
    catch { return { id, status: 'reconcile_failed' }; }
  }));
  return NextResponse.json({ reconciled: results.filter((row) => row.status !== 'reconcile_failed').length, failed: results.filter((row) => row.status === 'reconcile_failed').length, results });
}
