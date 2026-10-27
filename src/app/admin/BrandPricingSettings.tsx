"use client";
import { useEffect, useState } from 'react';
import { formatFcfa } from '@/core/pricing';
type Pricing = { brandId: string; brandName: string; standardFcfaPerSecond: number; proFcfaPerSecond: number; premiumFcfaPerSecond: number };
const fields = [['standardFcfaPerSecond', 'Standard'], ['proFcfaPerSecond', 'Pro'], ['premiumFcfaPerSecond', 'Premium']] as const;
export function BrandPricingSettings() {
  const [rows, setRows] = useState<Pricing[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; fetch('/api/admin/pricing').then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'La grille est indisponible.'); if (active) setRows(data.pricing ?? []); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'La grille est indisponible.'); }); return () => { active = false; }; }, []);
  async function save(row: Pricing) {
    setBusy(true); setError(''); setNotice('');
    try {
      const { brandName: _name, ...payload } = row; void _name;
      const response = await fetch('/api/admin/pricing', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'La grille n’a pas pu être enregistrée.');
      setNotice('Grille enregistrée pour les prochains lancements. L’historique reste inchangé.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'La grille n’a pas pu être enregistrée.'); }
    finally { setBusy(false); }
  }
  return <section className="max-w-3xl rounded border border-[var(--border)] bg-white p-5">
    <h2 className="text-sm font-semibold">Grille tarifaire par marque</h2>
    <p className="mt-2 text-xs text-[#626269]">Tarifs en FCFA par seconde de clips. Le niveau Test suit Premium. La carte de logo ne change pas le prix.</p>
    {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}{notice && <p role="status" className="mt-3 text-xs text-green-800">{notice}</p>}
    {rows.map((row) => <form key={row.brandId} className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); void save(row); }}><h3 className="text-sm font-semibold">{row.brandName}</h3>
      <div className="grid gap-3 sm:grid-cols-3">{fields.map(([field, label]) => <label key={field} className="grid gap-1 text-xs font-semibold">{label} · FCFA/s<input type="number" min="1" max="10000000" step="any" required value={row[field]} onChange={(event) => setRows((current) => current.map((item) => item.brandId === row.brandId ? { ...item, [field]: Number(event.target.value) } : item))} className="min-h-11 rounded border border-[#d2cec6] px-3 font-normal" /><span className="font-normal text-[#626269]">20 s : {formatFcfa(Math.max(0, row[field]) * 20)}</span></label>)}</div>
      <button disabled={busy} type="submit" className="min-h-11 rounded-full bg-[#c51e1c] px-4 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Enregistrement…' : 'Enregistrer la grille'}</button>
    </form>)}
  </section>;
}
