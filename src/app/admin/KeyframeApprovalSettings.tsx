'use client';

import { useEffect, useState } from 'react';
import { KEYFRAME_APPROVAL_MODE_LABELS, KEYFRAME_APPROVAL_MODES, type KeyframeApprovalMode } from '@/core/versions/keyframe-approval';

type Brand = { id: string; name: string; mode: KeyframeApprovalMode; clipApproval: boolean };

/**
 * Espace KÔMIAN · validations humaines par marque (28/10 : réservé à l'opérateur). Les images clés suivent l'un des
 * quatre modes ; les clips peuvent être validés en plus, ou partir au montage après leur contrôle automatique.
 */
export function KeyframeApprovalSettings() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    fetch('/api/admin/keyframe-approval').then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Réglage indisponible.');
      setBrands(data.brands ?? []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Réglage indisponible.'));
  }, []);
  async function save(brandId: string, patch: Partial<Pick<Brand, 'mode' | 'clipApproval'>>) {
    setError('');
    setNotice('');
    const response = await fetch('/api/admin/keyframe-approval', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brandId, ...patch }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? 'Le réglage n’a pas pu être enregistré.'); return; }
    setBrands((current) => current.map((brand) => brand.id === brandId ? { ...brand, ...patch } : brand));
    setNotice('Réglage enregistré : il s’applique aux prochaines vidéos, celles en cours gardent le leur.');
  }
  return <section aria-labelledby="keyframe-approval-title" className="max-w-3xl rounded border border-[var(--border)] bg-white p-5">
    <h2 id="keyframe-approval-title" className="text-sm font-semibold">Validation humaine</h2>
    <p className="mt-1 text-xs leading-5 text-[#626269]">L’utilisateur valide chaque image clé : le plan part en vidéo, l’étape payante, dès sa validation. Les clips peuvent aussi être validés avant le montage ; sinon, ceux qui passent le contrôle automatique sont montés aussitôt. Les attentes figurent dans l’export CSV du suivi de consommation.</p>
    {error && <p role="alert" className="mt-3 text-sm text-[#9d352e]">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-[#315c39]">{notice}</p>}
    <div className="mt-4 space-y-5">{brands.map((brand) => <fieldset key={brand.id} className="space-y-3 border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0">
      <legend className="text-sm font-semibold">{brand.name}</legend>
      <label className="grid gap-1 text-xs font-semibold">Images clés
        <select value={brand.mode} onChange={(event) => void save(brand.id, { mode: event.target.value as KeyframeApprovalMode })} className="min-h-11 rounded-sm border border-[#d4d4d8] bg-white px-3 text-xs font-normal">
          {KEYFRAME_APPROVAL_MODES.map((mode) => <option key={mode} value={mode}>{KEYFRAME_APPROVAL_MODE_LABELS[mode]}</option>)}
        </select>
      </label>
      <label className={`flex min-h-11 items-start gap-3 text-sm ${brand.mode === 'off' ? 'text-[#8a8a90]' : ''}`}>
        <input type="checkbox" className="mt-1 size-4 accent-[#c51e1c]" checked={brand.clipApproval && brand.mode !== 'off'} disabled={brand.mode === 'off'} onChange={(event) => void save(brand.id, { clipApproval: event.target.checked })} />
        <span><b className="font-semibold">Valider aussi les clips avant le montage</b><span className="block text-xs leading-5 text-[#626269]">{brand.mode === 'off' ? 'Sans validation des images clés, les clips ne sont pas validés non plus.' : 'Décoché : la vidéo est montée dès que ses clips ont passé le contrôle automatique, une attente de moins.'}</span></span>
      </label>
    </fieldset>)}</div>
  </section>;
}
