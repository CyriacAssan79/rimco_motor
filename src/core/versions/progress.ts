import type { VerificationEntry } from '@/core/verification/loop';
import type { ProcessingMetrics } from './processing-metrics';

/**
 * Progress of a video in plain words, shared by the Studio, the generation queue and the header indicator.
 * Five steps; « Votre décision » is inserted when a shot waits for a human. Technical steps (transfer,
 * cost settlement) belong to « Montage ». Time spent waiting for a decision is never counted.
 */
export const PROGRESS_STEPS = ['preparation', 'keyframes', 'clips', 'quality', 'editing'] as const;
export type ProgressStep = typeof PROGRESS_STEPS[number];
/** `approval`: the keyframes wait for the user's validation before the animation (27/10). */
export type ProgressPhase = ProgressStep | 'decision' | 'approval' | 'ready' | 'failed' | 'cancelled';
const isWaiting = (phase: ProgressPhase) => phase === 'decision' || phase === 'approval';

export const STEP_LABELS: Record<ProgressStep | 'decision' | 'approval', string> = {
  preparation: 'Préparation',
  keyframes: 'Images clés',
  clips: 'Vidéo des plans',
  quality: 'Contrôle qualité',
  editing: 'Montage',
  decision: 'Votre décision',
  approval: 'Votre validation',
};

export type ShotState = 'keyframe_pending' | 'keyframe_ready' | 'clip_running' | 'clip_ready' | 'checking' | 'checked' | 'decision' | 'failed';
export const SHOT_STATE_LABELS: Record<ShotState, string> = {
  keyframe_pending: 'image clé en cours',
  keyframe_ready: 'image clé prête',
  clip_running: 'vidéo en cours',
  clip_ready: 'vidéo prête',
  checking: 'contrôle en cours',
  checked: 'contrôlé',
  decision: 'à décider',
  failed: 'échec',
};

export type ProgressShotRow = {
  shot_number: number;
  title?: string | null;
  status?: string | null;
  keyframe_status?: string | null;
  video_quality_status?: string | null;
  verification_history?: unknown;
};

export type StepSeconds = Partial<Record<ProgressStep, number>>;
export type ProgressEstimate = { steps: StepSeconds; totalSeconds: number; source: 'history' | 'fallback'; samples: number };

export type GenerationProgress = {
  phase: ProgressPhase;
  /** Steps of this video, in order (no keyframes or quality step for the older single-clip flow). */
  steps: ProgressStep[];
  /** Step after which « Votre décision » (or « Votre validation ») is shown, while the video waits for a human. */
  decisionAfter: ProgressStep | null;
  /** Which human wait is shown: a shot refused by a verifier, or the keyframe board. */
  waitKind?: 'decision' | 'approval';
  requestedAt: string | null;
  stepStartedAt: string | null;
  /** Finished human waits since the launch, and since the start of the current step (seconds). */
  closedWaitSeconds: number;
  stepClosedWaitSeconds: number;
  /** Start of the human wait in progress. */
  waitingSince: string | null;
  /** Server time of this measure: the browser corrects its own clock with it. */
  serverNow: string;
  shots: Array<{ number: number; title: string; state: ShotState }>;
  /** Measured duration of the finished steps, human waits removed. */
  durations: StepSeconds;
  estimate: ProgressEstimate | null;
};

type Interval = [number, number];
const parse = (value: string | null | undefined) => {
  const ms = Date.parse(value ?? '');
  return Number.isFinite(ms) ? ms : null;
};

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((left, right) => left[0] - right[0]);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

/** Human waits of the version: from a verifier « review » to the next human decision, merged across shots. */
export function humanWaitIntervals(shots: ProgressShotRow[], now: number): Interval[] {
  const intervals: Interval[] = [];
  for (const shot of shots) {
    const history = Array.isArray(shot.verification_history) ? shot.verification_history as VerificationEntry[] : [];
    let openedAt: number | null = null;
    for (const entry of [...history].sort((left, right) => (parse(left.at) ?? 0) - (parse(right.at) ?? 0))) {
      const at = parse(entry.at);
      if (at === null) continue;
      if (entry.by === 'verifier' && entry.decision === 'review' && openedAt === null) openedAt = at;
      else if (entry.by === 'human' && openedAt !== null) {
        intervals.push([openedAt, at]);
        openedAt = null;
      }
    }
    if (openedAt !== null) intervals.push([openedAt, now]);
  }
  intervals.sort((left, right) => left[0] - right[0]);
  const merged: Interval[] = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

function overlapSeconds(intervals: Interval[], from: number, to: number) {
  return intervals.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(end, to) - Math.max(start, from)), 0) / 1000;
}

/** Start and end of each step from the stored timestamps. */
export function stepBoundaries(metrics: ProcessingMetrics, options: { hasQuality: boolean }): Record<ProgressStep, { start?: string; end?: string }> {
  const clipsStart = metrics.keyframingCompletedAt ?? metrics.providerSubmittedAt ?? metrics.generationStartedAt;
  const qualityEnd = metrics.costsSettlementStartedAt ?? metrics.postproductionStartedAt;
  return {
    preparation: { start: metrics.requestedAt, end: metrics.keyframingStartedAt ?? clipsStart },
    keyframes: { start: metrics.keyframingStartedAt, end: metrics.keyframingStartedAt ? metrics.keyframingCompletedAt : undefined },
    clips: { start: clipsStart, end: metrics.providerCompletedAt },
    quality: options.hasQuality ? { start: metrics.providerCompletedAt, end: qualityEnd } : {},
    editing: { start: options.hasQuality ? qualityEnd : metrics.providerCompletedAt, end: metrics.postproductionCompletedAt },
  };
}

/** Measured seconds of each finished step, without the human waits it contains. */
export function stepDurations(metrics: ProcessingMetrics, options: { hasQuality: boolean; waits: Interval[] }): StepSeconds {
  const durations: StepSeconds = {};
  const bounds = stepBoundaries(metrics, options);
  for (const step of PROGRESS_STEPS) {
    const start = parse(bounds[step].start);
    const end = parse(bounds[step].end);
    if (start === null || end === null || end < start) continue;
    durations[step] = Math.max(0, Math.round((end - start) / 1000 - overlapSeconds(options.waits, start, end)));
  }
  return durations;
}

export function shotState(shot: ProgressShotRow, hasQuality: boolean): ShotState {
  if (shot.keyframe_status === 'awaiting_review' || shot.video_quality_status === 'awaiting_review') return 'decision';
  if (shot.status === 'failed' || shot.keyframe_status === 'failed') return 'failed';
  if (hasQuality && shot.video_quality_status === 'passed') return 'checked';
  if (hasQuality && ['checking', 'retrying'].includes(shot.video_quality_status ?? '')) return 'checking';
  if (shot.status === 'ready' || shot.status === 'postprocessing') return 'clip_ready';
  if (shot.status === 'generating') return 'clip_running';
  if (shot.keyframe_status === 'ready') return 'keyframe_ready';
  if (shot.keyframe_status) return 'keyframe_pending';
  return shot.status === 'queued' ? 'clip_running' : 'keyframe_pending';
}

export function buildProgress(input: {
  status: string;
  metrics: ProcessingMetrics;
  hasKeyframes: boolean;
  hasQuality: boolean;
  shots: ProgressShotRow[];
  estimate: ProgressEstimate | null;
  now: number;
  /** Keyframe board (brief_json.keyframeApproval): its wait is a human wait too. */
  approval?: { required: boolean; requestedAt?: string; approvedAt?: string; expiredAt?: string };
}): GenerationProgress {
  const { metrics, hasQuality, now } = input;
  const steps = PROGRESS_STEPS.filter((step) => (step !== 'keyframes' || input.hasKeyframes || Boolean(metrics.keyframingStartedAt)) && (step !== 'quality' || hasQuality));
  const approvalStart = input.approval?.required ? parse(input.approval.requestedAt) : null;
  const approvalEnd = input.approval?.approvedAt ? parse(input.approval.approvedAt) : input.approval?.expiredAt ? parse(input.approval.expiredAt) : now;
  const waits = mergeIntervals([...humanWaitIntervals(input.shots, now), ...(approvalStart !== null && approvalEnd !== null ? [[approvalStart, approvalEnd] as Interval] : [])]);
  const awaitingKeyframe = input.shots.some((shot) => shot.keyframe_status === 'awaiting_review');
  const awaitingClip = input.shots.some((shot) => shot.video_quality_status === 'awaiting_review');
  const running = ['queued', 'generating', 'postprocessing'].includes(input.status);
  const awaitingApproval = running && approvalStart !== null && !input.approval?.approvedAt && !input.approval?.expiredAt;
  const decisionAfter: ProgressStep | null = !running ? null : awaitingKeyframe || awaitingApproval ? 'keyframes' : awaitingClip ? (hasQuality ? 'quality' : 'clips') : null;
  const waitKind = awaitingKeyframe || awaitingClip ? 'decision' as const : awaitingApproval ? 'approval' as const : undefined;
  const bounds = stepBoundaries(metrics, { hasQuality });
  let phase: ProgressPhase;
  if (input.status === 'ready') phase = 'ready';
  else if (input.status === 'failed') phase = 'failed';
  else if (input.status === 'cancelled') phase = 'cancelled';
  else if (waitKind) phase = waitKind;
  else if (input.status === 'postprocessing' || metrics.costsSettlementStartedAt || metrics.postproductionStartedAt) phase = 'editing';
  else if (metrics.providerCompletedAt) phase = hasQuality ? 'quality' : 'editing';
  else if (metrics.keyframingCompletedAt || metrics.generationStartedAt || metrics.providerSubmittedAt && !metrics.keyframingStartedAt) phase = 'clips';
  else if (metrics.keyframingStartedAt) phase = 'keyframes';
  else phase = 'preparation';
  const openWait = isWaiting(phase) ? waits.find(([, end]) => end === now) : undefined;
  const waitingSince = openWait ? new Date(openWait[0]).toISOString() : null;
  const closed = waits.filter(([, end]) => end !== now || !isWaiting(phase));
  const stepStartedAt = isWaiting(phase) ? waitingSince : PROGRESS_STEPS.includes(phase as ProgressStep) ? bounds[phase as ProgressStep].start ?? metrics.requestedAt ?? null : null;
  const stepStartMs = parse(stepStartedAt);
  return {
    phase,
    steps,
    decisionAfter,
    ...(waitKind ? { waitKind } : {}),
    requestedAt: metrics.requestedAt ?? null,
    stepStartedAt,
    closedWaitSeconds: Math.round(closed.reduce((sum, [start, end]) => sum + (end - start), 0) / 1000),
    stepClosedWaitSeconds: stepStartMs === null || isWaiting(phase) ? 0 : Math.round(overlapSeconds(closed, stepStartMs, now)),
    waitingSince,
    serverNow: new Date(now).toISOString(),
    shots: [...input.shots].sort((left, right) => left.shot_number - right.shot_number).map((shot) => ({ number: shot.shot_number, title: shot.title ?? `Plan ${shot.shot_number}`, state: shotState(shot, hasQuality) })),
    durations: stepDurations(metrics, { hasQuality, waits: closed }),
    estimate: input.estimate,
  };
}

/** Fallback for two shots (trials of 22/10/2026: Standard 10 s ≈ 6 min, Pro 10 s ≈ 5 min); Premium is a cautious guess. */
const FALLBACK_TWO_SHOTS: Record<string, Record<ProgressStep, number>> = {
  standard: { preparation: 20, keyframes: 60, clips: 120, quality: 150, editing: 30 },
  pro: { preparation: 20, keyframes: 120, clips: 100, quality: 60, editing: 30 },
  premium: { preparation: 20, keyframes: 150, clips: 180, quality: 90, editing: 40 },
};
/** Steps done once per shot, scaled to the number of shots as asked; preparation and editing stay fixed. */
const PER_SHOT_STEPS: ProgressStep[] = ['keyframes', 'clips', 'quality'];
export const MIN_HISTORY_SAMPLES = 3;

export function fallbackStepSeconds(tier: string | null | undefined, shotCount: number): Record<ProgressStep, number> {
  const base = FALLBACK_TWO_SHOTS[tier ?? ''] ?? FALLBACK_TWO_SHOTS.standard;
  const factor = Math.max(1, shotCount) / 2;
  return Object.fromEntries(PROGRESS_STEPS.map((step) => [step, Math.round(PER_SHOT_STEPS.includes(step) ? base[step] * factor : base[step])])) as Record<ProgressStep, number>;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Expected seconds per step: median of the last ready videos (at least 3), otherwise the fixed fallback. */
export function estimateSteps(input: { samples: StepSeconds[]; tier: string | null | undefined; shotCount: number; steps: ProgressStep[] }): ProgressEstimate {
  const fallback = fallbackStepSeconds(input.tier, input.shotCount);
  const useHistory = input.samples.length >= MIN_HISTORY_SAMPLES;
  const steps: StepSeconds = {};
  for (const step of input.steps) {
    const measured = input.samples.map((sample) => sample[step]).filter((value): value is number => typeof value === 'number');
    steps[step] = useHistory && measured.length >= MIN_HISTORY_SAMPLES ? median(measured) : fallback[step];
  }
  const totalSeconds = input.steps.reduce((sum, step) => sum + (steps[step] ?? 0), 0);
  return { steps, totalSeconds, source: useHistory ? 'history' : 'fallback', samples: input.samples.length };
}

/** Beyond the estimate + 50 %, no end time is shown any more: « Plus long que d’habitude ». */
export const LATE_FACTOR = 1.5;

export type ProgressView = {
  phase: ProgressPhase;
  /** Label of the current step (« Votre décision » while waiting). */
  stepLabel: string;
  items: Array<{ id: ProgressStep | 'decision' | 'approval'; label: string; state: 'done' | 'current' | 'todo' }>;
  /** Active time since the launch (human waits excluded), current step time, current wait. */
  totalSeconds: number | null;
  stepSeconds: number | null;
  waitingSeconds: number | null;
  eta: { kind: 'at'; endAt: number; minutes: number } | { kind: 'after_decision'; minutes: number } | { kind: 'after_approval'; minutes: number } | { kind: 'late' } | null;
  shots: Array<{ number: number; title: string; label: string; state: ShotState }>;
};

/**
 * What to show at `clientNow`. The server times are corrected by the gap between the server clock (`serverNow`)
 * and the moment the browser received them (`observedAt`), so a wrong computer clock does not shift the counters.
 */
export function describeProgress(progress: GenerationProgress, clientNow: number, observedAt?: number): ProgressView {
  const serverNow = (parse(progress.serverNow) ?? clientNow) + Math.max(0, clientNow - (observedAt ?? clientNow));
  const waitingSeconds = progress.waitingSince ? Math.max(0, Math.floor((serverNow - (parse(progress.waitingSince) ?? serverNow)) / 1000)) : null;
  const requested = parse(progress.requestedAt);
  const totalSeconds = requested === null ? null : Math.max(0, Math.floor((serverNow - requested) / 1000) - progress.closedWaitSeconds - (waitingSeconds ?? 0));
  const stepStart = parse(progress.stepStartedAt);
  const stepSeconds = isWaiting(progress.phase) ? waitingSeconds : stepStart === null ? null : Math.max(0, Math.floor((serverNow - stepStart) / 1000) - progress.stepClosedWaitSeconds);

  const waitItem = progress.waitKind ?? 'decision';
  const order: Array<ProgressStep | 'decision' | 'approval'> = [];
  for (const step of progress.steps) {
    order.push(step);
    if (progress.decisionAfter === step) order.push(waitItem);
  }
  const terminal = progress.phase === 'ready' || progress.phase === 'failed' || progress.phase === 'cancelled';
  const currentIndex = progress.phase === 'ready' ? order.length : order.indexOf(progress.phase as ProgressStep | 'decision' | 'approval');
  const items = order.map((id, index) => ({ id, label: STEP_LABELS[id], state: (index < currentIndex ? 'done' : index === currentIndex && !terminal ? 'current' : 'todo') as 'done' | 'current' | 'todo' }));

  let eta: ProgressView['eta'] = null;
  const estimate = progress.estimate;
  if (estimate && !terminal && totalSeconds !== null && estimate.totalSeconds > 0) {
    if (totalSeconds > estimate.totalSeconds * LATE_FACTOR) eta = { kind: 'late' };
    else {
      let remaining: number;
      if (isWaiting(progress.phase)) remaining = estimate.totalSeconds - totalSeconds;
      else {
        const position = progress.steps.indexOf(progress.phase as ProgressStep);
        const current = estimate.steps[progress.phase as ProgressStep] ?? 0;
        const later = progress.steps.slice(position + 1).reduce((sum, step) => sum + (estimate.steps[step] ?? 0), 0);
        remaining = later + Math.max(0, current - (stepSeconds ?? 0));
      }
      // Never a false precision: whole minutes, at least one.
      const minutes = Math.max(1, Math.ceil(remaining / 60));
      eta = isWaiting(progress.phase) ? { kind: progress.phase === 'approval' ? 'after_approval' : 'after_decision', minutes } : { kind: 'at', endAt: clientNow + minutes * 60_000, minutes };
    }
  }
  return {
    phase: progress.phase,
    stepLabel: progress.phase === 'decision' || progress.phase === 'approval' ? STEP_LABELS[progress.phase] : PROGRESS_STEPS.includes(progress.phase as ProgressStep) ? STEP_LABELS[progress.phase as ProgressStep] : progress.phase === 'ready' ? 'Prête' : progress.phase === 'failed' ? 'Échec' : 'Annulée',
    items,
    totalSeconds,
    stepSeconds,
    waitingSeconds,
    eta,
    shots: progress.shots.map((shot) => ({ ...shot, label: SHOT_STATE_LABELS[shot.state] })),
  };
}

const LEGACY_PHASES: Record<string, ProgressPhase> = { keyframe_approval: 'approval', queued: 'preparation', keyframing: 'keyframes', generating: 'clips', quality_checking: 'quality', awaiting_review: 'decision', transferring: 'editing', postprocessing: 'editing', ready: 'ready', failed: 'failed', cancelled: 'cancelled' };

/** When the server sent no `progress` (simulation without Supabase, older response): steps without estimate. */
export function legacyProgress(version: { status: string; versionStatus?: string | null; processingStage?: string | null; createdAt?: string; reviewRequired?: unknown[] }, now: number): GenerationProgress {
  const status = version.versionStatus ?? version.status;
  const phase = Array.isArray(version.reviewRequired) && version.reviewRequired.length ? 'decision' : LEGACY_PHASES[status === 'ready' || status === 'failed' || status === 'cancelled' ? status : version.processingStage ?? status] ?? 'preparation';
  return {
    phase, steps: ['preparation', 'keyframes', 'clips', 'quality', 'editing'], decisionAfter: isWaiting(phase) ? 'keyframes' : null, ...(phase === 'approval' ? { waitKind: 'approval' as const } : {}),
    requestedAt: version.createdAt ?? null, stepStartedAt: null, closedWaitSeconds: 0, stepClosedWaitSeconds: 0, waitingSince: null,
    serverNow: new Date(now).toISOString(), shots: [], durations: {}, estimate: null,
  };
}

/** « 4 min 12 s », « 1 h 05 min ». */
export function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  return minutes ? `${minutes} min ${value % 60} s` : `${value} s`;
}

/** « 14 h 32 », in the time zone of the browser. */
export function formatClockTime(ms: number, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, ...(timeZone ? { timeZone } : {}) }).formatToParts(new Date(ms));
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${Number(hour)} h ${minute}`;
}

export function etaText(eta: ProgressView['eta'], timeZone?: string) {
  if (!eta) return null;
  if (eta.kind === 'late') return 'Plus long que d’habitude';
  if (eta.kind === 'after_decision') return `Fin estimée ≈ ${eta.minutes} min après votre décision`;
  if (eta.kind === 'after_approval') return `Fin estimée ≈ ${eta.minutes} min après votre validation`;
  return `Fin estimée vers ${formatClockTime(eta.endAt, timeZone)} (≈ ${eta.minutes} min)`;
}

/** Text of the header indicator: same step label and same counter as the Studio and the queue. */
export function indicatorText(count: number, view: ProgressView) {
  const head = `${count} vidéo${count > 1 ? 's' : ''} en cours`;
  if (isWaiting(view.phase)) return [head, view.stepLabel, view.waitingSeconds != null ? `depuis ${formatDuration(view.waitingSeconds)}` : null].filter(Boolean).join(' · ');
  return [head, view.stepLabel, view.totalSeconds != null ? formatDuration(view.totalSeconds) : null].filter(Boolean).join(' · ');
}

/** « Durées : Préparation 20 s · Images clés 1 min 2 s · … » for a finished video. */
export function formatStepDurations(durations: StepSeconds) {
  return PROGRESS_STEPS.filter((step) => typeof durations[step] === 'number').map((step) => `${STEP_LABELS[step]} ${formatDuration(durations[step]!)}`).join(' · ');
}

export type ProgressSource = {
  status: string;
  versionStatus?: string | null;
  processingStage?: string | null;
  createdAt?: string;
  reviewRequired?: unknown[];
  progress?: GenerationProgress | null;
  /** Time (ms, browser clock) the data was received. */
  observedAt?: number;
};

/** Single entry point of the three places (Studio, queue, header): same steps, same labels, same counters. */
export function progressView(version: ProgressSource, clientNow: number): ProgressView {
  const progress = version.progress ?? legacyProgress(version, version.observedAt ?? clientNow);
  return describeProgress(progress, clientNow, version.observedAt);
}

/** The Studio prepares the storyboard before the video exists: « Préparation » counted from the click. */
export function preparationProgress(startedAt: number): GenerationProgress {
  return {
    phase: 'preparation', steps: ['preparation', 'keyframes', 'clips', 'quality', 'editing'], decisionAfter: null,
    requestedAt: new Date(startedAt).toISOString(), stepStartedAt: new Date(startedAt).toISOString(), closedWaitSeconds: 0, stepClosedWaitSeconds: 0,
    waitingSince: null, serverNow: new Date(startedAt).toISOString(), shots: [], durations: {}, estimate: null,
  };
}
