'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatFcfa, MAX_FLAT_PRICE_SECONDS, formatSignedFcfa } from '@/core/pricing';

type Summary = { enforced: boolean; availableFcfa: number; heldFcfa: number; lowBalance: boolean; thresholdFcfa: number; nextExpiry: { amountFcfa: number; at: string } | null };
type Line = { key: string; at: string; kind: string; label: string; amountFcfa: number; availableAfterFcfa: number; userId: string | null; videoId: string | null; note: string | null; enforced: boolean };
type Data = { summary: Summary; prices: { standard: number; pro: number; premium: number } | null; lines?: Line[]; people?: Record<string, string>; videos?: Record<string, string>; perPerson?: Array<{ userId: string; name: string; videos: number; debitedFcfa: number }>; scope: { seesAll: boolean; operator: boolean; clientId?: string } };

const TYPES: Array<[string, string]> = [['', 'Toutes les opérations'], ['video', 'Vidéos'], ['revision', 'Modifications'], ['topup', 'Recharges'], ['gift', 'Crédits offerts'], ['adjustment', 'Corrections'], ['expiry', 'Expirations']];
const field = 'min-h-11 rounded-sm border border-[#d4d4d8] bg-white px-3 text-xs outline-none focus:border-[#c51e1c]';

function daysUntil(at: string) { return Math.max(0, Math.ceil((Date.parse(at) - Date.now()) / 86_400_000)); }
const dateLabel = (at: string) => new Date(at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTime = (at: string) => new Date(at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * « Crédits » (27/10): what one can spend, and where the spending comes from. A collaborator sees their own lines
 * (« Mes dépenses »); an administrator the whole client, with filters, a per-person summary and a CSV export.
 * The amounts are the billed prices in FCFA: never any production cost.
 */
export function CreditsView({ clientId, historyOnly = false }: { clientId?: string; historyOnly?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ from: '', to: '', userId: '', type: '' });
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (clientId) params.set('clientId', clientId);
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return params.toString();
  }, [filters, clientId]);
  const load = useCallback(async () => {
    const response = await fetch(`/api/credits?${query}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? 'Les crédits sont indisponibles.');
    setData(body);
  }, [query]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Les crédits sont indisponibles.')); }, [load]);

  if (error) return <p role="alert" className="border border-[#f0c9c6] bg-[#fae9e7] p-4 text-sm text-[#9d352e]">{error}</p>;
  if (!data) return <p className="text-sm text-[#626269]">Chargement des crédits…</p>;
  const { summary, scope } = data;
  if (!summary.enforced && !scope.operator) {
    return <div className="border border-dashed border-[#d2d2d6] bg-white px-6 py-14 text-center"><h2 className="text-sm font-semibold">Les crédits ne sont pas encore activés pour votre compte</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#626269]">Le prix de chaque vidéo reste affiché dans le Studio avant le lancement. Votre solde apparaîtra ici dès son activation par KÔMIAN.</p></div>;
  }
  const lines = data.lines ?? [];
  const people = data.people ?? {};
  const videos = data.videos ?? {};
  const own = !scope.seesAll;

  return <div className="space-y-6">
    {!historyOnly && !summary.enforced && <p role="status" className="border border-[#e7d7b9] bg-[#fbf6ed] p-4 text-xs leading-5 text-[#765d39]"><b>Crédits non appliqués :</b> les montants sont tracés sans être débités et le client ne voit pas encore cette page. Activez-les dans Espace KÔMIAN · Paramètres après la première recharge.</p>}
    {!historyOnly && <section aria-label="Solde" className="grid gap-3 sm:grid-cols-3">
      <div className="border border-[var(--border)] bg-white p-4"><p className="text-xs font-semibold text-[#626269]">Solde disponible</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatFcfa(summary.availableFcfa)}</p>{summary.lowBalance && <p className="mt-1 text-xs font-semibold text-[#9d352e]">Solde bas · seuil {formatFcfa(summary.thresholdFcfa)}</p>}</div>
      <div className="border border-[var(--border)] bg-white p-4"><p className="text-xs font-semibold text-[#626269]">Réservé (vidéos en cours)</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatFcfa(summary.heldFcfa)}</p><p className="mt-1 text-xs text-[#626269]">Débité à la livraison, libéré en cas d’échec.</p></div>
      <div className="border border-[var(--border)] bg-white p-4"><p className="text-xs font-semibold text-[#626269]">Prochaine expiration</p>{summary.nextExpiry ? <><p className="mt-2 text-2xl font-semibold tabular-nums">{formatFcfa(summary.nextExpiry.amountFcfa)}</p><p className="mt-1 text-xs text-[#626269]">le {dateLabel(summary.nextExpiry.at)} · dans {daysUntil(summary.nextExpiry.at)} jour{daysUntil(summary.nextExpiry.at) > 1 ? 's' : ''}</p></> : <p className="mt-2 text-sm text-[#626269]">Aucune</p>}</div>
    </section>}

    {!historyOnly && data.prices && <details className="border border-[var(--border)] bg-white p-4"><summary className="min-h-11 cursor-pointer text-xs font-semibold">Tarifs en vigueur</summary>
      <ul className="mt-2 grid gap-2 text-xs sm:grid-cols-3">{([['Standard', data.prices.standard], ['Pro', data.prices.pro], ...(data.scope.operator ? [['Premium', data.prices.premium]] : [])] as Array<[string, number]>).map(([label, price]) => <li key={label} className="border border-[var(--border)] p-3"><b className="block font-semibold">{label}</b><span className="tabular-nums">{formatFcfa(price)} par vidéo, de 5 à {MAX_FLAT_PRICE_SECONDS} s</span></li>)}</ul>
      <p className="mt-2 text-xs text-[#626269]">Les tarifs sont fixés par KÔMIAN. Une vidéo garde le prix affiché à son lancement.</p></details>}

    <section aria-labelledby="history-title" className="border border-[var(--border)] bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <h2 id="history-title" className="text-sm font-semibold">{own ? 'Mes dépenses' : 'Historique'}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold">Du<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={field} /></label>
          <label className="grid gap-1 text-xs font-semibold">Au<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={field} /></label>
          {!own && <label className="grid gap-1 text-xs font-semibold">Personne<select value={filters.userId} onChange={(event) => setFilters({ ...filters, userId: event.target.value })} className={field}><option value="">Toute l’équipe</option>{Object.entries(people).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
          <label className="grid gap-1 text-xs font-semibold">Opération<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })} className={field}>{TYPES.filter(([value]) => !own || ['', 'video', 'revision'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {!own && <a href={`/api/credits/export?${query}`} className="inline-flex min-h-11 items-center rounded-sm border border-[#d4d4d8] px-3 text-xs font-semibold hover:bg-[#f7f7f8]">Exporter en CSV</a>}
        </div>
      </div>
      {lines.length === 0 ? <p className="px-6 py-10 text-center text-xs text-[#626269]">Aucune opération sur cette période.</p> : <>
        <table className="hidden w-full text-left text-xs sm:table">
          <thead className="bg-[#f8f8f9] text-[#626269]"><tr><th scope="col" className="px-4 py-3 font-semibold">Date</th><th scope="col" className="px-4 py-3 font-semibold">Opération</th>{!own && <th scope="col" className="px-4 py-3 font-semibold">Personne</th>}<th scope="col" className="px-4 py-3 font-semibold">Vidéo</th><th scope="col" className="px-4 py-3 text-right font-semibold">Montant</th><th scope="col" className="px-4 py-3 text-right font-semibold">Solde après</th></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{lines.map((line) => <tr key={line.key}>
            <td className="whitespace-nowrap px-4 py-3 text-[#626269]">{dateTime(line.at)}</td>
            <td className="px-4 py-3"><span className="font-semibold">{line.label}</span>{line.note && <span className="block text-[#626269]">{line.note}</span>}</td>
            {!own && <td className="px-4 py-3">{line.userId ? people[line.userId] ?? '—' : '—'}</td>}
            <td className="px-4 py-3">{line.videoId ? <Link href={`/bibliotheque?video=${line.videoId}`} className="underline underline-offset-4">{videos[line.videoId] ?? 'Voir la vidéo'}</Link> : '—'}</td>
            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{line.amountFcfa === 0 ? '0 FCFA' : formatSignedFcfa(line.amountFcfa).replace(/^(?!−)/, '+')}</td>
            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#626269]">{formatFcfa(Math.max(0, line.availableAfterFcfa))}</td>
          </tr>)}</tbody>
        </table>
        <ul className="divide-y divide-[var(--border)] sm:hidden">{lines.map((line) => <li key={line.key} className="px-4 py-3 text-xs">
          <div className="flex items-start justify-between gap-3"><span className="font-semibold">{line.label}</span><span className="font-semibold tabular-nums">{line.amountFcfa === 0 ? '0 FCFA' : formatSignedFcfa(line.amountFcfa).replace(/^(?!−)/, '+')}</span></div>
          <p className="mt-1 text-[#626269]">{dateTime(line.at)}{!own && line.userId ? ` · ${people[line.userId] ?? ''}` : ''}</p>
          {line.videoId && <Link href={`/bibliotheque?video=${line.videoId}`} className="mt-1 inline-flex min-h-11 items-center underline underline-offset-4">{videos[line.videoId] ?? 'Voir la vidéo'}</Link>}
          {line.note && <p className="mt-1 text-[#626269]">{line.note}</p>}
        </li>)}</ul>
      </>}
    </section>

    {!own && (data.perPerson?.length ?? 0) > 0 && <section aria-labelledby="per-person-title" className="border border-[var(--border)] bg-white">
      <h2 id="per-person-title" className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">Par personne, sur la période</h2>
      <ul className="divide-y divide-[var(--border)] text-xs">{data.perPerson!.map((row) => <li key={row.userId} className="flex items-center justify-between gap-3 px-4 py-3"><span className="font-semibold">{row.name}</span><span className="tabular-nums text-[#626269]">{row.videos} vidéo{row.videos > 1 ? 's' : ''} · <b className="text-[#161619]">{formatFcfa(row.debitedFcfa)}</b></span></li>)}</ul>
    </section>}
  </div>;
}
