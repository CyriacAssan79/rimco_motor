"use client";
import { useEffect, useState } from 'react';
import { formatFcfa, MAX_FLAT_PRICE_SECONDS } from '@/core/pricing';

type Pricing = { brandId: string; brandName: string; standardFcfa: number; proFcfa: number; premiumFcfa: number };
type Change = { id: number; scope: string; brandId: string | null; field: string; oldValue: string | null; newValue: string | null; changedBy: string; changedAt: string };
const fields = [['standardFcfa', 'Standard'], ['proFcfa', 'Pro'], ['premiumFcfa', 'Premium']] as const;

/** Espace KÔMIAN · prix des vidéos par marque (forfait par vidéo depuis le 29/10, O01) : opérateur seulement ; s'applique aux prochains lancements, l'historique ne change pas. */
export function BrandPricingSettings() {
  const [rows, setRows] = useState<Pricing[]>([]);
  const [saved, setSaved] = useState<Pricing[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [allBrands, setAllBrands] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch('/api/admin/pricing', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'La grille est indisponible.');
    setRows(data.pricing ?? []); setSaved(data.pricing ?? []); setChanges(data.changes ?? []);
  }
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'La grille est indisponible.')); }, []);
  async function save(row: Pricing) {
    const before = saved.find((item) => item.brandId === row.brandId);
    const summary = fields.map(([field, label]) => before && before[field] !== row[field] ? `${label} : ${formatFcfa(before[field])} → ${formatFcfa(row[field])} par vidéo` : null).filter(Boolean).join('\n');
    if (!window.confirm(`${summary || 'Aucun tarif modifié.'}\n\nLe nouveau prix s’applique aux prochaines vidéos${allBrands ? ', pour toutes les marques du client' : ` de ${row.brandName}`}. Les vidéos déjà lancées gardent leur prix. Enregistrer ?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/pricing', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brandId: row.brandId, standardFcfa: row.standardFcfa, proFcfa: row.proFcfa, premiumFcfa: row.premiumFcfa, applyToClientBrands: allBrands }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'La grille n’a pas pu être enregistrée.');
      setNotice(data.updatedBrands > 1 ? `Grille enregistrée pour ${data.updatedBrands} marques. L’historique reste inchangé.` : 'Grille enregistrée pour les prochains lancements. L’historique reste inchangé.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'La grille n’a pas pu être enregistrée.'); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="pricing-title" className="max-w-3xl rounded border border-[var(--border)] bg-white p-5">
    <h2 id="pricing-title" className="text-sm font-semibold">Prix des vidéos</h2>
    <p className="mt-2 text-xs leading-5 text-[#626269]">{`Forfait facturé au client, en FCFA par vidéo, quelle que soit la durée jusqu’à ${MAX_FLAT_PRICE_SECONDS} s (aperçu de 5 s compris). Le niveau Test suit Premium. La carte de logo ne change pas le prix. Les montants sont débités des crédits du client.`}</p>
    {error && <p role="alert" className="mt-3 text-sm text-[#9d352e]">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-[#315c39]">{notice}</p>}
    {rows.length > 1 && <label className="mt-4 flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" className="size-4 accent-[#c51e1c]" checked={allBrands} onChange={(event) => setAllBrands(event.target.checked)} />Appliquer la grille enregistrée à toutes les marques du client</label>}
    {rows.map((row) => {
      const before = saved.find((item) => item.brandId === row.brandId);
      const dirty = fields.some(([field]) => before?.[field] !== row[field]);
      return <form key={row.brandId} className="mt-5 space-y-3 border-t border-[var(--border)] pt-5" onSubmit={(event) => { event.preventDefault(); void save(row); }}><h3 className="text-sm font-semibold">{row.brandName}</h3>
        <div className="grid gap-3 sm:grid-cols-3">{fields.map(([field, label]) => <label key={field} className="grid content-start gap-1 text-xs font-semibold">{label} · FCFA par vidéo<input type="number" inputMode="numeric" min="1" max="100000000" step="1" required value={row[field]} onChange={(event) => setRows((current) => current.map((item) => item.brandId === row.brandId ? { ...item, [field]: Number(event.target.value) } : item))} className="min-h-11 rounded-sm border border-[#d4d4d8] px-3 font-normal tabular-nums" /><span className="font-normal leading-5 text-[#626269]">{`De 5 à ${MAX_FLAT_PRICE_SECONDS} s : ${formatFcfa(Math.max(0, row[field]))}`}</span></label>)}</div>
        <button disabled={busy || !dirty} type="submit" className="min-h-11 rounded-sm bg-[#c51e1c] px-4 text-xs font-semibold text-white hover:bg-[#a71715] disabled:cursor-not-allowed disabled:bg-[#e2e2e5] disabled:text-[#626269]">{busy ? 'Enregistrement…' : dirty ? 'Enregistrer les prix' : 'Aucune modification à enregistrer'}</button>
      </form>;
    })}
    <details className="mt-6 border-t border-[var(--border)] pt-4">
      <summary className="min-h-11 cursor-pointer text-xs font-semibold">Derniers changements de tarifs et de réglages</summary>
      {changes.length === 0 ? <p className="mt-2 text-xs text-[#626269]">Aucun changement enregistré pour l’instant.</p> : <ul className="mt-2 divide-y divide-[var(--border)] text-xs">{changes.map((change) => <li key={change.id} className="flex flex-wrap justify-between gap-2 py-2"><span><b className="font-semibold">{change.field}</b> : {change.oldValue ?? '—'} → {change.newValue ?? '—'}{change.brandId ? ` · ${rows.find((row) => row.brandId === change.brandId)?.brandName ?? 'marque'}` : ''}</span><span className="text-[#626269]">{change.changedBy} · {new Date(change.changedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span></li>)}</ul>}
    </details>
  </section>;
}
