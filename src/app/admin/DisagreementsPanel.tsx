"use client";
import { useEffect, useState } from 'react';
import type { disagreementReport } from '@/core/verification/disagreements';
import { REVISION_REASONS, type RevisionReason } from '@/core/verification/loop';

export function DisagreementsPanel() {
  const [report, setReport] = useState<ReturnType<typeof disagreementReport> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; fetch('/api/admin/disagreements').then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Le relevé est indisponible.'); if (active) setReport(data); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Le relevé est indisponible.'); }); return () => { active = false; }; }, []);
  const stage = (value: string) => value === 'keyframe' ? 'Images clés' : 'Clips';
  const percent = (value: number) => new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(value);
  return <section className="mt-6 rounded border border-[var(--border)] bg-white p-5" aria-label="Désaccords avec le vérificateur">
    <h2 className="text-sm font-semibold">Désaccords avec le vérificateur</h2>
    <p className="mt-2 text-xs text-[#626269]">Plans acceptés par le juge puis modifiés ou désactivés par l’utilisateur. Un plan compte une seule fois par étape, même avec plusieurs motifs.</p>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    {report && <><div className="mt-3 flex flex-wrap gap-4">{report.stages.map((item) => <p key={item.stage} className="text-sm"><b>{stage(item.stage)} : {percent(item.rate)}</b> · {item.disagreed}/{item.accepted} plans acceptés</p>)}</div>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Étape', 'Motif', 'Plans modifiés', 'Taux parmi les plans acceptés'].map((title) => <th key={title} className="p-2">{title}</th>)}</tr></thead><tbody>{report.groups.map((item) => <tr key={`${item.stage}-${item.reason}`} className="border-t border-[var(--border)]"><td className="p-2">{stage(item.stage)}</td><td className="p-2">{REVISION_REASONS[item.reason as RevisionReason]?.fr ?? (item.reason === 'disabled' ? 'Clip désactivé' : item.reason === 'redo' ? 'Refaire sans commentaire' : 'Commentaire libre')}</td><td className="p-2">{item.count}</td><td className="p-2">{percent(item.rate)}</td></tr>)}</tbody></table></div>
      {!report.groups.length && <p className="mt-3 text-xs">Aucun désaccord enregistré.</p>}
      <a href="/api/admin/disagreements?format=csv" className="mt-3 inline-flex min-h-11 items-center rounded-full border border-[var(--border)] px-4 text-xs font-semibold">Exporter les désaccords en CSV</a></>}
  </section>;
}
