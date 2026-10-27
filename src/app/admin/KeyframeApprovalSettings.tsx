'use client';

import { useEffect, useState } from 'react';
import { KEYFRAME_APPROVAL_MODE_LABELS, KEYFRAME_APPROVAL_MODES, type KeyframeApprovalMode } from '@/core/versions/keyframe-approval';

/** Admin · « Validation des images clés » per brand: the four modes stay available after the beta (27/10). */
export function KeyframeApprovalSettings() {
  const [brands, setBrands] = useState<Array<{ id: string; name: string; mode: KeyframeApprovalMode }>>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    fetch('/api/admin/keyframe-approval').then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Réglage indisponible.');
      setBrands(data.brands ?? []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Réglage indisponible.'));
  }, []);
  async function save(brandId: string, mode: KeyframeApprovalMode) {
    setError('');
    setNotice('');
    const response = await fetch('/api/admin/keyframe-approval', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brandId, mode }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? 'Le réglage n’a pas pu être enregistré.'); return; }
    setBrands((current) => current.map((brand) => brand.id === brandId ? { ...brand, mode } : brand));
    setNotice('Réglage enregistré : il s’applique aux prochaines vidéos.');
  }
  return <section aria-labelledby="keyframe-approval-title" className="mt-8 border border-[var(--border)] bg-white p-5">
    <h2 id="keyframe-approval-title" className="text-sm font-semibold">Validation humaine (images clés et clips)</h2>
    <p className="mt-1 max-w-2xl text-xs leading-5 text-[#626269]">L’utilisateur valide les images clés avant l’animation, puis les clips avant le montage. Les attentes, modifications et désactivations figurent dans l’export CSV du suivi de consommation.</p>
    {error && <p role="alert" className="mt-3 text-sm text-[#9d352e]">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-[#315c39]">{notice}</p>}
    <div className="mt-4 space-y-3">{brands.map((brand) => <label key={brand.id} className="grid max-w-xl gap-1 text-xs font-semibold">{brand.name}
      <select value={brand.mode} onChange={(event) => void save(brand.id, event.target.value as KeyframeApprovalMode)} className="min-h-11 rounded-md border border-[#d2cec6] bg-white px-3 text-xs font-normal">
        {KEYFRAME_APPROVAL_MODES.map((mode) => <option key={mode} value={mode}>{KEYFRAME_APPROVAL_MODE_LABELS[mode]}</option>)}
      </select>
    </label>)}</div>
  </section>;
}
