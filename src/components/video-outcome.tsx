'use client';

import Link from 'next/link';
import { useState } from 'react';
import { generationTierLabel } from '@/core/versions/generation-tier';
import { failureBillingText, failureExplanation, type BillingSummary, type StudioSettings } from '@/core/versions/outcome';
import { useVideoValidation } from './shell';

type Outcome = {
  id: string;
  videoId?: string;
  status: string;
  versionStatus?: string | null;
  videoUrl?: string | null;
  durationSeconds?: number;
  tier?: string | null;
  format?: string;
  validationStatus?: string | null;
  qualityWarnings?: unknown[];
  settings?: StudioSettings | null;
  billing?: BillingSummary | null;
  error?: string;
  errorMessage?: string | null;
};

/** Direct link to the video in the library: opened and highlighted there. */
export const libraryVideoHref = (outcome: Pick<Outcome, 'id' | 'videoId'>) => `/bibliotheque?video=${encodeURIComponent(outcome.videoId ?? outcome.id)}`;

export const DOWNLOAD_AFTER_APPROVAL = 'Le téléchargement est possible après l’approbation de la vidéo.';
/** 29/10 · O03 : sans validation (défaut), la vidéo prête se télécharge tout de suite depuis la Bibliothèque. */
export const DOWNLOAD_NOW = 'Vous pouvez la télécharger tout de suite depuis la Bibliothèque.';

const aspect = (format?: string) => format === '9:16' ? 'aspect-[9/16] max-h-[520px] mx-auto' : format === '1:1' ? 'aspect-square max-h-[480px] mx-auto' : 'aspect-video';

/** Ready video: player, what it is, and what to do next. */
export function ReadyOutcome({ outcome, onVariant, onSeen, onSubmitted }: { outcome: Outcome; onVariant?: () => void; onSeen: () => void; onSubmitted: () => void }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const validationEnabled = useVideoValidation();
  const validation = state === 'sent' || outcome.status === 'review' ? 'pending' : outcome.validationStatus ?? null;
  const duration = outcome.durationSeconds ?? (outcome.settings ? outcome.settings.durationS + 2 : null);
  const tier = outcome.tier ?? outcome.settings?.tier ?? null;
  const warnings = outcome.qualityWarnings?.length ?? 0;

  async function submit() {
    setState('sending');
    setError('');
    try {
      const response = await fetch('/api/validations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId: outcome.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'La vidéo n’a pas pu être envoyée en validation.');
      setState('sent');
      onSubmitted();
    } catch (cause) {
      setState('idle');
      setError(cause instanceof Error ? cause.message : 'La vidéo n’a pas pu être envoyée en validation.');
    }
  }

  return <div className="mt-4 space-y-3 border-t border-[#eeeae4] pt-4">
    <p className="text-sm font-semibold text-[#242428]">Votre vidéo est prête.</p>
    {outcome.videoUrl
      ? <video src={outcome.videoUrl} controls playsInline preload="metadata" aria-label="Vidéo finale" className={`${aspect(outcome.format)} w-full rounded bg-black object-contain`} />
      : <div className="grid aspect-video w-full place-items-center rounded bg-[#f3f1ee] text-xs text-[#6b6760]">Chargement de la vidéo…</div>}
    <p className="text-xs text-[#55545a]">
      {[duration ? `Durée ${duration} s` : null, tier ? `Niveau ${generationTierLabel(tier)}` : null, outcome.format ? `Format ${outcome.format}` : null].filter(Boolean).join(' · ')}
      {warnings ? ` · ${warnings} point${warnings > 1 ? 's' : ''} signalé${warnings > 1 ? 's' : ''} par le contrôle automatique, à vérifier avant de l’utiliser` : ''}
    </p>
    <div className="flex flex-wrap gap-2">
      {validation === 'approved'
        ? <p className="w-full text-xs font-semibold text-[#315c39]">Approuvée : vous pouvez la télécharger depuis la Bibliothèque.</p>
        : validation === 'rejected'
          ? <p className="w-full text-xs font-semibold text-[#9d352e]">Refusée : le motif est dans la Bibliothèque. Créez une variante pour corriger.</p>
          : validation === 'pending'
            ? <p role="status" className="w-full text-xs font-semibold text-[#55545a]">Envoyée en validation : en attente de la décision. Vous serez notifié.</p>
            : !validationEnabled ? null
            : <button type="button" onClick={() => void submit()} disabled={state === 'sending'} className="min-h-11 rounded-md bg-[#c51e1c] px-4 text-xs font-semibold text-white disabled:opacity-50">{state === 'sending' ? 'Envoi…' : 'Envoyer en validation'}</button>}
      {onVariant && <button type="button" onClick={onVariant} className="min-h-11 rounded-md border border-[#d2cec6] bg-white px-4 text-xs font-semibold text-[#242428]">Créer une variante</button>}
      <Link href={libraryVideoHref(outcome)} onClick={onSeen} className="inline-flex min-h-11 items-center rounded-md border border-[#d2cec6] bg-white px-4 text-xs font-semibold text-[#242428]">Ouvrir dans la Bibliothèque</Link>
    </div>
    {error && <p role="alert" className="text-xs text-[#9d352e]">{error}</p>}
    {!validationEnabled ? <p className="text-xs text-[#55545a]">{DOWNLOAD_NOW}</p> : validation !== 'approved' && <p className="text-xs text-[#55545a]">{DOWNLOAD_AFTER_APPROVAL}</p>}
  </div>;
}

/** Failed video: the cause in French, what was billed, and how to start again. */
export function FailedOutcome({ outcome, onRelaunch, onVariant, onRetryMontage }: { outcome: Outcome; onRelaunch?: () => void; onVariant?: () => void; onRetryMontage?: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const failure = failureExplanation(outcome.error ?? outcome.errorMessage);
  const montageFailure = /^Montage impossible\s*:/i.test(outcome.error ?? outcome.errorMessage ?? '');
  async function retryMontage() {
    if (!onRetryMontage || retrying) return;
    setRetrying(true); setRetryError('');
    try { await onRetryMontage(); }
    catch (cause) { setRetryError(cause instanceof Error ? cause.message : 'Le montage n’a pas pu être relancé.'); }
    finally { setRetrying(false); }
  }
  return <div role="alert" className="mt-4 space-y-2 rounded-md border border-[#f0c9c6] bg-[#fdf4f3] p-4 text-xs leading-5 text-[#55545a]">
    <p className="text-sm font-semibold text-[#9d352e]">La vidéo n’a pas pu être produite.</p>
    <p className="text-[#242428]">{failure.cause}</p>
    <p>{failure.advice}</p>
    <p className="font-semibold text-[#242428]">{failureBillingText(outcome.billing)}</p>
    {failure.detail && <details><summary className="cursor-pointer font-semibold">Détail technique</summary><p className="mt-1 break-words">{failure.detail}</p></details>}
    {(onRelaunch || onVariant || onRetryMontage) && <div className="flex flex-wrap gap-2 pt-1">
      {montageFailure && onRetryMontage && <button type="button" onClick={() => void retryMontage()} disabled={retrying} className="min-h-11 rounded-md bg-[#c51e1c] px-4 text-xs font-semibold text-white disabled:opacity-50">{retrying ? 'Montage en cours…' : 'Relancer uniquement le montage'}</button>}
      {!montageFailure && onRelaunch && <button type="button" onClick={onRelaunch} className="min-h-11 rounded-md bg-[#c51e1c] px-4 text-xs font-semibold text-white">Relancer avec les mêmes réglages</button>}
      {onVariant && <button type="button" onClick={onVariant} className="min-h-11 rounded-md border border-[#d2cec6] bg-white px-4 text-xs font-semibold text-[#242428]">Modifier les réglages</button>}
    </div>}
    {retryError && <p role="status" className="text-[#9d352e]">{retryError}</p>}
  </div>;
}
