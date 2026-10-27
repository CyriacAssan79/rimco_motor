'use client';

import { etaText, formatDuration, progressView, type ProgressSource } from '@/core/versions/progress';

/**
 * Shared progress of a video (Studio, generation queue): plain-language steps, time since the launch,
 * time in the current step, estimated end and the state of each shot. `now` comes from `useNow`.
 */
export function GenerationProgress({ version, now, showShots = true }: { version: ProgressSource; now: number; showShots?: boolean }) {
  const view = progressView(version, now);
  if (view.phase === 'failed' || view.phase === 'cancelled') return null;
  const eta = etaText(view.eta);
  const waitingFor = view.phase === 'approval' ? 'votre validation' : 'votre décision';
  const timing = view.phase === 'decision' || view.phase === 'approval'
    ? [view.waitingSeconds != null ? `En attente de ${waitingFor} depuis ${formatDuration(view.waitingSeconds)}` : `En attente de ${waitingFor}`, view.totalSeconds != null ? `chrono arrêté à ${formatDuration(view.totalSeconds)}` : null]
    : view.phase === 'ready'
      ? []
      : [view.totalSeconds != null ? `Lancée il y a ${formatDuration(view.totalSeconds)}` : null, view.stepSeconds != null ? `${view.stepLabel} depuis ${formatDuration(view.stepSeconds)}` : null];
  const timingText = timing.filter(Boolean).join(' · ');
  return <div className="mt-3 space-y-2.5" data-progress-step={view.stepLabel}>
    <ol aria-label="Étapes de la vidéo" className="flex flex-wrap gap-x-4 gap-y-2">
      {view.items.map((item) => <li key={item.id} aria-current={item.state === 'current' ? 'step' : undefined} className="flex items-center gap-1.5 text-xs">
        <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full border-2 text-[11px] text-white ${item.state === 'done' ? 'border-[#c51e1c] bg-[#c51e1c]' : item.state === 'current' ? item.id === 'decision' || item.id === 'approval' ? 'border-[#831810] bg-[#fdf4f3]' : 'border-[#c51e1c] bg-white' : 'border-[#dfe1e4] bg-white'}`}>{item.state === 'done' ? '✓' : ''}</span>
        <span className={item.state === 'todo' ? 'text-[#6b6760]' : item.id === 'decision' || item.id === 'approval' ? 'font-semibold text-[#831810]' : 'font-semibold text-[#242428]'}>{item.label}{item.state === 'done' ? <span className="sr-only"> (terminée)</span> : item.state === 'current' ? <span className="sr-only"> (en cours)</span> : null}</span>
      </li>)}
    </ol>
    {timingText && <p className="text-xs leading-5 text-[#55545a] tabular-nums">{timingText}</p>}
    {eta && <p className={`text-xs font-semibold leading-5 tabular-nums ${view.eta?.kind === 'late' ? 'text-[#9d352e]' : 'text-[#242428]'}`}>{eta}</p>}
    {showShots && view.shots.length > 0 && <ul aria-label="Progression par plan" className="grid gap-1.5 sm:grid-cols-2">
      {view.shots.map((shot) => <li key={shot.number} className="flex items-center justify-between gap-3 rounded border border-[#eeeae4] px-2.5 py-2 text-xs text-[#55545a]">
        <span className="truncate">Plan {shot.number} · {shot.title}</span>
        <span className={`shrink-0 font-semibold ${shot.state === 'decision' ? 'text-[#831810]' : shot.state === 'failed' ? 'text-[#9d352e]' : 'text-[#242428]'}`}>{shot.label}</span>
      </li>)}
    </ul>}
  </div>;
}
