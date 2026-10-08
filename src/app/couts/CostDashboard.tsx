'use client';

import { useEffect, useState } from 'react';
import { calculateBudget, formatFcfa } from '@/core/pricing';

type CostRow = {
  version_id?: string | null;
  video_id?: string | null;
  title?: string;
  kind?: string;
  seconds?: number;
  price_fcfa?: number;
  cost_eur?: number;
  cost_real_fcfa?: number;
  status?: string;
  created_at?: string;
  user_name?: string;
  department?: string;
  model_name?: string;
};
type CostData = {
  capEur?: number;
  spentEur?: number;
  simulation?: boolean;
  rows?: CostRow[];
};

function csvCell(input: unknown): string {
  const value = String(input ?? '');
  const formulaSafe = /^[\s]*[=+@\-]/.test(value) ? `'${value}` : value;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export function CostDashboard() {
  const [data, setData] = useState<CostData | null>(null);
  const [adminData, setAdminData] = useState<CostData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/costs');
        const regular = await response.json();
        if (!response.ok) throw new Error(regular.error ?? 'Impossible de charger le tableau des coûts.');
        const adminResponse = await fetch('/api/admin/costs');
        const admin = adminResponse.ok ? await adminResponse.json() as CostData : null;
        if (active) {
          setData(regular as CostData);
          setAdminData(admin);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  if (error) return <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!data) return <div aria-label="Chargement des coûts" className="h-48 animate-pulse rounded-2xl bg-[#e9e7e2]" />;

  const isAdmin = adminData !== null;
  const rows = isAdmin ? adminData.rows ?? [] : data.rows ?? [];
  const chargedRows = rows.filter((row) => row.status === 'charged' || row.status === 'ready');
  const billed = chargedRows.reduce((sum, row) => sum + Number(row.price_fcfa ?? 0), 0);
  const realFcfa = chargedRows.reduce((sum, row) => sum + Number(row.cost_real_fcfa ?? 0), 0);
  const margin = billed - realFcfa;
  const marginPercent = billed > 0 ? Math.round((margin / billed) * 100) : 0;
  const budget = isAdmin && adminData.capEur
    ? calculateBudget(adminData.spentEur ?? 0, adminData.capEur)
    : null;

  function exportCsv() {
    const columns = isAdmin
      ? ['title', 'version_id', 'kind', 'seconds', 'price_fcfa', 'cost_real_fcfa', 'cost_eur', 'department', 'model_name', 'status']
      : ['title', 'version_id', 'kind', 'seconds', 'price_fcfa', 'status'];
    const csv = [columns.map(csvCell).join(';'), ...rows.map((row) => columns.map((key) => csvCell(row[key as keyof CostRow])).join(';'))].join('\r\n');
    const blobUrl = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'rimco-couts.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  return <>
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-xs leading-5 text-[#716d66]">Le prix facturé est visible à l’équipe. Les coûts fournisseur et la marge restent réservés aux administrateurs.</p>
      <button onClick={exportCsv} className="rounded-lg border border-[#dedbd5] bg-[var(--surface)] px-4 py-2.5 text-xs font-semibold hover:bg-[#f4f2ee]">Exporter CSV</button>
    </div>
    {budget && <section className="mb-6 rounded-2xl border border-black/[.055] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Plafond de génération</h2><p className="mt-1 text-xs text-[#716d66]">{budget.spentEur.toFixed(2)} € utilisés sur {budget.capEur.toFixed(2)} €</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${budget.warning ? 'bg-[#fae9e7] text-[#a53830]' : 'bg-[#edf2ec] text-[#4e7656]'}`}>{budget.usagePercent}% utilisé{budget.warning ? ' · Seuil d’alerte atteint' : ''}</span></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eceae5]"><div className={`h-full rounded-full ${budget.warning ? 'bg-[#bd3027]' : 'bg-[#506d7d]'}`} style={{ width: `${budget.usagePercent}%` }} /></div>
    </section>}
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-2xl border border-black/[.055] bg-[var(--surface)] p-5"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#716d66]">Total facturé</p><p className="mt-3 text-2xl font-semibold tracking-tight">{formatFcfa(billed)}</p><p className="mt-1 text-xs text-[#716d66]">{rows.length} opérations comptabilisées</p></div>
      {isAdmin && (adminData.simulation
        ? <div className="rounded-2xl border border-[#eadfc7] bg-[#fbf6ed] p-5 sm:col-span-1 xl:col-span-2"><p className="text-sm font-semibold text-[#675432]">Mode simulation</p><p className="mt-2 text-xs leading-5 text-[#87795e]">Aucun coût fournisseur réel n’est enregistré. Les marges ne sont donc pas calculées.</p></div>
        : <><div className="rounded-2xl border border-black/[.055] bg-[var(--surface)] p-5"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#716d66]">Coût réel fournisseur</p><p className="mt-3 text-2xl font-semibold tracking-tight">{formatFcfa(realFcfa)}</p><p className="mt-1 text-xs text-[#716d66]">{(adminData.spentEur ?? 0).toFixed(2)} EUR</p></div><div className="rounded-2xl border border-black/[.055] bg-[var(--surface)] p-5"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#716d66]">Marge estimée</p><p className="mt-3 text-2xl font-semibold tracking-tight">{formatFcfa(margin)}</p><p className="mt-1 text-xs text-[#716d66]">{marginPercent}% du prix facturé</p></div></>)}
    </div>
    <div className="overflow-x-auto rounded-2xl border border-black/[.055] bg-[var(--surface)]">
      <table className="w-full min-w-[700px] border-collapse text-left text-xs"><thead className="border-b border-black/[.055] bg-[#f8f7f4]"><tr>{['Vidéo / version', 'Type', 'Durée', 'Prix facturé', ...(isAdmin && !adminData.simulation ? ['Coût réel', 'Département', 'Modèle'] : []), 'État'].map((item) => <th key={item} className="px-4 py-3 text-[9px] font-bold uppercase tracking-[.14em] text-[#716d66]">{item}</th>)}</tr></thead>
        <tbody className="divide-y divide-black/[.04]">{rows.map((row, index) => <tr key={`${row.version_id ?? row.video_id}-${index}`}><td className="px-4 py-4 font-medium">{row.title ?? row.video_id ?? row.version_id ?? 'Vidéo'}<span className="ml-2 text-[10px] text-[#716d66]">{row.created_at ? new Date(row.created_at).toLocaleDateString('fr-FR') : ''}</span></td><td className="px-4 py-4 text-[#716d66]">{row.kind === 'generation' ? 'Génération' : row.kind === 'postprod' ? 'Post-production' : 'Vidéo'}</td><td className="px-4 py-4 text-[#716d66]">{row.seconds ?? 5} s</td><td className="px-4 py-4 font-semibold">{row.status === 'released' ? '—' : formatFcfa(row.price_fcfa ?? 0)}</td>{isAdmin && !adminData.simulation && <><td className="px-4 py-4 text-[#716d66]">{row.status === 'released' ? '—' : <>{formatFcfa(row.cost_real_fcfa ?? 0)}<span className="block text-[10px]">{Number(row.cost_eur ?? 0).toFixed(2)} EUR</span></>}</td><td className="px-4 py-4 text-[#716d66]">{row.department ?? 'Non renseigné'}</td><td className="px-4 py-4 text-[#716d66]">{row.model_name ?? 'Non renseigné'}</td></>}<td className="px-4 py-4 text-[#716d66]">{row.status === 'reserved' ? 'Réservé' : row.status === 'released' ? 'Libéré' : row.status === 'charged' || row.status === 'ready' ? 'Facturé' : row.status ?? '—'}</td></tr>)}</tbody>
      </table>{rows.length === 0 && <p className="px-6 py-12 text-center text-xs text-[#716d66]">Aucune génération facturée pour le moment.</p>}
    </div>
  </>;
}
