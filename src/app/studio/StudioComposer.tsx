'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatFcfa } from '@/core/pricing';
import { getScenePresets, getScenePreset, inferVehicleCategory } from '@/core/scenes/catalog';
import { getRouteForGeneration, getRoutedDurations } from '@/core/providers/model-routing';

type Format = '16:9' | '9:16' | '1:1' | '4:5';
type Asset = { id: string; make?: string; model?: string; color?: string; previewUrl?: string | null };
type Job = { id: string; status: string; error?: string; prompt?: string; completedShots?: number; totalShots?: number };
type Model = { id: string; name: string; tier: string; adapterFamily: string; formats: Format[]; durations: number[]; estimatedPricesFcfa: Record<string, number>; isDefault: boolean };
const lightOptions = ['Lumière naturelle claire du matin'];
const characterOptions = [
  { value: '', label: 'Sans personnage · recommandé pour le premier test' },
  { value: 'Une conductrice ou un conducteur naturel, visible à travers la vitre', label: 'Conductrice ou conducteur' },
  { value: 'Une personne en tenue professionnelle, discrète et naturelle, à proximité du véhicule', label: 'Personne en arrière-plan' },
];
export function StudioComposer({ mode }: { mode: 'mock' | 'live' }) {
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState('');
  const [assetsRetry, setAssetsRetry] = useState(0);
  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [overlayLogo, setOverlayLogo] = useState(true);
  const [scenePresetId, setScenePresetId] = useState('');
  const [conceptId, setConceptId] = useState('signature');
  const complexity = 'balanced';
  const [tier, setTier] = useState<'standard' | 'premium'>('standard');
  const [durationS, setDurationS] = useState(5);
  const [additionalDirection, setAdditionalDirection] = useState('');
  const [character, setCharacter] = useState('');
  const [format, setFormat] = useState<Format>('16:9');
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedAsset = assets.find((asset) => asset.id === assetId);
  const vehicleCategory = inferVehicleCategory(selectedAsset?.make, selectedAsset?.model);
  const relevantScenes = getScenePresets(vehicleCategory);
  const allScenes = getScenePresets();
  const universalScenes = allScenes.filter((scene) => scene.category === 'autre' && !relevantScenes.some((recommended) => recommended.id === scene.id));
  const sceneChoices = [...relevantScenes, ...universalScenes].slice(0, 8);
  const selectedScene = getScenePreset(scenePresetId) ?? relevantScenes[0];
  const compatibleModels = availableModels.filter((model) => model.tier === tier);
  const route = getRouteForGeneration(tier, durationS);
  const routedModel = compatibleModels.find((model) => model.adapterFamily === route?.adapterFamily && model.durations.includes(durationS));
  const selectedModel = routedModel;
  const estimatedPrice = selectedModel?.estimatedPricesFcfa?.[String(durationS)];
  const priceLabel = mode === 'live' && estimatedPrice ? `≈ ${formatFcfa(estimatedPrice)}` : mode === 'mock' ? 'Simulation' : '—';
  const durationOptions = mode === 'mock' ? [5] : getRoutedDurations(tier);
  const generationActive = Boolean(job && !['ready', 'failed'].includes(job.status));
  const locationChoices = Array.from(new Map(sceneChoices.map((scene) => [scene.location, scene])).values());
  const decorChoices = Array.from(new Map(sceneChoices.map((scene) => [scene.setting, scene])).values());
  const lightingChoices = Array.from(new Map(sceneChoices.map((scene) => [scene.lighting, scene])).values());

  useEffect(() => {
    if (selectedModel && !selectedModel.formats.includes(format)) setFormat(selectedModel.formats[0] ?? '16:9');
  }, [selectedModel, format]);

  useEffect(() => {
    const allowed = mode === 'mock' ? [5] : getRoutedDurations(tier);
    if (!allowed.includes(durationS)) setDurationS(allowed[0]);
  }, [durationS, mode, tier]);

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    setModelsLoading(true);
    setModelsError('');
    fetch('/api/models/available')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Impossible de charger les modèles.');
        return data;
      })
      .then((data) => {
        if (!active) return;
        const models: Model[] = data.models ?? [];
        setAvailableModels(models);
      })
      .catch((loadError) => {
        if (!active) return;
        setModelsError(loadError instanceof Error ? loadError.message : 'Impossible de charger les modèles.');
      })
      .finally(() => { if (active) setModelsLoading(false); });
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    let active = true;
    setAssetsLoading(true);
    setAssetsError('');
    fetch('/api/assets?kind=vehicle&status=valid%C3%A9e')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Impossible de charger les véhicules.');
        return data;
      })
      .then((data) => {
        if (!active) return;
        const list: Asset[] = data.assets ?? [];
        setAssets(list);
        const firstAsset = list[0];
        if (firstAsset) {
          setAssetId(firstAsset.id);
          setScenePresetId(getScenePresets(inferVehicleCategory(firstAsset.make, firstAsset.model))[0]?.id ?? '');
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setAssetsError(loadError instanceof Error ? loadError.message : 'Impossible de charger les véhicules.');
      })
      .finally(() => { if (active) setAssetsLoading(false); });
    return () => { active = false; };
  }, [assetsRetry]);

  const jobId = job?.id;
  useEffect(() => {
    if (!jobId || !job || ['ready', 'failed'].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/versions/${jobId}/refresh`);
        const data = await response.json();
        if (response.ok) setJob((previous) => previous ? { ...previous, ...data } : previous);
      } catch { /* The next polling tick retries transient network errors. */ }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [job, jobId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/versions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: additionalDirection, conceptId, title, assetId, character, format, tier, durationS, overlayLogo, complexity,
          scenePresetId: selectedScene?.id ?? '',
          vehicleCategory,
          location: selectedScene?.location ?? '', setting: selectedScene?.setting ?? '',
          lighting: selectedScene?.lighting ?? lightOptions[0],
          vehicleAction: selectedScene?.vehicleAction ?? 'Le véhicule avance lentement et régulièrement',
          cameraMovement: selectedScene?.cameraMovement ?? '', mood: selectedScene?.mood ?? '',
          ...(mode === 'live' && routedModel ? { modelId: routedModel.id } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'La génération n’a pas pu démarrer.');
      setJob({ id: data.id, status: data.status, prompt: data.prompt, completedShots: data.completedShots, totalShots: data.totalShots });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-md border border-black/[.055] bg-white">
          <div className="min-h-[250px] p-5 md:min-h-[320px] md:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-[#f2f1ef] px-3 py-1 text-[11px] text-[#77736d]">Décrivez la vidéo que vous voulez, je m’occupe du reste.</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[.12em] text-[#aaa59d] md:inline">Brief de création</span>
            </div>
            {additionalDirection.trim() && <p className="mt-6 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-[#4d4a45]">{additionalDirection.trim()}</p>}
          </div>
          <div className="border-t border-[#eeeae4] p-4 md:p-5">
            <textarea value={additionalDirection} onChange={(event) => setAdditionalDirection(event.target.value)} maxLength={240} rows={3} placeholder="Décrivez votre vidéo…" aria-label="Description de la vidéo" className="w-full resize-y rounded-md border border-[#e9e7e2] bg-[#fcfcfb] p-3 text-sm leading-6 outline-none focus:border-[#c51e1c]" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setAdditionalDirection('Une vidéo publicitaire automobile élégante, avec une mise en valeur progressive du véhicule.')} className="text-xs font-semibold text-[#c51e1c] underline underline-offset-4">Insérer un exemple</button>
              <button type="button" onClick={() => document.getElementById('generation-options')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-md bg-[#c51e1c] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#a71715]">Envoyer la description ↑</button>
            </div>
          </div>
        </section>

        {job && <section className="rounded-md border border-black/[.055] bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">État de la vidéo</h2><span className="text-[10px] font-semibold uppercase text-[#a47731]">{job.status === 'ready' ? 'Prête' : job.status === 'failed' ? 'Échec' : 'En cours'}</span></div><p className="mt-2 text-xs leading-5 text-[#88847d]">{job.status === 'ready' ? 'Votre vidéo est prête à consulter.' : job.status === 'failed' ? job.error ?? 'La génération a échoué. Vous pouvez relancer une nouvelle vidéo.' : 'Actualisation automatique toutes les 10 secondes.'}</p>{job.prompt && <details className="mt-4 border-t border-[#eeeae4] pt-3"><summary className="cursor-pointer text-xs font-semibold text-[#716d66]">Voir le prompt généré</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#77736d]">{job.prompt}</p></details>}{job.status === 'ready' && <Link href="/bibliotheque" className="mt-4 block rounded-lg bg-[#c51e1c] px-3 py-2.5 text-center text-xs font-semibold text-white">Voir ma vidéo →</Link>}</section>}
      </div>

      <aside id="generation-options" className="min-w-0 space-y-3 xl:sticky xl:top-5">
        <section className="rounded-md border border-[#e2e2e5] bg-white p-4 text-[#161619]">
          <div className="flex items-center justify-between gap-2"><h2 className="font-display text-sm font-semibold uppercase tracking-[.04em]">Votre vidéo</h2><span className="rounded-full bg-[#f2f1ef] px-2 py-1 text-[9px] text-[#88847d]">{title.trim() ? 'Prête à lancer' : 'Description à saisir'}</span></div>
          <label className="mt-4 grid gap-1.5 text-[11px] font-semibold">Titre de la vidéo<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Ex. Starlight EV · lancement Abidjan" className="min-h-10 rounded-md border border-[#e9e7e2] bg-white px-3 py-2 text-xs font-normal outline-none focus:border-[#c51e1c]" /></label>
          <label className="mt-4 grid gap-1.5 text-[11px] font-semibold">Véhicule<select value={assetId} onChange={(event) => { const nextAsset = assets.find((asset) => asset.id === event.target.value); setAssetId(event.target.value); const nextScene = getScenePresets(inferVehicleCategory(nextAsset?.make, nextAsset?.model))[0]; if (nextScene) setScenePresetId(nextScene.id); }} disabled={assetsLoading || !assets.length} className="min-h-10 rounded-md border border-[#e9e7e2] bg-white px-3 py-2 text-xs font-normal outline-none focus:border-[#c51e1c]"><option value="">{assetsLoading ? 'Chargement…' : 'Choisissez un véhicule'}</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.make} {asset.model}</option>)}</select></label>
          {selectedAsset && <div className="mt-3 flex items-center gap-3 rounded-md bg-[#f8f7f4] p-2"><span className="grid size-12 shrink-0 place-items-center overflow-hidden bg-[#ededeb]">{selectedAsset.previewUrl ? <Image src={selectedAsset.previewUrl} alt={`${selectedAsset.make ?? 'Véhicule'} ${selectedAsset.model ?? ''}`} width={48} height={48} unoptimized className="size-full object-cover" /> : <span className="text-xl text-[#831810]" aria-hidden="true">◈</span>}</span><span className="min-w-0"><b className="block truncate text-xs">{selectedAsset.make} {selectedAsset.model}</b><small className="mt-1 block truncate text-[10px] text-[#99958e]">{selectedAsset.color ?? 'Photo validée'}</small></span></div>}
          {assetsError && <div role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-700">{assetsError}<button type="button" onClick={() => setAssetsRetry((value) => value + 1)} className="ml-2 font-semibold underline">Réessayer</button></div>}
          {!assetsLoading && !assetsError && !assets.length && <Link href="/mediatheque" className="mt-3 block rounded-md border border-dashed border-[#dad7d1] p-3 text-center text-xs text-[#817d76]">＋ Ajouter une photo validée</Link>}
        </section>

        <section className="rounded-md border border-[#e2e2e5] bg-white p-4">
          <div className="space-y-4">
            <fieldset><legend className="mb-2 text-[11px] font-semibold">Lieu</legend><div className="flex flex-wrap gap-1.5">{locationChoices.map((scene) => <button type="button" key={scene.location} onClick={() => { setScenePresetId(scene.id); setConceptId('signature'); }} aria-pressed={scene.id === selectedScene?.id} className={`rounded-full border px-2.5 py-1.5 text-[10px] transition ${scene.location === selectedScene?.location ? 'border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]' : 'border-[#e5e2dd] text-[#77736d] hover:border-[#c51e1c]'}`}>{scene.label.split(' · ')[0]}</button>)}</div></fieldset>
            <fieldset><legend className="mb-2 text-[11px] font-semibold">Décor</legend><div className="grid gap-1.5">{decorChoices.slice(0, 5).map((scene) => <button type="button" key={scene.setting} onClick={() => setScenePresetId(scene.id)} aria-pressed={scene.setting === selectedScene?.setting} className={`rounded-md border px-2.5 py-2 text-left text-[10px] transition ${scene.setting === selectedScene?.setting ? 'border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]' : 'border-[#e5e2dd] text-[#77736d] hover:border-[#c51e1c]'}`}>{scene.label}</button>)}</div></fieldset>
            <fieldset><legend className="mb-2 text-[11px] font-semibold">Personnage</legend><div className="flex flex-wrap gap-1.5">{characterOptions.map((option) => <button type="button" key={option.value || 'none'} onClick={() => setCharacter(option.value)} aria-pressed={character === option.value} className={`rounded-full border px-2.5 py-1.5 text-[10px] transition ${character === option.value ? 'border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]' : 'border-[#e5e2dd] text-[#77736d] hover:border-[#c51e1c]'}`}>{option.value ? option.label.replace('Une ', '') : 'Aucun'}</button>)}</div></fieldset>
            <fieldset><legend className="mb-2 text-[11px] font-semibold">Lumière</legend><div className="flex flex-wrap gap-1.5">{lightingChoices.map((scene) => <button type="button" key={scene.lighting} onClick={() => setScenePresetId(scene.id)} aria-pressed={scene.lighting === selectedScene?.lighting} className={`rounded-full border px-2.5 py-1.5 text-[10px] transition ${scene.lighting === selectedScene?.lighting ? 'border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]' : 'border-[#e5e2dd] text-[#77736d] hover:border-[#c51e1c]'}`}>{scene.lighting.includes('fin de journée') ? 'Fin de journée' : scene.lighting.includes('Nuit') || scene.lighting.includes('nuit') ? 'Nuit' : 'Matin'}</button>)}</div></fieldset>
          </div>
        </section>

        <section className="rounded-md border border-[#e2e2e5] bg-white p-4">
          <fieldset><legend className="mb-2 text-[11px] font-semibold">Format</legend><div className="flex flex-wrap gap-1.5">{(mode === 'live' ? selectedModel?.formats ?? ['16:9', '9:16'] : ['16:9', '9:16', '1:1', '4:5']).map((value) => <button type="button" key={value} onClick={() => setFormat(value as Format)} aria-pressed={format === value} className={`rounded-full border px-2.5 py-1.5 text-[10px] ${format === value ? 'border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]' : 'border-[#e5e2dd] text-[#77736d]'}`}>{value}</button>)}</div></fieldset>
          <fieldset className="mt-4"><legend className="mb-2 text-[11px] font-semibold">Durée</legend><div className="flex flex-wrap gap-1.5">{durationOptions.map((seconds) => <button type="button" key={seconds} onClick={() => setDurationS(seconds)} aria-pressed={durationS === seconds} className={`rounded-full border px-2.5 py-1.5 text-[10px] ${durationS === seconds ? 'border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]' : 'border-[#e5e2dd] text-[#77736d]'}`}>{seconds} s</button>)}</div></fieldset>
          <fieldset className="mt-4"><legend className="mb-2 text-[11px] font-semibold">Niveau de génération</legend><div className="flex gap-1.5">{([{ value: 'standard', label: 'Standard' }, { value: 'premium', label: 'Premium' }] as const).map((option) => <button type="button" key={option.value} onClick={() => { setTier(option.value); setDurationS(5); }} aria-pressed={tier === option.value} className={`flex-1 rounded-full border px-2.5 py-1.5 text-[10px] ${tier === option.value ? 'border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]' : 'border-[#e5e2dd] text-[#77736d]'}`}>{option.label}</button>)}</div></fieldset>
          <label className="mt-4 flex items-center justify-between gap-3 border-t border-[#eeeae4] pt-4 text-[11px] font-semibold"><span>Ajouter le logo RIMCO<small className="mt-1 block text-[10px] font-normal text-[#88847d]">Incrusté après la génération</small></span><input type="checkbox" checked={overlayLogo} onChange={(event) => setOverlayLogo(event.target.checked)} className="size-4 accent-[#c51e1c]" /></label>
          {mode === 'live' && <div className="mt-4 rounded-md bg-[#f8f7f4] px-3 py-2.5 text-[10px] text-[#716d66]">{modelsLoading ? <p role="status">Chargement des modèles…</p> : modelsError ? <p role="alert">{modelsError}</p> : <p>Modèle prévu : <b>{routedModel?.name ?? 'Aucun modèle compatible'}</b></p>}</div>}
          {mode === 'mock' && <p className="mt-4 rounded-md bg-[#fbf6ed] p-3 text-[10px] leading-4 text-[#765d39]">Simulation active : aucune vidéo payante ne sera générée.</p>}
          {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-700">{error}</p>}
          <div className="mt-4 border-t border-[#eeeae4] pt-4"><p className="text-[10px] text-[#88847d]">Estimation avant lancement</p><p className="mt-1 text-sm font-semibold">{priceLabel} <span className="text-[10px] font-normal text-[#88847d]">par génération · {durationS} s</span></p></div>
          <button disabled={busy || generationActive || !assetId || mode === 'live' && (!routedModel || !estimatedPrice)} aria-describedby={generationActive ? 'generation-lock-message' : undefined} className="mt-4 w-full rounded-md bg-[#c51e1c] py-3 text-xs font-semibold text-white transition hover:bg-[#a71715] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Préparation…' : generationActive ? 'Génération en cours…' : 'Lancer la vidéo'}</button>
          {generationActive && <p id="generation-lock-message" role="status" className="mt-3 rounded-md bg-[#fbf6ed] p-3 text-[10px] leading-4 text-[#765d39]">Une génération est déjà en cours. Le bouton sera réactivé lorsque la vidéo sera prête.</p>}
        </section>
        <p className="px-1 text-[10px] leading-4 text-[#88847d]">La photo du véhicule reste la référence. Le Studio déduit automatiquement le concept, le rythme et les mouvements à partir de votre brief et de vos choix.</p>
      </aside>
    </form>
  );
}
