import type { SupabaseClient } from '@supabase/supabase-js';
import { MOVEMENT_LABELS } from './credits';

/**
 * Credits history shown to people (27/10). The journal (credit_movements) records every step; a video is shown as ONE
 * line whose state follows its hold: « Vidéo en cours (réservé) », « Vidéo débitée », or « Vidéo non facturée »
 * (failed, cancelled or interrupted: the amount came back). Top-ups, gifts, corrections, expiries and extensions are
 * shown as they are. Amounts are signed effects on the available balance.
 */
export type MovementRow = {
  id: number; type: string; amount_fcfa: number | string; available_after_fcfa: number | string; created_at: string;
  hold_id?: string | null; lot_id?: string | null; user_id?: string | null; video_id?: string | null; version_id?: string | null; note?: string | null; created_by?: string | null;
};
export type HoldRow = { id: string; status: 'held' | 'captured' | 'released'; kind: 'video' | 'revision'; amount_fcfa: number | string; enforced: boolean; user_id: string; video_id?: string | null; created_at: string; settled_at?: string | null };

export type HistoryLine = {
  key: string;
  at: string;
  kind: 'topup' | 'gift' | 'video_held' | 'video_debited' | 'video_free' | 'revision_debited' | 'revision_held' | 'revision_free' | 'expiry' | 'adjustment' | 'extension';
  label: string;
  amountFcfa: number;
  availableAfterFcfa: number;
  userId: string | null;
  videoId: string | null;
  note: string | null;
  /** false while credits were not applied (rollout): traced, nothing was debited. */
  enforced: boolean;
};

const n = (value: unknown) => { const number = Number(value); return Number.isFinite(number) ? number : 0; };

export function buildHistory(movements: MovementRow[], holds: HoldRow[]): HistoryLine[] {
  const holdById = new Map(holds.map((hold) => [hold.id, hold]));
  const byHold = new Map<string, MovementRow[]>();
  const lines: HistoryLine[] = [];
  for (const movement of movements) {
    if (movement.hold_id) { byHold.set(movement.hold_id, [...(byHold.get(movement.hold_id) ?? []), movement]); continue; }
    if (!(movement.type in MOVEMENT_LABELS)) continue;
    lines.push({
      key: `m${movement.id}`, at: movement.created_at, kind: movement.type as HistoryLine['kind'], label: MOVEMENT_LABELS[movement.type],
      amountFcfa: n(movement.amount_fcfa), availableAfterFcfa: n(movement.available_after_fcfa), userId: movement.user_id ?? movement.created_by ?? null,
      videoId: movement.video_id ?? null, note: movement.note ?? null, enforced: true,
    });
  }
  for (const [holdId, steps] of byHold) {
    const sorted = [...steps].sort((left, right) => left.id - right.id);
    const hold = holdById.get(holdId);
    const status = hold?.status ?? (sorted.some((step) => step.type === 'release') ? 'released' : sorted.some((step) => step.type === 'capture') ? 'captured' : 'held');
    const revision = hold?.kind === 'revision';
    const enforced = hold?.enforced ?? n(sorted[0].amount_fcfa) !== 0;
    const amount = hold ? n(hold.amount_fcfa) : Math.abs(n(sorted[0].amount_fcfa));
    const last = sorted[sorted.length - 1];
    const kind: HistoryLine['kind'] = status === 'captured' ? (revision ? 'revision_debited' : 'video_debited') : status === 'released' ? (revision ? 'revision_free' : 'video_free') : (revision ? 'revision_held' : 'video_held');
    const label = { video_debited: 'Vidéo débitée', video_free: 'Vidéo non facturée', video_held: 'Vidéo en cours (réservé)', revision_debited: 'Modification débitée', revision_free: 'Modification non facturée', revision_held: 'Modification en cours (réservé)' }[kind as 'video_debited'];
    lines.push({
      key: `h${holdId}`, at: sorted[0].created_at, kind, label,
      amountFcfa: status === 'released' || !enforced ? 0 : -amount,
      availableAfterFcfa: n((status === 'held' ? sorted[0] : last).available_after_fcfa),
      userId: hold?.user_id ?? sorted[0].user_id ?? null, videoId: hold?.video_id ?? sorted[0].video_id ?? null,
      note: status === 'released' ? 'Montant libéré : rien n’est débité.' : enforced ? null : `Tracé sans débit (crédits non appliqués) · ${amount} FCFA`,
      enforced,
    });
  }
  return lines.sort((left, right) => right.at.localeCompare(left.at));
}

/** Per person over the period: debited videos and amount (administrator view). */
export function perPersonSummary(lines: HistoryLine[]) {
  const totals = new Map<string, { userId: string; videos: number; debitedFcfa: number }>();
  for (const line of lines) {
    if (!line.userId || (line.kind !== 'video_debited' && line.kind !== 'revision_debited')) continue;
    const current = totals.get(line.userId) ?? { userId: line.userId, videos: 0, debitedFcfa: 0 };
    if (line.kind === 'video_debited') current.videos += 1;
    current.debitedFcfa += -line.amountFcfa;
    totals.set(line.userId, current);
  }
  return [...totals.values()].sort((left, right) => right.debitedFcfa - left.debitedFcfa);
}

export type HistoryFilters = { clientId: string; userId?: string | null; from?: string | null; to?: string | null; limit?: number };

/** Reads the journal and the holds of a client (optionally of one person, over a period) and builds the lines. */
export async function loadHistory(admin: SupabaseClient, filters: HistoryFilters) {
  let movements = admin.from('credit_movements').select('id,type,amount_fcfa,available_after_fcfa,created_at,hold_id,lot_id,user_id,video_id,version_id,note,created_by').eq('client_id', filters.clientId).order('id', { ascending: false }).limit(filters.limit ?? 500);
  if (filters.userId) movements = movements.eq('user_id', filters.userId);
  if (filters.from) movements = movements.gte('created_at', filters.from);
  if (filters.to) movements = movements.lte('created_at', filters.to);
  const { data: rows, error } = await movements;
  if (error) return { lines: [] as HistoryLine[], people: new Map<string, string>(), videos: new Map<string, string>(), available: false };
  const holdIds = [...new Set((rows ?? []).map((row) => row.hold_id).filter(Boolean))] as string[];
  const { data: holds } = holdIds.length ? await admin.from('credit_holds').select('id,status,kind,amount_fcfa,enforced,user_id,video_id,created_at,settled_at').in('id', holdIds) : { data: [] };
  const lines = buildHistory((rows ?? []) as MovementRow[], (holds ?? []) as HoldRow[]);
  const userIds = [...new Set(lines.map((line) => line.userId).filter(Boolean))] as string[];
  const videoIds = [...new Set(lines.map((line) => line.videoId).filter(Boolean))] as string[];
  const [{ data: people }, { data: videos }] = await Promise.all([
    userIds.length ? admin.from('profiles').select('id,name').in('id', userIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    videoIds.length ? admin.from('videos').select('id,title').in('id', videoIds) : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
  ]);
  return {
    lines,
    people: new Map((people ?? []).map((person) => [String(person.id), String(person.name || 'Membre')])),
    videos: new Map((videos ?? []).map((video) => [String(video.id), String(video.title || 'Vidéo')])),
    available: true,
  };
}

/** CSV in French, amounts as whole FCFA, separator « ; » (opens directly in Excel set to French). */
export function historyCsv(lines: HistoryLine[], people: Map<string, string>, videos: Map<string, string>) {
  const escape = (value: string) => /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const header = ['Date', 'Opération', 'Personne', 'Vidéo', 'Montant (FCFA)', 'Solde après (FCFA)', 'Note'];
  const body = lines.map((line) => [
    new Date(line.at).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' }), line.label, line.userId ? people.get(line.userId) ?? '' : '',
    line.videoId ? videos.get(line.videoId) ?? '' : '', String(Math.round(line.amountFcfa)), String(Math.round(line.availableAfterFcfa)), line.note ?? '',
  ].map((cell) => escape(cell)).join(';'));
  return `﻿${[header.join(';'), ...body].join('\n')}\n`;
}
