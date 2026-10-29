import { NextResponse } from 'next/server';
import { errorResponse, HttpError, requireOperator } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { handleReportSchema } from '@/core/versions/shot-reports';
import { env } from '@/env';

/** 29/10 · S03 simple · Espace KÔMIAN : plans déclarés non conformes, et suivi du recrédit des erreurs techniques. */
export async function GET(request: Request) {
  try {
    await requireOperator();
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ reports: [] });
    const params = new URL(request.url).searchParams;
    const admin = createStorageAdminClient();
    let query = admin.from('shot_reports')
      .select('id,version_id,video_id,video_title,shot_number,stage,kind,reasons,comment,decision,reported_by,created_at,status,credited_fcfa,handling_note,handled_at,client_id')
      .order('created_at', { ascending: false }).limit(500);
    const kind = params.get('kind');
    if (kind === 'technical' || kind === 'creative') query = query.eq('kind', kind);
    if (params.get('status') === 'open') query = query.eq('status', 'open').eq('kind', 'technical');
    const { data, error } = await query;
    if (error) throw new HttpError(503, 'Les signalements ne sont pas disponibles : appliquez la migration 0046 dans Supabase.');
    const peopleIds = [...new Set((data ?? []).map((row) => row.reported_by).filter(Boolean))];
    const clientIds = [...new Set((data ?? []).map((row) => row.client_id).filter(Boolean))];
    const [{ data: people }, { data: clients }] = await Promise.all([
      peopleIds.length ? admin.from('profiles').select('id,name').in('id', peopleIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
      clientIds.length ? admin.from('clients').select('id,name').in('id', clientIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    ]);
    const names = new Map((people ?? []).map((row) => [row.id, row.name ?? 'Membre']));
    const clientNames = new Map((clients ?? []).map((row) => [row.id, row.name ?? 'Client']));
    return NextResponse.json({ reports: (data ?? []).map((row) => ({
      id: row.id, versionId: row.version_id, videoId: row.video_id, videoTitle: row.video_title ?? 'Vidéo', shotNumber: row.shot_number,
      stage: row.stage, kind: row.kind, reasons: row.reasons ?? [], comment: row.comment, decision: row.decision,
      reportedBy: names.get(row.reported_by) ?? 'Membre', clientName: row.client_id ? clientNames.get(row.client_id) ?? 'Client' : '—',
      createdAt: row.created_at, status: row.status, creditedFcfa: row.credited_fcfa === null ? null : Number(row.credited_fcfa), note: row.handling_note, handledAt: row.handled_at,
    })) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireOperator();
    const parsed = handleReportSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.find((issue) => issue.code === 'custom')?.message ?? 'Décision invalide : montant ou motif manquant.');
    const input = parsed.data;
    const admin = createStorageAdminClient();
    // Une seule décision par erreur technique : la mise à jour ne passe que sur une ligne encore « à traiter ».
    const { data, error } = await admin.from('shot_reports').update({
      status: input.status, credited_fcfa: input.status === 'credited' ? input.creditedFcfa : null, handling_note: input.note,
      handled_by: actor.id, handled_at: new Date().toISOString(),
    }).eq('id', input.id).eq('kind', 'technical').eq('status', 'open').select('id').maybeSingle();
    if (error) throw new HttpError(503, 'La décision n’a pas pu être enregistrée.');
    if (!data) throw new HttpError(409, 'Ce signalement a déjà été traité, ou ce n’est pas une erreur technique.');
    return NextResponse.json({ handled: true });
  } catch (error) { return errorResponse(error); }
}
