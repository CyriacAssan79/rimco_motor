'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatFcfa } from '@/core/pricing';
import { DECISION_LABELS, KIND_LABELS, reasonLabels, REPORT_STATUS_LABELS, STAGE_LABELS, type NonConformityKind, type ReportDecision, type ReportStage } from '@/core/versions/shot-reports';

type Report = {
  id: string; videoId: string | null; videoTitle: string; shotNumber: number; stage: ReportStage; kind: NonConformityKind; reasons: string[];
  comment: string | null; decision: ReportDecision; reportedBy: string; clientName: string; createdAt: string;
  status: keyof typeof REPORT_STATUS_LABELS; creditedFcfa: number | null; note: string | null; handledAt: string | null;
};
const FILTERS = [['open', 'Erreurs techniques à traiter'], ['technical', 'Toutes les erreurs techniques'], ['creative', 'Reprises créatives'], ['all', 'Tout']] as const;
const field = 'min-h-11 rounded-sm border border-[#d4d4d8] bg-white px-3 text-xs font-normal';
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** 29/10 · S03 simple : suivi des plans non conformes ; le recrédit lui-même passe par « Crédit offert ». */
export function ShotReports() {
  const [filter, setFilter] = useState<typeof FILTERS[number][0]>('open');
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { amount: string; note: string }>>({});
  const load = useCallback(async () => {
    const query = filter === 'open' ? '?status=open' : filter === 'all' ? '' : `?kind=${filter}`;
    const response = await fetch(`/api/operator/shot-reports${query}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'Les signalements sont indisponibles.');
    setReports(data.reports ?? []);
  }, [filter]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Les signalements sont indisponibles.')); }, [load]);

  async function handle(report: Report, status: 'credited' | 'refused') {
    const draft = drafts[report.id] ?? { amount: '', note: '' };
    setBusy(report.id); setError(''); setNotice('');
    try {
      const response = await fetch('/api/operator/shot-reports', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: report.id, status, note: draft.note, ...(status === 'credited' ? { creditedFcfa: Math.round(Number(draft.amount)) } : {}) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'La décision n’a pas pu être enregistrée.');
      setNotice(status === 'credited' ? 'Recrédit inscrit. Vérifiez que le Crédit offert correspondant est bien fait dans Clients et crédits.' : 'Signalement refusé, motif inscrit.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'La décision n’a pas pu être enregistrée.'); }
    finally { setBusy(null); }
  }

  return <section className="space-y-4">
    <div className="flex gap-1 overflow-x-auto border border-[#e2e2e5] bg-white p-1">{FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`min-h-11 whitespace-nowrap px-3 py-2 text-xs font-semibold ${filter === value ? 'bg-[#fae9e8] text-[#9c2822]' : 'text-[#626269] hover:bg-[#f4f4f5]'}`}>{label}</button>)}</div>
    {error && <p role="alert" className="text-sm text-[#9d352e]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[#315c39]">{notice}</p>}
    {reports.length === 0 && !error && <p className="border border-[var(--border)] bg-white p-4 text-xs text-[#626269]">Aucun plan dans cette liste.</p>}
    <ul className="grid gap-3">{reports.map((report) => {
      const draft = drafts[report.id] ?? { amount: '', note: '' };
      const set = (patch: Partial<typeof draft>) => setDrafts((current) => ({ ...current, [report.id]: { ...draft, ...patch } }));
      return <li key={report.id} className="border border-[var(--border)] bg-white p-4 text-xs">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{report.videoTitle} · plan {report.shotNumber} ({STAGE_LABELS[report.stage]})</p>
            <p className="mt-1 text-[#626269]">{report.clientName} · {report.reportedBy} · {when(report.createdAt)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded px-2 py-0.5 font-semibold ${report.kind === 'technical' ? 'bg-[#fae9e7] text-[#9d352e]' : 'bg-[#f0f4f7] text-[#253b4e]'}`}>{KIND_LABELS[report.kind]}</span>
            <span className="rounded bg-[#f2f1ef] px-2 py-0.5 font-semibold text-[#55545a]">{DECISION_LABELS[report.decision]}</span>
            {report.kind === 'technical' && <span className="rounded bg-[#fbf6ed] px-2 py-0.5 font-semibold text-[#765d39]">{REPORT_STATUS_LABELS[report.status]}</span>}
          </div>
        </div>
        {report.reasons.length > 0 && <p className="mt-2"><b className="font-semibold">Erreurs : </b>{reasonLabels(report.reasons).join(' · ')}</p>}
        {report.comment && <p className="mt-1"><b className="font-semibold">Commentaire : </b>« {report.comment} »</p>}
        {report.videoId && <a href={`/bibliotheque?video=${encodeURIComponent(report.videoId)}`} className="mt-2 inline-flex min-h-11 items-center font-semibold text-[#9c2822] underline underline-offset-2">Ouvrir la vidéo</a>}
        {report.status !== 'open' && <p className="mt-2 text-[#55545a]">{report.status === 'credited' ? `Recrédité : ${formatFcfa(report.creditedFcfa ?? 0)}` : 'Refusé'}{report.note ? ` · ${report.note}` : ''}{report.handledAt ? ` · ${when(report.handledAt)}` : ''}</p>}
        {report.kind === 'technical' && report.status === 'open' && <div className="mt-3 grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto_auto] sm:items-end">
          <label className="grid gap-1 font-semibold">Montant recrédité (FCFA)<input type="number" min={0} step={1} inputMode="numeric" value={draft.amount} onChange={(event) => set({ amount: event.target.value })} className={field} /></label>
          <label className="grid gap-1 font-semibold">Motif ou référence (obligatoire)<input value={draft.note} maxLength={400} onChange={(event) => set({ note: event.target.value })} className={field} /></label>
          <button type="button" disabled={busy !== null || draft.note.trim().length < 3 || draft.amount === ''} onClick={() => void handle(report, 'credited')} className="min-h-11 rounded-sm bg-[#c51e1c] px-3 font-semibold text-white disabled:opacity-50">Marquer recrédité</button>
          <button type="button" disabled={busy !== null || draft.note.trim().length < 3} onClick={() => void handle(report, 'refused')} className="min-h-11 rounded-sm border border-[#d4d4d8] px-3 font-semibold disabled:opacity-50">Refuser</button>
        </div>}
      </li>;
    })}</ul>
  </section>;
}
