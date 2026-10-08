import { NextResponse } from 'next/server';
import { requireRole, errorResponse } from '@/core/auth/guards';
import { allVersions } from '@/core/versions/store';
import { env } from '@/env';
import { createStorageAdminClient } from '@/core/storage/supabase';
export async function GET() {
  try {
    await requireRole('admin');
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) {
      const spentEur = 0;
      return NextResponse.json({ capEur: env.BUDGET_CAP_EUR, spentEur, usagePercent: 0, alert: false, simulation: true, versions: allVersions().length, rows: [] });
    }
    const admin = createStorageAdminClient();
    const { data, error } = await admin.from('usage_ledger').select('id,version_id,user_id,department,ai_model_id,kind,seconds,cost_usd,cost_eur,cost_real_fcfa,applied_fcfa_per_second,price_fcfa,status,created_at,video_versions(video_id,videos(title)),ai_models(name),profiles(name)').order('created_at', { ascending: false });
    if (error) throw error;
    const spentEur = (data ?? []).filter((row) => row.status !== 'released').reduce((sum, row) => sum + Number(row.cost_eur), 0);
    const rows = (data ?? []).map((row) => {
      const version = Array.isArray(row.video_versions) ? row.video_versions[0] : row.video_versions;
      const video = Array.isArray(version?.videos) ? version.videos[0] : version?.videos;
      const model = Array.isArray(row.ai_models) ? row.ai_models[0] : row.ai_models;
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return { version_id: row.version_id, video_id: version?.video_id, title: video?.title ?? 'Vidéo', user_name: profile?.name ?? 'Utilisateur', kind: row.kind, seconds: Number(row.seconds), price_fcfa: Number(row.price_fcfa), applied_fcfa_per_second: Number(row.applied_fcfa_per_second), cost_usd: Number(row.cost_usd), cost_eur: Number(row.cost_eur), cost_real_fcfa: Number(row.cost_real_fcfa), department: row.department, model_name: model?.name ?? 'Modèle externe', status: row.status, created_at: row.created_at };
    });
    return NextResponse.json({ capEur: env.BUDGET_CAP_EUR, spentEur, usagePercent: Math.min(100, spentEur / env.BUDGET_CAP_EUR * 100), alert: spentEur >= env.BUDGET_CAP_EUR * 0.8, simulation: env.PROVIDERS_MODE === 'mock', rows });
  } catch (error) { return errorResponse(error); }
}
