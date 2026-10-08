'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { StatusPill } from '@/components/shell';

type Video = { id: string; videoId?: string; title?: string; make?: string; model?: string; status: string; createdAt?: string; created_at?: string; estimatedPriceFcfa?: number; price_fcfa?: number; priceFcfa?: number; videoUrl?: string | null; previewUrl?: string | null; finalUrl?: string };

export function VideoLibrary() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const loadVideos = useCallback(async () => {
    const response = await fetch('/api/versions');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Impossible de charger la bibliothèque.');
    setVideos(data.versions ?? []);
  }, []);
  // Charge l’état serveur à l’ouverture de la bibliothèque.
  useEffect(() => { loadVideos().catch((e) => setError(e instanceof Error ? e.message : 'Une erreur est survenue.')); }, [loadVideos]);
  useEffect(() => {
    if (!videos.some((video) => video.status === 'generating')) return;
    const timer = window.setInterval(async () => {
      const pending = videos.filter((video) => video.status === 'generating');
      await Promise.all(pending.map((video) => fetch(`/api/versions/${video.id}/refresh`).catch(() => undefined)));
      try { await loadVideos(); } catch { /* Keep the last known videos visible during brief network interruptions. */ }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadVideos, videos]);

  const filtered = useMemo(() => videos.filter((video) =>
    (filter === 'all' || video.status === filter) && `${video.title ?? ''} ${video.make ?? ''} ${video.model ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  ), [videos, filter, query]);
  const tabs = [['all', 'Toutes'], ['ready', 'Prêtes'], ['generating', 'En cours'], ['failed', 'Échec']];
  const labels: Record<string, string> = { ready: 'Prête', review: 'Prête', generating: 'Génération', queued: 'Génération', failed: 'Échec', rejected: 'Échec', draft: 'Brouillon' };

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#eae8e3] p-1">{tabs.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${filter === value ? 'bg-white text-[#302e2b] shadow-sm' : 'text-[#77736d] hover:text-[#333]'}`}>{label}</button>)}</div>
      <input aria-label="Rechercher une vidéo" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="w-full rounded-xl border border-[#e7e4df] bg-white px-4 py-2.5 text-xs outline-none focus:border-[#bd8078] sm:w-64" />
    </div>
    {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d8d5cf] bg-white px-6 py-16 text-center"><span aria-hidden="true" className="text-2xl text-[#948f87]">▣</span><h2 className="mt-4 text-sm font-semibold">Aucune vidéo dans cette vue</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#88847c]">Les vidéos générées apparaîtront ici avec leur statut et leur prix.</p><Link href="/studio" className="mt-5 inline-flex rounded-lg bg-[#bd3027] px-4 py-2.5 text-xs font-semibold text-white">Créer une vidéo</Link></div> : <div className="space-y-4">
      {filtered.map((video) => <article key={video.videoId ?? video.id} className="overflow-hidden rounded-2xl border border-black/[.055] bg-white">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 md:grid-cols-[1fr_auto_auto]">
          <div className="flex min-w-0 items-center gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#f5e9e7]"><span aria-hidden="true" className="text-lg text-[#9c2822]">▷</span></div><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{video.title ?? `${video.make ?? 'Nouvelle'} ${video.model ?? 'vidéo'}`}</h3><p className="mt-1 text-[11px] text-[#99958e]">{video.createdAt ?? video.created_at ?? 'Aujourd’hui'} · 5 s</p></div></div>
          <StatusPill status={labels[video.status] ?? video.status} />
          <div className="col-span-2 flex items-center justify-between gap-4 md:col-span-1 md:justify-end"><span className="whitespace-nowrap text-xs font-semibold">{new Intl.NumberFormat('fr-FR').format(video.priceFcfa ?? video.estimatedPriceFcfa ?? video.price_fcfa ?? 0)} FCFA</span>{video.status === 'ready' && video.videoUrl && <a href={video.videoUrl} download className="text-xs font-semibold text-[#831810] underline underline-offset-4">Télécharger</a>}</div>
        </div>
        {video.previewUrl && <div className="border-t border-black/[.055] px-5 py-4"><video controls preload="metadata" src={video.previewUrl} className="aspect-video max-h-[420px] w-full bg-[#202124]" aria-label={`Aperçu de ${video.title ?? 'la vidéo'}`} /></div>}
        {video.status === 'ready' && <div className="border-t border-black/[.055] px-5 py-3"><p className="text-xs text-[#716d66]">Votre vidéo est prête à être visionnée et téléchargée.</p></div>}
      </article>)}
    </div>}
  </>;
}
