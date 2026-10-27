import { NextResponse } from 'next/server';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { disagreementReport, disagreementsCsv } from '@/core/verification/disagreements';
import { env } from '@/env';

export async function GET(request: Request) {
  try {
    const actor = await getActor();
    if (actor.role !== 'admin') throw new HttpError(403, 'Ce relevé est réservé à l’administration.');
    const admin = env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL ? null : createStorageAdminClient();
    const shots = [];
    // PostgREST caps a response; paginate so the rate is never based on a silent first-page sample.
    for (let offset = 0; admin; offset += 500) {
      const { data, error } = await admin.from('video_shots').select('id,version_id,shot_number,keyframe_quality,video_quality,verification_history').order('id').range(offset, offset + 499);
      if (error) throw new HttpError(503, 'Impossible de charger les désaccords avec le vérificateur.');
      shots.push(...data ?? []);
      if (!data || data.length < 500) break;
    }
    const report = disagreementReport(shots);
    if (new URL(request.url).searchParams.get('format') === 'csv') return new Response(disagreementsCsv(report.events), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="rimco-desaccords.csv"', 'cache-control': 'no-store' } });
    return NextResponse.json(report, { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
