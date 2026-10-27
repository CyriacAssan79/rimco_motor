'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { createSupabaseBrowserClient } from '@/core/supabase/browser';
import { vehicleViewOptions } from '@/core/assets/vehicle-views';
import type { PlaceProfile } from '@/core/motion/place-motion';

type Asset = {
  id: string;
  kind: 'vehicle' | 'logo' | 'audio' | 'place' | 'decor' | 'wardrobe' | 'badge' | 'character';
  title?: string;
  category?: string;
  make?: string;
  model?: string;
  color?: string;
  angle?: string;
  variant?: string;
  status: 'en_attente' | 'validée' | 'rejetée';
  previewUrl?: string;
  path?: string;
  review_reason?: string;
  vehicle_dossier_id?: string | null;
  photo_role?: string | null;
  isCurated?: boolean;
  placeProfile?: PlaceProfile;
  placeProfileDescribed?: boolean;
  /** Admin only: sheet proposed by the vision model when the place was uploaded. */
  placeProfileProposal?: PlaceProfile | null;
  placeProposalStatus?: 'pending' | 'ready' | 'failed' | null;
};
type VehicleFolder = { id: string; make: string; model: string; color?: string | null };

const kinds: Array<[Asset['kind'], string]> = [
  ['vehicle', 'Véhicule'],
  ['place', 'Lieu'],
  ['decor', 'Décor'],
  ['character', 'Casting'],
  ['wardrobe', 'Tenue'],
  ['badge', 'Badge'],
  ['logo', 'Logo'],
  ['audio', 'Audio'],
];

function labelForKind(kind: Asset['kind']): string {
  return kinds.find(([value]) => value === kind)?.[1] ?? 'Média';
}

export function MediaLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | Asset['kind']>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [kind, setKind] = useState<Asset['kind']>('vehicle');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [angle, setAngle] = useState<string>(vehicleViewOptions[0]);
  const [rejecting, setRejecting] = useState('');
  const [reason, setReason] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [vehicleFolders, setVehicleFolders] = useState<VehicleFolder[]>([]);
  const [dossierMake, setDossierMake] = useState('');
  const [dossierModel, setDossierModel] = useState('');
  const [dossierColor, setDossierColor] = useState('');
  const [selectedDossierId, setSelectedDossierId] = useState('');
  const [photoRole, setPhotoRole] = useState<'exterior' | 'interior' | 'detail'>('exterior');
  const [placeTitle, setPlaceTitle] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/assets${filter !== 'all' ? `?kind=${encodeURIComponent(filter)}` : ''}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Impossible de charger la médiathèque.');
      setAssets(data.assets ?? []);
      if (filter === 'all') setTotalCount((data.assets ?? []).length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // 26/10: while a proposed place sheet is pending, follow it every 10 s (same rhythm as the video follow-up).
  const pendingProposals = isAdmin ? assets.filter((asset) => asset.placeProposalStatus === 'pending').map((asset) => asset.id) : [];
  const pendingKey = pendingProposals.join(',');
  useEffect(() => {
    if (!pendingKey) return;
    const timer = setTimeout(() => {
      void Promise.all(pendingKey.split(',').map((id) => fetch(`/api/admin/assets/${id}/place-proposal`, { method: 'POST' }).catch(() => null))).then(() => load(true));
    }, 10_000);
    return () => clearTimeout(timer);
  }, [pendingKey, load]);

  useEffect(() => {
    void fetch('/api/me').then((response) => response.ok ? response.json() : null).then((data) => setIsAdmin(data?.actor?.role === 'admin' || data?.actor?.role === 'operateur')).catch(() => setIsAdmin(false));
  }, []);
  const loadVehicleFolders = useCallback(async () => {
    const response = await fetch('/api/vehicles');
    const data = await response.json();
    if (response.ok) setVehicleFolders(data.vehicles ?? []);
  }, []);
  useEffect(() => { if (isAdmin) void loadVehicleFolders(); }, [isAdmin, loadVehicleFolders]);
  useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const maxSize = kind === 'audio' ? 25 * 1024 * 1024 : 12 * 1024 * 1024;
      const accepted = kind === 'audio'
        ? ['audio/mpeg', 'audio/wav', 'audio/mp4']
        : ['image/jpeg', 'image/png', 'image/webp'];
      if (!accepted.includes(file.type)) throw new Error('Format accepté : JPG, PNG ou WebP pour une image; MP3, WAV ou M4A pour un audio.');
      if (file.size > maxSize) throw new Error(`Le fichier dépasse la limite de ${kind === 'audio' ? '25' : '12'} Mo.`);
      if (kind === 'place' && !placeTitle.trim()) throw new Error('Indiquez un nom court pour ce lieu.');
      if (kind === 'character' && placeTitle.trim().length < 3) throw new Error('Décrivez la personne en quelques mots (prénom, âge, tenue).');
      if (kind === 'vehicle' && (!make.trim() || !model.trim()) && !(isAdmin && selectedDossierId)) throw new Error('Renseignez la marque et le modèle ou sélectionnez un dossier véhicule.');

      const signed = await fetch('/api/media/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, kind }),
      });
      const signedData = await signed.json();
      if (!signed.ok) throw new Error(signedData.error ?? 'Le téléversement signé n’est pas disponible.');
      if (signedData.mock || !signedData.token) throw new Error('Le téléversement nécessite Supabase configuré. Ajoutez les variables Supabase dans Vercel ou utilisez un aperçu connecté.');

      const supabase = createSupabaseBrowserClient();
      const bucket = kind === 'audio' ? 'audio' : kind === 'logo' ? 'brand' : 'assets';
      const { error: uploadError } = await supabase.storage.from(bucket).uploadToSignedUrl(signedData.path, signedData.token, file, { contentType: file.type });
      if (uploadError) throw new Error('Le transfert a échoué. Vérifiez votre connexion puis réessayez.');

      const folder = vehicleFolders.find((item) => item.id === selectedDossierId);
      const metadata = kind === 'vehicle'
        ? { make: make.trim() || folder?.make || '', model: model.trim() || folder?.model || '', color: color.trim() || folder?.color || '', angle: angle.trim(), ...(isAdmin && selectedDossierId ? { title: angle.trim(), vehicleDossierId: selectedDossierId, photoRole } : {}) }
        : kind === 'logo'
          ? { variant: 'rouge' }
          : { title: (kind === 'place' || kind === 'character') && placeTitle.trim() ? placeTitle.trim() : file.name.replace(/\.[^.]+$/, ''), category: kind };
      const saved = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, path: signedData.path, ...metadata }),
      });
      const savedData = await saved.json();
      if (!saved.ok) throw new Error(savedData.error ?? 'Le fichier est transféré, mais son enregistrement a échoué.');
      setNotice('Fichier ajouté. Il sera visible dans la médiathèque après validation par l’administration.');
      await load();
      if (kind === 'vehicle' && selectedDossierId) await loadVehicleFolders();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  async function createVehicleFolder() {
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await fetch('/api/vehicles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ make: dossierMake, model: dossierModel, color: dossierColor }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Impossible de créer ce dossier véhicule.');
      await loadVehicleFolders();
      setSelectedDossierId(data.vehicle.id);
      setDossierMake(''); setDossierModel(''); setDossierColor('');
      setNotice('Dossier créé. Ajoutez les photos intérieur, extérieur et détails à ce dossier.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de créer ce dossier.'); }
    finally { setBusy(false); }
  }

  async function approve(asset: Asset, status: Asset['status']) {
    setError('');
    if (status === 'rejetée' && !reason.trim()) {
      setError('Indiquez un motif avant de refuser le média.');
      return;
    }
    const response = await fetch(`/api/admin/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, reason: status === 'rejetée' ? reason.trim() : undefined }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? 'Cette action est réservée à l’administration.');
      return;
    }
    setNotice(status === 'validée' ? 'Média validé.' : 'Média refusé.');
    setRejecting('');
    setReason('');
    await load();
  }

  const filtered = assets.filter((asset) => filter === 'all' || asset.kind === filter);
  const availableKinds = kinds.filter(([value]) => isAdmin || value !== 'place');
  const visibleAssets = filter === 'vehicle'
    ? [...filtered].sort((left, right) => `${left.make ?? ''} ${left.model ?? ''}`.localeCompare(`${right.make ?? ''} ${right.model ?? ''}`, 'fr'))
    : filtered;
  const pending = assets.filter((asset) => asset.status === 'en_attente').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2 rounded-lg border border-[#e4e1db] bg-[#f5f5f3] p-1">
            {([['all', 'Tout'], ...availableKinds] as Array<['all' | Asset['kind'], string]>).map(([value, label]) => (
              <button key={value} onClick={() => {
                setFilter(value);
                if (value !== 'all') {
                  setKind(value);
                  setError('');
                  setNotice('');
                }
              }} className={`rounded-md min-h-11 px-3 py-2 text-xs font-semibold transition ${filter === value ? 'bg-[#fbfbfa] text-[#253b4e]' : 'text-[#716d66] hover:text-[#253b4e]'}`}>
                {label}{value === 'all' && totalCount !== null ? ` · ${totalCount}` : ''}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-xs font-semibold text-[#253b4e]">
            Type du média à ajouter
            <select value={kind} onChange={(event) => {
              setKind(event.target.value as Asset['kind']);
              setError('');
              setNotice('');
            }} className="rounded-md border border-[#d2cec6] bg-[#fbfbfa] min-h-11 px-3 py-2">
              {availableKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {kind === 'vehicle' && (
            <>
              <label className="grid gap-1 text-xs font-semibold text-[#253b4e]">Marque<input value={make} onChange={(event) => setMake(event.target.value)} className="rounded-md border border-[#d2cec6] bg-[#fbfbfa] min-h-11 px-3 py-2" /></label>
              <label className="grid gap-1 text-xs font-semibold text-[#253b4e]">Modèle<input value={model} onChange={(event) => setModel(event.target.value)} className="rounded-md border border-[#d2cec6] bg-[#fbfbfa] min-h-11 px-3 py-2" /></label>
              <label className="grid gap-1 text-xs font-semibold text-[#253b4e]">Couleur<input value={color} onChange={(event) => setColor(event.target.value)} className="rounded-md border border-[#d2cec6] bg-[#fbfbfa] min-h-11 px-3 py-2" /></label>
              <label className="grid gap-1 text-xs font-semibold text-[#253b4e]">Vue de la photo<select value={angle} onChange={(event) => setAngle(event.target.value)} className="rounded-md border border-[#d2cec6] bg-[#fbfbfa] min-h-11 px-3 py-2">{vehicleViewOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            </>
          )}
          {kind === 'vehicle' && isAdmin && <div className="w-full rounded-xl border border-[#e7e2da] bg-[#fbfaf8] p-4">
            <p className="text-xs font-semibold text-[#253b4e]">Dossier véhicule</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs font-semibold">Associer à<select value={selectedDossierId} onChange={(event) => setSelectedDossierId(event.target.value)} className="min-w-48 rounded-md border border-[#d2cec6] bg-white min-h-11 px-3 py-2"><option value="">Créer ou ajouter sans dossier</option>{vehicleFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.make} {folder.model}{folder.color ? ` · ${folder.color}` : ''}</option>)}</select></label>
              <label className="grid gap-1 text-xs font-semibold">Type de photo<select value={photoRole} onChange={(event) => setPhotoRole(event.target.value as typeof photoRole)} className="rounded-md border border-[#d2cec6] bg-white min-h-11 px-3 py-2"><option value="exterior">Extérieur</option><option value="interior">Intérieur</option><option value="detail">Détail</option></select></label>
              <label className="grid gap-1 text-xs font-semibold">Marque<input value={dossierMake} onChange={(event) => setDossierMake(event.target.value)} placeholder="Ex. Haval" className="w-32 rounded-md border border-[#d2cec6] bg-white min-h-11 px-3 py-2" /></label>
              <label className="grid gap-1 text-xs font-semibold">Modèle<input value={dossierModel} onChange={(event) => setDossierModel(event.target.value)} placeholder="Ex. H6" className="w-32 rounded-md border border-[#d2cec6] bg-white min-h-11 px-3 py-2" /></label>
              <label className="grid gap-1 text-xs font-semibold">Couleur<input value={dossierColor} onChange={(event) => setDossierColor(event.target.value)} placeholder="Facultatif" className="w-32 rounded-md border border-[#d2cec6] bg-white min-h-11 px-3 py-2" /></label>
              <button type="button" disabled={busy || !dossierMake.trim() || !dossierModel.trim()} onClick={() => void createVehicleFolder()} className="rounded-md border border-[#c51e1c] min-h-11 px-3 py-2 text-xs font-semibold text-[#b21c1a] disabled:opacity-50">Créer le dossier</button>
            </div>
            <p className="mt-2 text-xs text-[#626269]">Créez une fiche une fois, puis rattachez-lui chaque photo validée de l’intérieur, de l’extérieur ou des détails.</p>
          </div>}
          {kind === 'place' && isAdmin && <label className="grid gap-1 text-xs font-semibold text-[#253b4e]">Nom du lieu<input value={placeTitle} onChange={(event) => setPlaceTitle(event.target.value)} maxLength={160} placeholder="Ex. Plateau, Abidjan" className="min-w-56 rounded-md border border-[#d2cec6] bg-[#fbfbfa] min-h-11 px-3 py-2" /></label>}
          {kind === 'character' && <div className="grid gap-1">
            <label className="grid gap-1 text-xs font-semibold text-[#253b4e]">Personne<input value={placeTitle} onChange={(event) => setPlaceTitle(event.target.value)} maxLength={160} placeholder="Ex. Awa, 30 ans, chemise blanche" className="min-w-64 rounded-md border border-[#d2cec6] bg-[#fbfbfa] min-h-11 px-3 py-2" /></label>
            <p className="max-w-sm text-xs text-[#626269]">Une personne par photo, en pied ou à mi-corps, sur fond simple. Validez uniquement avec une cession de droit à l’image signée.</p>
          </div>}
        </div>
        <label className="cursor-pointer rounded-md bg-[#c51e1c] px-4 py-3 text-xs font-semibold text-white hover:bg-[#a71715] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2">
          {busy ? 'Téléversement…' : 'Ajouter un média'}
          <input className="sr-only" type="file" accept={kind === 'audio' ? '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4' : 'image/jpeg,image/png,image/webp'} disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />
        </label>
      </div>

      {notice && <p role="status" className="rounded-xl bg-[#edf4ee] px-4 py-3 text-sm text-[#456c4c]">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-[#fbefed] px-4 py-3 text-sm text-[#9c3830]">{error}</p>}
      {pending > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-[#eadfc7] bg-[#fbf6ed] p-4">
          <span aria-hidden="true" className="mt-0.5 text-[#716d66]">•</span>
          <div>
            <p className="text-xs font-semibold text-[#675432]">{pending} média{pending > 1 ? 's' : ''} en attente</p>
            <p className="mt-1 text-xs text-[#87795e]">Ces fichiers doivent être validés par un administrateur avant utilisation.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-[#e9e7e2]" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState onFile={(file) => void upload(file)} kind={kind} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map((asset, index) => {
            const groupName = `${asset.make ?? 'Véhicule'} ${asset.model ?? ''}`.trim();
            const previous = visibleAssets[index - 1];
            const beginsVehicleGroup = filter === 'vehicle' && (!previous || `${previous.make ?? 'Véhicule'} ${previous.model ?? ''}`.trim() !== groupName);
            return (
            <Fragment key={asset.id}>
            {beginsVehicleGroup && <h2 className="col-span-full mt-3 border-b border-[#e8e4de] pb-2 text-sm font-semibold text-[#253b4e]">{groupName}<span className="ml-2 text-xs font-normal text-[#626269]">{visibleAssets.filter((item) => item.make === asset.make && item.model === asset.model).length} photo(s)</span></h2>}
            <article className="overflow-hidden rounded-2xl border border-black/[.055] bg-white">
              <AssetPreview asset={asset} />
              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ad3d34]">{labelForKind(asset.kind)}</p>
                <h3 className="mt-1.5 text-sm font-semibold">{asset.kind === 'vehicle' ? `${asset.make ?? 'Véhicule'} ${asset.model ?? ''}` : asset.title ?? labelForKind(asset.kind)}</h3>
                <p className="mt-1 text-xs text-[#626269]">{asset.kind === 'vehicle' ? [asset.angle, asset.color].filter(Boolean).join(' · ') || 'RIMCO Motors' : (asset.category && kinds.some(([value]) => value === asset.category) ? labelForKind(asset.category as Asset['kind']) : asset.category) ?? asset.color ?? asset.variant ?? 'RIMCO Motors'}</p>
                {asset.isCurated && <p className="mt-2 text-xs text-[#4e7656]">Lieu intégré · référence disponible dans les storyboards</p>}
                {asset.status === 'rejetée' && asset.review_reason && <p className="mt-2 text-xs text-[#831810]">Motif : {asset.review_reason}</p>}
                {isAdmin && asset.kind === 'place' && !asset.isCurated && asset.placeProfile && <PlaceProfileEditor asset={asset} profile={asset.status === 'en_attente' ? asset.placeProfileProposal ?? asset.placeProfile : asset.placeProfile} review={asset.status === 'en_attente'} onSaved={(message) => { setError(''); setNotice(message); void load(); }} onError={setError} />}
                {isAdmin && asset.status === 'en_attente' && (
                  <ReviewControls
                    canApprove={asset.kind !== 'place'}
                    asset={asset}
                    rejecting={rejecting}
                    reason={reason}
                    setRejecting={setRejecting}
                    setReason={setReason}
                    approve={approve}
                  />
                )}
              </div>
            </article>
            </Fragment>
          );})}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onFile, kind }: { onFile: (file: File) => void; kind: Asset['kind'] }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d8d5cf] bg-white px-6 py-16 text-center">
      <span className="text-2xl text-[#626269]">▧</span>
      <h2 className="mt-4 text-sm font-semibold">La médiathèque est prête pour vos médias</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#626269]">Ajoutez une photo réelle du véhicule, un logo de marque ou une piste audio. Les médias restent privés et doivent être approuvés avant utilisation.</p>
      <label className="mt-5 inline-flex cursor-pointer rounded-lg border border-[#dedbd5] px-4 py-2.5 text-xs font-semibold hover:bg-[#f8f7f4]">
        Choisir un premier fichier
        <input type="file" className="sr-only" accept={kind === 'audio' ? '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4' : 'image/jpeg,image/png,image/webp'} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onFile(file); event.currentTarget.value = ''; }} />
      </label>
    </div>
  );
}

function AssetPreview({ asset }: { asset: Asset }) {
  const statusClass = asset.status === 'validée' ? 'bg-[#e9f2eb] text-[#4e7656]' : asset.status === 'rejetée' ? 'bg-[#fae9e7] text-[#ac3c34]' : 'bg-[#fbf1dd] text-[#926b2a]';
  return (
    <div className="relative grid aspect-[1.55] place-items-center bg-[#e7ecee]">
      {asset.previewUrl && asset.kind === 'audio' ? (
        <audio src={asset.previewUrl} controls aria-label={`Écouter ${asset.variant ?? 'la piste audio'}`} className="w-full p-4" />
      ) : asset.previewUrl ? (
        <Image src={asset.previewUrl} alt={`${asset.title ?? ''} ${asset.make ?? ''} ${asset.model ?? ''} ${asset.color ?? ''}`.trim() || (asset.kind === 'logo' ? 'Logo de marque' : 'Média')} fill sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw" unoptimized className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#e7ecee]">
          <span className="text-4xl text-[#667c87]">{asset.kind === 'audio' ? '♫' : asset.kind === 'logo' ? 'R' : '▱'}</span>
        </div>
      )}
      <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{asset.status === 'validée' ? 'Validé' : asset.status === 'rejetée' ? 'Refusé' : 'À valider'}</span>
    </div>
  );
}

function ReviewControls(props: {
  asset: Asset;
  rejecting: string;
  reason: string;
  setRejecting: (id: string) => void;
  setReason: (value: string) => void;
  approve: (asset: Asset, status: Asset['status']) => Promise<void>;
  /** A place is validated with its sheet, from the sheet form. */
  canApprove?: boolean;
}) {
  const { asset, rejecting, reason, setRejecting, setReason, approve, canApprove = true } = props;
  if (rejecting === asset.id) {
    return (
      <div className="mt-4 space-y-2">
        <label className="grid gap-1 text-xs font-semibold">
          Motif du refus
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} required className="rounded-md border border-[#d2cec6] p-2 font-normal" />
        </label>
        <div className="flex gap-2">
          <button onClick={() => void approve(asset, 'rejetée')} disabled={reason.trim().length < 3} className="rounded-md bg-[#831810] min-h-11 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Confirmer</button>
          <button onClick={() => { setRejecting(''); setReason(''); }} className="rounded-md border border-[#d2cec6] min-h-11 px-3 py-2 text-xs">Annuler</button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 flex gap-2">
      {canApprove && <button onClick={() => void approve(asset, 'validée')} className="flex-1 rounded-lg bg-[#253b4e] min-h-11 px-3 py-2 text-xs font-semibold text-white hover:bg-[#304b61]">Valider</button>}
      <button onClick={() => { setRejecting(asset.id); setReason(''); }} className="rounded-lg border border-[#e8e5df] min-h-11 px-3 py-2 text-xs font-semibold text-[#756f67] hover:bg-[#f7f5f1]">Refuser</button>
    </div>
  );
}

const shotTypeLabels: Array<[PlaceProfile['shotTypes'][number], string]> = [['establishing', 'Plan d’ensemble'], ['rolling', 'Voiture qui roule'], ['hero', 'Plan héros'], ['detail', 'Détail']];
const timeOfDayLabels: Array<[PlaceProfile['timeOfDay'], string]> = [['day', 'Journée'], ['golden', 'Lever ou coucher du soleil'], ['night', 'Nuit'], ['interior', 'Intérieur (showroom) : voiture immobile']];
const proposalLabels = { pending: 'Proposition automatique en cours…', ready: 'Fiche proposée automatiquement : vérifiez chaque champ.', failed: 'Proposition automatique indisponible : fiche prudente pré-remplie, à compléter.' } as const;

/**
 * 26/10 place sheet: what an uploaded place allows, in closed fields only. `review`: the place is pending and is
 * validated together with its sheet; otherwise the sheet of a validated place is edited.
 */
function PlaceProfileEditor({ asset, profile, review, onSaved, onError }: { asset: Asset; profile: PlaceProfile; review: boolean; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<PlaceProfile>(profile);
  const [open, setOpen] = useState(review);
  const [saving, setSaving] = useState(false);
  const proposalKey = JSON.stringify(profile);
  // A proposal arriving while the form is open replaces the prudent pre-fill.
  useEffect(() => { setDraft(JSON.parse(proposalKey) as PlaceProfile); }, [proposalKey]);
  const interior = draft.timeOfDay === 'interior';
  const toggle = <T,>(values: T[], value: T) => values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
  function setTimeOfDay(timeOfDay: PlaceProfile['timeOfDay']) {
    setDraft(timeOfDay === 'interior'
      ? { ...draft, timeOfDay, view: 'road', roadAxes: [], shotTypes: ['hero', 'detail'], dust: false, maxSpeed: 'slow' }
      : { ...draft, timeOfDay, roadAxes: draft.roadAxes.length ? draft.roadAxes : ['along'] });
  }
  async function save() {
    setSaving(true);
    try {
      const body = review ? { status: 'validée', placeProfile: draft } : { placeProfile: draft };
      const response = await fetch(`/api/admin/assets/${asset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Impossible d’enregistrer ce lieu.');
      setOpen(false);
      onSaved(review ? 'Lieu et fiche validés.' : 'Fiche du lieu enregistrée.');
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer ce lieu.'); }
    finally { setSaving(false); }
  }
  if (!open) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-[#626269]">{asset.placeProfileDescribed ? 'Fiche du lieu validée.' : 'Fiche du lieu absente : réglage prudent appliqué (plans héros et détails, vitesse lente).'}</p>
        <button type="button" onClick={() => { setDraft(profile); setOpen(true); }} className="rounded-md border border-[#d2cec6] min-h-11 px-2.5 py-1.5 text-xs font-semibold text-[#253b4e]">{asset.placeProfileDescribed ? 'Modifier la fiche' : 'Décrire'}</button>
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-[#e7e2da] bg-[#fbfaf8] p-3 text-xs">
      {review && asset.placeProposalStatus && <p className="text-xs text-[#675432]">{proposalLabels[asset.placeProposalStatus]}</p>}
      <label className="grid gap-1 font-semibold">Moment de la journée<select value={draft.timeOfDay} onChange={(event) => setTimeOfDay(event.target.value as PlaceProfile['timeOfDay'])} className="rounded-md border border-[#d2cec6] bg-white min-h-11 px-2 py-1.5 font-normal">{timeOfDayLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {!interior && <>
        <label className="grid gap-1 font-semibold">Point de vue de la photo<select value={draft.view} onChange={(event) => setDraft({ ...draft, view: event.target.value as PlaceProfile['view'] })} className="rounded-md border border-[#d2cec6] bg-white min-h-11 px-2 py-1.5 font-normal"><option value="road">Au niveau de la route</option><option value="elevated">En hauteur (balcon, toit)</option><option value="aerial">Vue aérienne</option></select></label>
        <fieldset className="grid gap-1"><legend className="font-semibold">Axes de la route</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.roadAxes.includes('along')} onChange={() => setDraft({ ...draft, roadAxes: toggle(draft.roadAxes, 'along') })} />La voiture suit la route (vers la caméra ou en s’éloignant)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.roadAxes.includes('across')} onChange={() => setDraft({ ...draft, roadAxes: toggle(draft.roadAxes, 'across') })} />Passage latéral, caméra au bord de la route</label>
        </fieldset>
      </>}
      <fieldset className="grid gap-1"><legend className="font-semibold">Plans possibles</legend>
        {shotTypeLabels.filter(([type]) => !interior || type === 'hero' || type === 'detail').map(([type, label]) => <label key={type} className="flex items-center gap-2"><input type="checkbox" checked={draft.shotTypes.includes(type)} onChange={() => setDraft({ ...draft, shotTypes: toggle(draft.shotTypes, type) })} />{label}</label>)}
      </fieldset>
      {!interior && <>
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={draft.dust} onChange={(event) => setDraft({ ...draft, dust: event.target.checked })} />Poussière possible (piste non goudronnée)</label>
        <label className="grid gap-1 font-semibold">Vitesse maximale<select value={draft.maxSpeed} onChange={(event) => setDraft({ ...draft, maxSpeed: event.target.value as PlaceProfile['maxSpeed'] })} className="rounded-md border border-[#d2cec6] bg-white min-h-11 px-2 py-1.5 font-normal"><option value="slow">Lente</option><option value="cruise">Normale</option><option value="dynamic">Soutenue (route dégagée)</option></select></label>
      </>}
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={draft.hasReadableText} onChange={(event) => setDraft({ ...draft, hasReadableText: event.target.checked })} />Texte lisible sur la photo (enseignes, panneaux, affiches)</label>
      {draft.hasReadableText && <p role="alert" className="rounded-md bg-[#fbf1dd] min-h-11 px-2 py-1.5 text-xs text-[#926b2a]">Ce lieu montre du texte lisible : c’est la première cause de texte recopié dans les images. Préférez une photo sans enseigne lisible.</p>}
      <div className="grid gap-1">
        <p className="font-semibold">Description envoyée aux modèles</p>
        <p className="text-[11px] text-[#5d5a55]">{draft.promptEn || 'Aucune : le nom et la catégorie du lieu sont utilisés.'}</p>
        {draft.promptEn && <button type="button" onClick={() => setDraft({ ...draft, promptEn: '' })} className="justify-self-start rounded-md border border-[#d2cec6] min-h-11 px-2 py-1 text-xs">Vider la description</button>}
      </div>
      <p className="text-xs text-[#626269]">Une vue aérienne ne permet que le plan d’ensemble ; une vue en hauteur, ni plan héros ni détail.</p>
      <div className="flex gap-2">
        <button type="button" disabled={saving || (review && asset.placeProposalStatus === 'pending')} onClick={() => void save()} className="rounded-md bg-[#253b4e] min-h-11 px-3 py-1.5 font-semibold text-white disabled:opacity-50">{saving ? 'Enregistrement…' : review ? 'Valider le lieu et sa fiche' : 'Enregistrer'}</button>
        {!review && <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-[#d2cec6] min-h-11 px-3 py-1.5">Annuler</button>}
      </div>
    </div>
  );
}
