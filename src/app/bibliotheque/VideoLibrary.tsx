'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { StatusPill } from '@/components/shell';
import { preservePreviewUrl } from '@/core/storage/preview-cache';
import { generationTierLabel } from '@/core/versions/generation-tier';
import { useGenerationTracker, useNow } from '@/components/generation-tracker';
import { LIBRARY_STATUS_LABELS, LIBRARY_TABS, libraryStatus } from '@/core/versions/library-status';
import { failureExplanation, type BillingSummary } from '@/core/versions/outcome';
import { etaText, formatDuration, formatStepDurations, progressView, type GenerationProgress, type ProgressSource } from '@/core/versions/progress';
import type { GenerationInputs } from '@/core/versions/generation-inputs';

type Video = { progress?: GenerationProgress | null; billing?: BillingSummary | null; errorMessage?: string | null; id: string; videoId?: string; title?: string; make?: string; model?: string; status: string; tier?: string | null; photoFidelity?: boolean; format?: string; durationSeconds?: number; checkedQualityShots?: number; totalQualityShots?: number; createdAt?: string; created_at?: string; estimatedPriceFcfa?: number; price_fcfa?: number; priceFcfa?: number; videoUrl?: string | null; previewUrl?: string | null; previewSource?: 'final' | 'raw' | null; finalUrl?: string; validationId?: string | null; validationStatus?: string | null; version?: number; department?: string; userId?: string; inputs?: GenerationInputs; processingStage?: 'queued' | 'keyframing' | 'generating' | 'quality_checking' | 'transferring' | 'postprocessing' | 'ready' | 'failed'; stageElapsedSeconds?: number | null; processingDurations?: { queueSeconds: number | null; keyframingSeconds?: number | null; generationSeconds: number | null; transferSeconds: number | null; postproductionSeconds: number | null; billingSeconds: number | null } };

function formatVideoPrice(video: Video) {
  if (video.photoFidelity) return 'Sans appel vidéo IA';
  // 27/10: a failed or cancelled video is never billed (its credits are released).
  if (video.status === 'failed' || video.status === 'cancelled') return 'Non facturée';
  const amount = [video.priceFcfa, video.estimatedPriceFcfa, video.price_fcfa].find((value): value is number => typeof value === 'number');
  return amount === undefined ? 'Montant indisponible' : `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;
}
function videoMethodLabel(video: Video) {
  return video.photoFidelity ? 'Fidélité photo' : generationTierLabel(video.tier);
}
function formatVideoDate(value?: string) {
  if (!value) return 'Date indisponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date indisponible';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Abidjan' }).format(date);
}
const isVideoInProgress = (status: string) => ['queued', 'generating', 'postprocessing'].includes(status);
const videoAspectClass = (format?: string) => format === '9:16' ? 'aspect-[9/16]' : format === '1:1' ? 'aspect-square' : format === '4:5' ? 'aspect-[4/5]' : 'aspect-video';
/** Step of a video still running, with the same labels as the Studio, the queue and the header. */
function LibraryProgressLine({ version, now }: { version: ProgressSource; now: number }) {
  const view = progressView(version, now);
  const eta = etaText(view.eta);
  return <p className="mt-4 text-xs leading-5 text-[#626269]">{view.stepLabel}{view.phase === 'decision' && view.waitingSeconds != null ? ` · en attente de votre décision depuis ${formatDuration(view.waitingSeconds)}` : view.totalSeconds != null ? ` · lancée il y a ${formatDuration(view.totalSeconds)}` : ''}{eta ? ` · ${eta}` : ''}. Suivi automatique tant qu’une page RIMCO Studio est ouverte.</p>;
}

function GenerationInputsDetails({ video }: { video: Video }) {
  const inputs = video.inputs;
  if (!inputs) return null;
  const rows: Array<[string, string]> = [
    ['Véhicule', inputs.vehicle ?? '—'],
    ['Lieu' + (inputs.places.length > 1 ? 'x' : ''), inputs.places.join(' · ') || '—'],
    ['Casting', inputs.cast.join(' · ') || 'Aucun'],
    ['Lumière', inputs.lighting ?? '—'],
    ['Ambiance', inputs.mood ?? '—'],
    ['Musique', inputs.music ?? 'Sans musique'],
    ['Format', video.format ?? '16:9'],
    ['Niveau', videoMethodLabel(video)],
    // 28/10 · V1 : pas de transition entre les plans.
    ['Montage', 'Plans enchaînés en coupe franche, logo à la fin'],
  ];
  return <details onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className="mt-3 border-t border-[#e2e2e5] pt-3">
    <summary className="cursor-pointer text-xs font-semibold text-[#831810]">Voir les paramètres de création</summary>
    <div className="mt-3 space-y-3 text-xs">
      <div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#626269]">Description saisie</p><p className="mt-1 whitespace-pre-wrap leading-5 text-[#333338]">{inputs.description ?? 'Aucune description saisie.'}</p></div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">{rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-[#626269]">{label}</dt><dd className="break-words text-[#333338]">{value}</dd></div>)}</dl>
    </div>
  </details>;
}

/** 28/10 · V1 : ce que le réalisateur a adapté dans la demande, rappelé après le lancement. */
export function AdaptationsNote({ video }: { video: Video }) {
  const adaptations = video.inputs?.adaptations ?? [];
  if (!adaptations.length) return null;
  return <div role="note" className="mt-4 border border-[#e7d7b9] bg-[#fbf6ed] px-4 py-3 text-xs leading-5 text-[#765d39]">
    <p className="font-semibold">Votre demande a été adaptée</p>
    <ul className="mt-1 list-disc space-y-1 pl-4">{adaptations.map((entry) => <li key={entry}>{entry}</li>)}</ul>
  </div>;
}

/** `currentUserId`: only the author of a video sends it for validation. */
export function VideoLibrary({ currentUserId }: { currentUserId?: string }) {
  const [videos, setVideos] = useState<Video[]>([]);
  // 29/10 · O03 : réglage du client renvoyé par /api/versions ; désactivé par défaut (téléchargement direct).
  const [videoValidation, setVideoValidation] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  // 28/10 · le détail s'affiche sous la grille : on y amène l'utilisateur quand il ouvre une vidéo.
  const detailRef = useRef<HTMLElement | null>(null);
  const selectedVideoId = selectedVideo?.id ?? null;
  useEffect(() => {
    if (!selectedVideoId) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    detailRef.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [selectedVideoId]);
  const videosRef = useRef<Video[]>([]);
  const [unavailablePreviewIds, setUnavailablePreviewIds] = useState<string[]>([]);
  const renewedPreviewIds = useRef(new Set<string>());
  const tracker = useGenerationTracker();
  const refreshIssues = tracker.snapshot.versions.some((version) => version.refreshFailed);
  /** Changes when a followed version moves on: the library then reloads its list (the tracker alone calls /refresh). */
  const trackerSignature = tracker.snapshot.versions.map((version) => `${version.id}:${version.versionStatus ?? version.status}:${version.processingStage ?? ''}`).join('|');
  const lastSignature = useRef('');
  const now = useNow(tracker.snapshot.versions.some((version) => ['queued', 'generating', 'postprocessing'].includes(version.versionStatus ?? version.status)));

  const loadVideos = useCallback(async (includePreviews = true, renewPreviewIds: ReadonlySet<string> = new Set()) => {
    const response = await fetch(`/api/versions${includePreviews ? '' : '?includePreviews=false'}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Impossible de charger la bibliothèque.');
    const incoming = (data.versions ?? []) as Video[];
    const existing = new Map(videosRef.current.map((video) => [video.id, video]));
    const nextVideos = incoming.map((video) => preservePreviewUrl(video, existing.get(video.id), renewPreviewIds));
    videosRef.current = nextVideos;
    setVideos(nextVideos);
    setVideoValidation(data.videoValidation === true);
    setSelectedVideo((current) => {
      if (!current) return null;
      const updated = incoming.find((video) => (video.videoId ?? video.id) === (current.videoId ?? current.id));
      if (!updated) return null;
      return preservePreviewUrl(updated, current, renewPreviewIds);
    });
    const visibleIds = new Set(incoming.map((video: Video) => video.videoId ?? video.id));
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, []);

  async function renewExpiredPreview(versionId: string) {
    if (renewedPreviewIds.current.has(versionId)) {
      setUnavailablePreviewIds((current) => current.includes(versionId) ? current : [...current, versionId]);
      return;
    }
    renewedPreviewIds.current.add(versionId);
    try {
      await loadVideos(true, new Set([versionId]));
    } catch (cause) {
      setUnavailablePreviewIds((current) => current.includes(versionId) ? current : [...current, versionId]);
      setError(cause instanceof Error ? cause.message : 'Impossible de renouveler le lien de lecture.');
    }
  }

  function clearPreviewError(versionId: string) {
    setUnavailablePreviewIds((current) => current.filter((id) => id !== versionId));
  }

  useEffect(() => { loadVideos().catch((cause) => setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.')); }, [loadVideos]);

  // Direct link « /bibliotheque?video=<id> » (Studio, notifications): the video is opened and highlighted once.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const linkedVideo = useRef<string | null>(null);
  useEffect(() => {
    if (linkedVideo.current === null) linkedVideo.current = new URLSearchParams(window.location.search).get('video') ?? '';
    if (!linkedVideo.current || !videos.length) return;
    const wanted = linkedVideo.current;
    const video = videos.find((item) => item.videoId === wanted || item.id === wanted);
    linkedVideo.current = '';
    if (!video) { setNotice('Cette vidéo n’est plus dans votre Bibliothèque.'); return; }
    const key = video.videoId ?? video.id;
    setSelectedVideo(video);
    setHighlightedId(key);
    window.requestAnimationFrame(() => document.getElementById(`video-card-${key}`)?.scrollIntoView({ block: 'center' }));
  }, [videos]);
  useEffect(() => {
    if (!trackerSignature || trackerSignature === lastSignature.current) return;
    const first = lastSignature.current === '';
    lastSignature.current = trackerSignature;
    if (first) return;
    loadVideos(false).catch(() => undefined);
  }, [trackerSignature, loadVideos]);

  const filtered = useMemo(() => videos.filter((video) =>
    (filter === 'all' || libraryStatus(video) === filter) && `${video.title ?? ''} ${video.make ?? ''} ${video.model ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  ), [videos, filter, query]);
  const selectedVideos = videos.filter((video) => selectedIds.includes(video.videoId ?? video.id));
  const selectableVisibleIds = filtered.filter((video) => !isVideoInProgress(video.status)).map((video) => video.videoId ?? video.id);
  const allVisibleSelected = selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selectedIds.includes(id));
  // Sans validation, les onglets « En validation », « Validées » et « Refusées » n'ont pas lieu d'être.
  const tabs = videoValidation ? LIBRARY_TABS : LIBRARY_TABS.filter(([value]) => !['review', 'approved', 'rejected'].includes(value));

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setError('');
    setNotice('');
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !selectableVisibleIds.includes(id))
      : [...new Set([...current, ...selectableVisibleIds])]);
  }

  function downloadSelected() {
    const downloadable = selectedVideos.filter((video) => video.status === 'ready' && video.videoUrl);
    if (downloadable.length !== selectedVideos.length || downloadable.length === 0) return;
    setError('');
    setNotice(`Téléchargement de ${downloadable.length} vidéo${downloadable.length > 1 ? 's' : ''} lancé.${downloadable.length > 1 ? ' Autorisez les téléchargements multiples dans Chrome si le navigateur le demande.' : ''}`);
    downloadable.forEach((video) => {
      const link = document.createElement('a');
      link.href = video.videoUrl!;
      link.download = `${(video.title ?? 'video-rimco').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'video-rimco'}.mp4`;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  async function deleteSelected() {
    if (!selectedIds.length || deleting) return;
    const confirmed = window.confirm(`Supprimer définitivement ${selectedIds.length} vidéo${selectedIds.length > 1 ? 's' : ''} et leurs fichiers MP4 ? L’historique des coûts restera conservé.`);
    if (!confirmed) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/versions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoIds: selectedIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Impossible de supprimer la sélection.');
      setSelectedIds([]);
      await loadVideos();
      setNotice(`${data.deleted} vidéo${data.deleted > 1 ? 's supprimées' : ' supprimée'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de supprimer la sélection.');
    } finally {
      setDeleting(false);
    }
  }

  async function submitForValidation(video: Video) {
    setError('');
    const response = await fetch('/api/validations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId: video.id }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? 'Impossible d’envoyer la vidéo en validation.'); return; }
    setNotice('Vidéo envoyée en validation.');
    await loadVideos();
  }

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1 overflow-x-auto border border-[#e2e2e5] bg-white p-1">{tabs.map(([value, label]) => <button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`min-h-11 whitespace-nowrap px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] ${filter === value ? 'bg-[#fae9e8] text-[#9c2822]' : 'text-[#626269] hover:bg-[#f4f4f5]'}`}>{label}</button>)}</div>
      <input aria-label="Rechercher une vidéo" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher…" className="min-h-11 w-full border border-[#e2e2e5] bg-white px-4 py-2.5 text-xs outline-none focus:border-[#c51e1c] sm:w-64" />
    </div>
    {filtered.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-[#e2e2e5] bg-white px-4 py-3">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-[#333338]">
        <input type="checkbox" aria-label="Sélectionner toutes les vidéos visibles" checked={allVisibleSelected} onChange={toggleVisibleSelection} className="size-4 accent-[#c51e1c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c]" />
        Sélectionner les vidéos visibles
      </label>
      {selectedIds.length > 0 && <>
        <span aria-live="polite" className="text-xs text-[#626269]">{selectedIds.length} sélectionnée{selectedIds.length > 1 ? 's' : ''}</span>
        <button type="button" onClick={downloadSelected} disabled={!selectedVideos.length || selectedVideos.some((video) => video.status !== 'ready' || !video.videoUrl)} className="min-h-11 rounded-sm border border-[#d4d4d8] bg-white px-3.5 text-xs font-semibold text-[#242428] hover:bg-[#f7f7f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] disabled:cursor-not-allowed disabled:opacity-45">Télécharger la sélection</button>
        <button type="button" onClick={deleteSelected} disabled={deleting} className="min-h-11 rounded-sm border border-[#e4b9b6] bg-[#fff8f7] px-3.5 text-xs font-semibold text-[#9c2822] hover:bg-[#fae9e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] disabled:cursor-wait disabled:opacity-60">{deleting ? 'Suppression…' : 'Supprimer la sélection'}</button>
        <button type="button" onClick={() => setSelectedIds([])} className="min-h-11 px-2 text-xs font-medium text-[#626269] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c]">Effacer la sélection</button>
      </>}
    </div>}
    {error && <p role="alert" className="mb-5 border border-[#f0c9c6] bg-[#fae9e7] p-4 text-sm text-[#9d352e]">{error}</p>}
    {refreshIssues && <p role="status" className="mb-5 border border-[#ead9b4] bg-[#fff9ed] p-4 text-sm text-[#77591f]">Le suivi de génération est momentanément indisponible. La réservation de coût reste inchangée ; une nouvelle tentative est automatique.</p>}
    {notice && <p role="status" className="mb-5 border border-[#d7e7da] bg-[#f2f8f3] p-4 text-sm text-[#315c39]">{notice}</p>}
    {filtered.length === 0 ? <div className="border border-dashed border-[#d2d2d6] bg-white px-6 py-16 text-center"><svg aria-hidden="true" viewBox="0 0 24 24" className="mx-auto size-8 fill-none stroke-[#c51e1c]" strokeWidth="1.5"><path d="M4 5h16v14H4zM10 9l5 3-5 3z" /></svg><h2 className="mt-4 text-sm font-semibold">Aucune vidéo dans cette vue</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#626269]">Les vidéos générées apparaîtront ici avec leur aperçu, leur statut et leur prix.</p><Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-sm bg-[#c51e1c] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#a71715]">Créer une vidéo</Link></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((video) => <article key={video.videoId ?? video.id} id={`video-card-${video.videoId ?? video.id}`} aria-current={highlightedId === (video.videoId ?? video.id) ? 'true' : undefined} onClick={() => setSelectedVideo(video)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedVideo(video); } }} tabIndex={0} role="button" className={`cursor-pointer overflow-hidden border bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] ${highlightedId === (video.videoId ?? video.id) ? 'border-[#c51e1c] ring-4 ring-[#c51e1c]/25' : selectedVideo?.id === video.id ? 'border-[#c51e1c]' : 'border-[#e2e2e5]'}`}>
        <div className="flex min-h-11 items-center justify-between border-b border-[#e2e2e5] px-4">
          <label className={`inline-flex min-h-11 items-center gap-2 text-xs font-medium ${isVideoInProgress(video.status) ? 'cursor-not-allowed text-[#626269]' : 'cursor-pointer text-[#333338]'}`}>
            <input type="checkbox" checked={selectedIds.includes(video.videoId ?? video.id)} disabled={isVideoInProgress(video.status)} onChange={() => toggleSelected(video.videoId ?? video.id)} aria-label={`Sélectionner ${video.title ?? 'la vidéo'}`} className="size-4 accent-[#c51e1c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] disabled:cursor-not-allowed" />
            {isVideoInProgress(video.status) ? 'Génération en cours' : 'Sélectionner'}
          </label>
        </div>
        {video.previewUrl ? <video controls preload="none" src={video.previewUrl} onError={() => { void renewExpiredPreview(video.id); }} onLoadedMetadata={() => clearPreviewError(video.id)} className={`${videoAspectClass(video.format)} w-full bg-[#232326] object-contain`} aria-label={`Aperçu de ${video.title ?? 'la vidéo'}`} /> : <div className={`grid ${videoAspectClass(video.format)} place-items-center bg-[#eeeeef] text-[#626269]`}><svg aria-hidden="true" viewBox="0 0 24 24" className="size-9 fill-none stroke-current" strokeWidth="1.5"><path d="M4 5h16v14H4zM10 9l5 3-5 3z" /></svg></div>}
        {video.previewSource === 'raw' && <p className="border-t border-[#ead9b4] bg-[#fff9ed] px-4 py-2 text-xs text-[#77591f]">Aperçu du fichier brut : l’habillage ou la piste audio finale peuvent manquer.</p>}
        {(!video.previewUrl || unavailablePreviewIds.includes(video.id)) && ['ready', 'review'].includes(video.status) && <p className="border-t border-[#ead9b4] bg-[#fff9ed] px-4 py-2 text-xs text-[#77591f]">Aperçu indisponible après renouvellement : le MP4 est absent ou inaccessible dans le stockage.</p>}
        <div className="p-4"><div className="flex items-center justify-between gap-3"><StatusPill status={LIBRARY_STATUS_LABELS[libraryStatus(video)]} /><span className="text-xs font-semibold tabular-nums">{formatVideoPrice(video)}</span></div><h3 className="mt-3 truncate text-sm font-semibold">{video.title ?? `${video.make ?? 'Nouvelle'} ${video.model ?? 'vidéo'}`}</h3><p className="mt-1 text-xs text-[#626269]">{formatVideoDate(video.createdAt ?? video.created_at)} · {video.durationSeconds ?? 5} s · <span className="font-medium text-[#4b4b50]">{videoMethodLabel(video)}</span></p>
          {libraryStatus(video) === 'failed' && <p className="mt-3 text-xs leading-5 text-[#9d352e]">{failureExplanation(video.errorMessage).cause}</p>}
          {/* 29/10 · O03 : le serveur ne renvoie un lien de téléchargement que si la vidéo peut être téléchargée ; « Envoyer en validation » seulement si le client a activé la validation. */}
          {video.videoUrl ? <div className="mt-4 flex flex-wrap gap-2"><a href={video.videoUrl} download onClick={(event) => event.stopPropagation()} className="inline-flex min-h-11 items-center rounded-sm bg-[#c51e1c] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#a71715] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c]">Télécharger le MP4</a></div>
            : videoValidation && libraryStatus(video) === 'ready' && (!currentUserId || video.userId === currentUserId) ? <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); void submitForValidation(video); }} className="inline-flex min-h-11 items-center rounded-sm border border-[#e2e2e5] px-3.5 py-2.5 text-xs font-semibold hover:bg-[#f7f7f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c]">Envoyer en validation</button><span className="text-xs text-[#626269]">Téléchargement après validation.</span></div>
            : video.status === 'generating' ? <LibraryProgressLine version={tracker.snapshot.versions.find((version) => version.id === video.id) ?? video} now={now} /> : null}
          {video.status !== 'generating' && video.progress && formatStepDurations(video.progress.durations) && <p className="mt-3 text-xs text-[#626269]">Durées : {formatStepDurations(video.progress.durations)}</p>}
          <GenerationInputsDetails video={video} />
        </div>
      </article>)}
    </div>}
    {selectedVideo && <aside ref={detailRef} className="mt-6 scroll-mt-6 border border-[#e2e2e5] bg-white p-5" aria-label="Détails de la vidéo sélectionnée"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#c51e1c]">Détail de la vidéo</p><h2 className="mt-1 text-lg font-semibold">{selectedVideo.title ?? 'Vidéo sans titre'}</h2></div><span className="text-xs text-[#626269]">{selectedVideo.format ?? '16:9'} · V{selectedVideo.version ?? 1} · {selectedVideo.durationSeconds ?? 5} s · {videoMethodLabel(selectedVideo)}</span></div>{selectedVideo.previewUrl && <video controls preload="none" src={selectedVideo.previewUrl} onError={() => { void renewExpiredPreview(selectedVideo.id); }} onLoadedMetadata={() => clearPreviewError(selectedVideo.id)} className={`mt-4 ${videoAspectClass(selectedVideo.format)} max-h-[420px] w-full bg-[#232326] object-contain`} />}{selectedVideo.previewSource === 'raw' && <p className="mt-3 border border-[#ead9b4] bg-[#fff9ed] px-4 py-2 text-xs text-[#77591f]">Aperçu du fichier brut : l’habillage ou la piste audio finale peuvent manquer.</p>}{(!selectedVideo.previewUrl || unavailablePreviewIds.includes(selectedVideo.id)) && ['ready', 'review'].includes(selectedVideo.status) && <p className="mt-3 border border-[#ead9b4] bg-[#fff9ed] px-4 py-2 text-xs text-[#77591f]">Aperçu indisponible après renouvellement : le MP4 est absent ou inaccessible dans le stockage.</p>}{selectedVideo.videoUrl && <a href={selectedVideo.videoUrl} download className="mt-4 inline-flex min-h-11 items-center rounded-sm bg-[#c51e1c] px-4 py-2.5 text-xs font-semibold text-white">Télécharger MP4</a>}<AdaptationsNote video={selectedVideo} /><GenerationInputsDetails video={selectedVideo} /></aside>}
  </>;
}
