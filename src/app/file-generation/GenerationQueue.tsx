'use client';

import { useEffect, useRef, useState } from 'react';
import type { TrackedVersion } from '@/core/versions/generation-tracker';
import { ShotReviewPanel } from '@/components/shot-review-panel';
import { GenerationProgress } from '@/components/generation-progress';
import { KEEP_TAB_OPEN_MESSAGE, useGenerationTracker, useNow } from '@/components/generation-tracker';

type Item = TrackedVersion & { durationSeconds?: number };
/** Reads the application-wide follow-up (AppShell): this page never calls /refresh itself. */
export function GenerationQueue() {
  const tracker = useGenerationTracker();
  const [actionError, setActionError] = useState('');
  const items: Item[] = tracker.snapshot.versions.filter((item) => ['generating', 'queued'].includes(item.status) || ['queued', 'generating', 'postprocessing', 'failed'].includes(item.versionStatus ?? ''));
  const running = items.some((item) => item.versionStatus !== 'failed' && item.status !== 'failed');
  const now = useNow(running);
  const refreshFailed = tracker.snapshot.versions.some((item) => item.refreshFailed);
  // « Voir le plan » (banner, bell, browser notification): scroll to the decision panel once it is rendered.
  const decisionHash = useRef<string | null>(null);
  const hasDecisionPanel = tracker.snapshot.versions.some((version) => version.reviewRequired?.length);
  useEffect(() => {
    if (decisionHash.current === null) decisionHash.current = window.location.hash.startsWith('#decision-') ? window.location.hash.slice(1) : '';
    if (!decisionHash.current) return;
    const panel = document.getElementById(decisionHash.current);
    if (!panel) return;
    panel.scrollIntoView({ block: 'start' });
    panel.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    decisionHash.current = '';
  }, [hasDecisionPanel]);
  const error = actionError || tracker.snapshot.listError || (refreshFailed ? 'Certaines mises à jour n’ont pas abouti. Les autres tâches restent suivies automatiquement.' : '');
  async function cancel(item: Item) {
    const response = await fetch(`/api/versions/${item.id}/cancel`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) { setActionError(data.error ?? 'La génération ne peut pas être annulée.'); return; }
    setActionError('');
    await tracker.reload();
  }
  async function retryTracking(item: Item) {
    setActionError('');
    const response = await fetch(`/api/versions/${item.id}/refresh`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) { setActionError(data.error ?? 'Le suivi ne peut pas reprendre.'); return; }
    await tracker.reload();
  }
  return <section className="space-y-4">{error && <p role="alert" className="border border-[#f0c9c6] bg-[#fae9e7] p-4 text-sm text-[#9d352e]">{error}</p>}{running && <p role="status" className="border border-[#e7d7b9] bg-[#fbf6ed] p-4 text-sm leading-6 text-[#765d39]">{KEEP_TAB_OPEN_MESSAGE}</p>}{!tracker.snapshot.loaded ? <div aria-label="Chargement de la file" className="h-40 animate-pulse bg-[#e9e7e2]" /> : items.length === 0 ? <div className="border border-dashed border-[#d2d2d6] bg-white px-6 py-16 text-center"><h2 className="text-sm font-semibold">La file est vide</h2><p className="mt-2 text-xs text-[#626269]">Les nouvelles générations apparaîtront ici.</p></div> : items.map((item) => { const failed = item.versionStatus === 'failed'; const itemReviews = tracker.snapshot.versions.find((version) => version.id === item.id)?.reviewRequired ?? []; return <article key={item.id} className="border border-[#e2e2e5] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{item.title ?? 'Vidéo sans titre'}</h2><p className="mt-1 text-xs text-[#626269]">{item.durationSeconds ?? 5} s · {item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-FR') : 'Aujourd’hui'}</p>{failed ? <p className="mt-1 text-xs font-semibold text-[#9d352e]">Échec de génération</p> : item.reconciliationRequired ? <p className="mt-1 text-xs font-semibold text-[#9d352e]">Vérification du coût requise</p> : null}{(item.errorMessage || item.pollError || item.reconciliationRequired) && <p role="status" className="mt-3 max-w-2xl text-xs text-[#9d352e]">{item.errorMessage ?? item.pollError}{item.reconciliationRequired ? ' Coût à réconcilier avant toute nouvelle soumission.' : ''}</p>}</div><div className="flex gap-2">{item.canRetryTracking && <button type="button" onClick={() => void retryTracking(item)} className="min-h-10 rounded-full bg-[#c51e1c] px-4 text-xs font-semibold text-white">Réessayer le suivi</button>}{!failed && <button type="button" onClick={() => void cancel(item)} className="min-h-10 rounded-full border border-[#e2e2e5] px-4 text-xs font-semibold">Annuler</button>}</div></div>{!failed && !item.reconciliationRequired && <GenerationProgress version={item} now={now} />}{!failed && <ShotReviewPanel versionId={item.id} items={itemReviews} onChanged={() => tracker.resolveReview(item.id)} />}</article>; })}</section>;
}
