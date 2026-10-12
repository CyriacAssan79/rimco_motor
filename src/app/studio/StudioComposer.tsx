'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatFcfa } from '@/core/pricing';
import { getScenePresets, getScenePreset, inferVehicleCategory, type ScenePreset } from '@/core/scenes/catalog';
import { getSceneConcepts } from '@/core/scenes/concepts';

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
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [overlayLogo, setOverlayLogo] = useState(true);
  const [scenePresetId, setScenePresetId] = useState('');
  const [conceptId, setConceptId] = useState('signature');
  const [complexity, setComplexity] = useState<'simple' | 'balanced' | 'rich'>('simple');
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
  const sceneChoices = [...relevantScenes, ...allScenes.filter((scene) => !relevantScenes.some((recommended) => recommended.id === scene.id))].slice(0, 4);
  const selectedScene = getScenePreset(scenePresetId) ?? relevantScenes[0];
  const concepts = selectedScene ? getSceneConcepts(selectedScene) : [];
  const selectedConcept = concepts.find((concept) => concept.id === conceptId) ?? concepts[0];
  const compatibleModels = availableModels.filter((model) => model.tier === tier);
  const targetFamily = tier === 'standard' ? durationS === 5 ? 'wan' : 'kling' : durationS === 5 ? 'veo' : 'seedance';
  const routedModel = compatibleModels.find((model) => model.adapterFamily === targetFamily && model.durations.includes(durationS));
  const selectedModel = routedModel;
  const estimatedPrice = selectedModel?.estimatedPricesFcfa?.[String(durationS)];
  const priceLabel = mode === 'live' && estimatedPrice ? `≈ ${formatFcfa(estimatedPrice)}` : mode === 'mock' ? 'Simulation' : '—';
  const durationOptions = mode === 'mock' ? [5] : tier === 'standard' ? [5, 10, 15] : [5, 10, 15, 20, 30];

  useEffect(() => {
    if (selectedModel && !selectedModel.formats.includes(format)) setFormat(selectedModel.formats[0] ?? '16:9');
  }, [selectedModel, format]);

  useEffect(() => {
    const allowed = mode === 'mock' ? [5] : tier === 'standard' ? [5, 10, 15] : [5, 10, 15, 20, 30];
    if (!allowed.includes(durationS)) setDurationS(allowed[0]);
  }, [durationS, mode, tier]);

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    fetch('/api/models/available')
      .then(async (response) => response.ok ? response.json() : { models: [] })
      .then((data) => {
        if (!active) return;
        const models: Model[] = data.models ?? [];
        setAvailableModels(models);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    let active = true;
    fetch('/api/assets?kind=vehicle&status=valid%C3%A9e')
      .then(async (response) => response.ok ? response.json() : { assets: [] })
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
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

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
    <div className="grid gap-6 xl:grid-cols-[1fr_350px]">
      <form onSubmit={submit} className="space-y-6 rounded-md border border-black/[.055] bg-white p-6 md:p-8">
        <section>
          <h2 className="text-sm font-semibold">1. Choisissez le véhicule</h2>
          <p className="mt-1 text-xs text-[#99958e]">Sa photo sert de référence pendant toute la vidéo.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {assets.map((asset) => (
              <button type="button" key={asset.id} onClick={() => setAssetId(asset.id)} className={`flex items-center gap-3 rounded-md border p-3 text-left ${asset.id === assetId ? 'border-[#c51e1c] bg-[#fcf6f4]' : 'border-[#eceae6]'}`}>
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden bg-[#f1f1f2]">
                  {asset.previewUrl ? <Image src={asset.previewUrl} alt={`${asset.make ?? 'Véhicule'} ${asset.model ?? ''}`} width={48} height={48} unoptimized className="size-full object-cover" /> : <span aria-hidden="true" className="text-xl text-[#831810]">◈</span>}
                </span>
                <span><b className="block text-xs">{asset.make} {asset.model}</b><small className="mt-1 block text-[10px] text-[#99958e]">{asset.color ?? 'Photo validée'}</small></span>
              </button>
            ))}
          </div>
          {!assets.length && <Link href="/mediatheque" className="mt-3 flex justify-center rounded-md border border-dashed border-[#dad7d1] bg-[#fcfcfb] px-4 py-6 text-sm text-[#817d76]">＋ Ajoutez et faites valider votre première photo</Link>}
          {assets.length > 0 && <Link href="/mediatheque" className="mt-2 inline-block text-xs font-semibold text-[#ae332b]">Ajouter un autre véhicule ↗</Link>}
        </section>

        <section className="space-y-4 border-t border-[#eeeae4] pt-5">
          <label className="grid gap-2 text-xs font-semibold">Titre de la vidéo<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Ex. Starlight EV · lancement Abidjan" className="rounded-md border border-[#e9e7e2] bg-white px-3 py-3 text-sm font-normal outline-none focus:border-[#c51e1c]" /><span className="font-normal text-[#88847d]">Ce titre apparaîtra dans la Bibliothèque et le suivi de facturation.</span></label>
          <fieldset>
            <legend className="text-sm font-semibold">2. Choisissez une scène</legend>
            <p className="mt-1 text-xs text-[#88847d]">Le Studio adapte le lieu et la mise en scène au véhicule sélectionné.</p>
            <div className="mt-3 flex flex-wrap gap-2">{sceneChoices.map((scene: ScenePreset) => <button type="button" key={scene.id} onClick={() => { setScenePresetId(scene.id); setConceptId('signature'); }} aria-pressed={scene.id === selectedScene?.id} className={`cursor-pointer rounded-md border px-3 py-2.5 text-xs font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] ${scene.id === selectedScene?.id ? 'border-[#c51e1c] bg-[#fcf1f0] text-[#a71917]' : 'border-[#e2e2e5] bg-white text-[#45454b] hover:border-[#c51e1c]'}`}>{scene.label}</button>)}</div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">3. Choisissez un concept</legend>
            <p className="mt-1 text-xs text-[#88847d]">Voici trois propositions pour la scène choisie. Le Studio construira lui-même les temps forts du clip continu.</p>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">{concepts.map((concept) => <button type="button" key={concept.id} onClick={() => setConceptId(concept.id)} aria-pressed={concept.id === selectedConcept?.id} className={`cursor-pointer rounded-md border p-3 text-left transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] ${concept.id === selectedConcept?.id ? 'border-[#c51e1c] bg-[#fcf6f4]' : 'border-[#e2e2e5] bg-white hover:border-[#c51e1c]'}`}><b className="block text-xs">{concept.title}</b><span className="mt-1 block text-xs leading-5 text-[#716d66]">{concept.summary}</span></button>)}</div>
          </fieldset>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[#e9e7e2] bg-[#fcfcfb] p-3 text-xs">
            <input type="checkbox" checked={overlayLogo} onChange={(event) => setOverlayLogo(event.target.checked)} className="mt-0.5 size-4 accent-[#c51e1c]" />
            <span><b className="block">Ajouter le logo RIMCO</b><span className="mt-1 block font-normal text-[#88847d]">Incrusté en haut à gauche après la génération, sans appel IA ni tokens supplémentaires.</span></span>
          </label>
          <label className="grid gap-2 text-xs font-semibold">Précision complémentaire <span className="font-normal text-[#88847d]">Facultative · ajoutez une seule consigne si nécessaire</span>
            <textarea value={additionalDirection} onChange={(event) => setAdditionalDirection(event.target.value)} maxLength={240} rows={2} placeholder="Ex. Montrer les feux qui s’allument à la tombée du jour." className="w-full resize-y rounded-md border border-[#e9e7e2] bg-[#fcfcfb] p-3 text-sm font-normal leading-6 outline-none focus:border-[#c51e1c]" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs font-semibold">Personnage<select value={character} onChange={(event) => setCharacter(event.target.value)} className="rounded-md border border-[#e9e7e2] bg-white px-3 py-3 text-sm font-normal">{characterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <fieldset><legend className="mb-2 text-xs font-semibold">Liberté créative</legend><div className="flex flex-wrap gap-2">{([{ value: 'simple', label: 'Essentielle' }, { value: 'balanced', label: 'Équilibrée' }, { value: 'rich', label: 'Expressive' }] as const).map((option) => <button type="button" key={option.value} onClick={() => setComplexity(option.value)} aria-pressed={complexity === option.value} className={`cursor-pointer rounded-md border px-3 py-2 text-xs transition-colors duration-200 ${complexity === option.value ? 'border-[#c51e1c] bg-[#fcf1f0] text-[#a71917]' : 'border-[#e2e2e5] text-[#55545a] hover:border-[#c51e1c]'}`}>{option.label}</button>)}</div></fieldset>
          </div>
        </section>

        <section className="space-y-4 border-t border-[#eeeae4] pt-5">
          <h2 className="text-sm font-semibold">4. Réglez la génération</h2>
          <fieldset><legend className="mb-2 text-xs font-semibold">Niveau</legend><div className="grid gap-2 sm:grid-cols-2">{([{ value: 'standard', title: 'Standard', detail: 'Génération efficace pour les essais' }, { value: 'premium', title: 'Premium', detail: 'Rendu cinématique et options longues' }] as const).map((option) => <button type="button" key={option.value} onClick={() => { setTier(option.value); setDurationS(5); }} aria-pressed={tier === option.value} className={`cursor-pointer rounded-md border p-3 text-left transition-colors duration-200 ${tier === option.value ? 'border-[#c51e1c] bg-[#fcf6f4]' : 'border-[#e2e2e5] hover:border-[#c51e1c]'}`}><b className="block text-xs">{option.title}</b><span className="mt-1 block text-xs text-[#716d66]">{option.detail}</span></button>)}</div></fieldset>
          <fieldset><legend className="mb-2 text-xs font-semibold">Durée</legend><div className="flex flex-wrap gap-2">{durationOptions.map((seconds) => <button type="button" key={seconds} onClick={() => setDurationS(seconds)} aria-pressed={durationS === seconds} className={`cursor-pointer rounded-md border px-3 py-2 text-xs transition-colors duration-200 ${durationS === seconds ? 'border-[#c51e1c] bg-[#fcf1f0] text-[#a71917]' : 'border-[#e2e2e5] text-[#55545a] hover:border-[#c51e1c]'}`}>{seconds} s</button>)}</div></fieldset>
          {mode === 'live' && <p className="rounded-md bg-[#f8f7f4] px-3 py-2.5 text-xs text-[#716d66]">Modèle prévu : <b>{routedModel?.name ?? 'Chargement…'}</b> · un clip continu de {durationS} secondes.</p>}
          <fieldset><legend className="mb-2 text-xs font-semibold">Format</legend><div className="flex flex-wrap gap-2">{(mode === 'live' ? selectedModel?.formats ?? ['16:9', '9:16'] : ['16:9', '9:16', '1:1', '4:5']).map((value) => <button type="button" key={value} onClick={() => setFormat(value as Format)} className={`rounded-lg border px-3 py-2 text-xs ${format === value ? 'border-[#c51e1c] bg-[#fcf4f2] text-[#a62b24]' : 'border-[#e9e7e2] text-[#79756f]'}`}>{value}</button>)}</div></fieldset>
          {mode === 'mock' && <p className="sm:col-span-2 rounded-md bg-[#fbf6ed] p-3 text-xs text-[#765d39]">La simulation valide le parcours sans contacter fal.ai ni produire de vraie vidéo.</p>}
          <p className="text-xs text-[#716d66]">Le modèle respecte la photo du véhicule. Les mouvements, le rythme et les temps forts sont construits automatiquement dans un seul plan continu.</p>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button disabled={busy || !assetId || mode === 'live' && (!routedModel || !estimatedPrice)} className="w-full rounded-md bg-[#c51e1c] py-3.5 text-sm font-semibold text-white transition hover:bg-[#a71715] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Préparation…' : `Générer ma vidéo · ${priceLabel}`}</button>
        </section>
      </form>

      <aside className="space-y-4">
        <section className="rounded-md border border-[#e2e2e5] bg-white p-6 text-[#161619]">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#c51e1c]">Résumé du montage</p>
          <div className="mt-5 grid aspect-video place-items-center overflow-hidden border border-[#e2e2e5] bg-[#f1f1f2]">{selectedAsset?.previewUrl ? <Image src={selectedAsset.previewUrl} alt={`Aperçu de ${selectedAsset.make ?? ''} ${selectedAsset.model ?? ''}`} width={640} height={360} unoptimized className="size-full object-cover" /> : <span className="text-4xl text-[#c51e1c]" aria-hidden="true">▷</span>}</div>
          <h3 className="mt-4 text-sm font-semibold">{selectedAsset ? `${selectedAsset.make ?? 'Véhicule'} ${selectedAsset.model ?? ''}` : 'Choisissez un véhicule'}</h3>
          <div className="mt-4 space-y-2 border-t border-[#e2e2e5] pt-4 text-xs">
            <div><span className="text-[#77736d]">Scène choisie</span><br /><b>{selectedScene?.label ?? 'Choisissez une scène'}</b></div>
            <div><span className="text-[#77736d]">Concept</span><br /><b>{selectedConcept?.title}</b></div>
            <div className="flex justify-between border-t border-[#eeeae4] pt-3"><span className="text-[#77736d]">Clip continu</span><b>{durationS} secondes</b></div>
            <div className="flex justify-between"><span className="text-[#77736d]">Montant probable</span><b>{priceLabel}</b></div>
            {mode === 'live' && <p className="text-[10px] leading-4 text-[#88847d]">Estimation indicative, selon le modèle et sa durée. Le montant final peut varier.</p>}
          </div>
        </section>
        {job && <section className="rounded-md border border-black/[.055] bg-white p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">État de la vidéo</h3><span className="text-[10px] font-semibold uppercase text-[#a47731]">{job.status === 'ready' ? 'Prête' : job.status === 'failed' ? 'Échec' : 'En cours'}</span></div><p className="mt-2 text-xs text-[#88847d]">{job.status === 'ready' ? 'Votre vidéo est prête à consulter.' : job.error ?? 'Actualisation automatique toutes les 10 secondes.'}</p>{job.prompt && <details className="mt-4 border-t border-[#eeeae4] pt-3"><summary className="cursor-pointer text-xs font-semibold text-[#716d66]">Voir le prompt généré</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#77736d]">{job.prompt}</p></details>}{job.status === 'ready' && <Link href="/bibliotheque" className="mt-4 block rounded-lg bg-[#c51e1c] px-3 py-2.5 text-center text-xs font-semibold text-white">Voir ma vidéo →</Link>}</section>}
        <section className="rounded-md border border-[#eee3d2] bg-[#fbf6ed] p-5"><p className="text-xs font-semibold text-[#765d39]">Fidélité au véhicule</p><p className="mt-2 text-xs leading-5 text-[#8d806b]">La photo fixe le modèle, la couleur et les proportions. Pour un premier essai, gardez une scène simple et sans figurant.</p></section>
      </aside>
    </div>
  );
}
