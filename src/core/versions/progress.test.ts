import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenerationProgress } from '@/components/generation-progress';
import {
  buildProgress, describeProgress, estimateSteps, etaText, fallbackStepSeconds, formatDuration, humanWaitIntervals, indicatorText,
  legacyProgress, progressView, STEP_LABELS, stepDurations, type ProgressShotRow,
} from './progress';

const T0 = Date.parse('2026-10-26T14:00:00Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const ALL_STEPS = ['preparation', 'keyframes', 'clips', 'quality', 'editing'] as const;

/** A Standard video with two shots, finished: 20 s preparation, 60 s keyframes, 120 s clips, 150 s checks, 30 s editing. */
const finishedMetrics = {
  requestedAt: at(0), keyframingStartedAt: at(20), keyframingCompletedAt: at(80), providerSubmittedAt: at(80), generationStartedAt: at(85),
  providerCompletedAt: at(200), costsSettlementStartedAt: at(350), postproductionStartedAt: at(352), postproductionCompletedAt: at(380),
};

describe('estimate of the end of a video', () => {
  it('uses the median of the last ready videos when there are at least three', () => {
    const samples = [
      stepDurations(finishedMetrics, { hasQuality: true, waits: [] }),
      { preparation: 30, keyframes: 90, clips: 100, quality: 100, editing: 40 },
      { preparation: 10, keyframes: 70, clips: 140, quality: 120, editing: 20 },
    ];
    expect(samples[0]).toEqual({ preparation: 20, keyframes: 60, clips: 120, quality: 150, editing: 30 });
    const estimate = estimateSteps({ samples, tier: 'standard', shotCount: 2, steps: [...ALL_STEPS] });
    expect(estimate).toMatchObject({ source: 'history', samples: 3, steps: { preparation: 20, keyframes: 70, clips: 120, quality: 120, editing: 30 } });
    expect(estimate.totalSeconds).toBe(360);
  });

  it('falls back to the trials of 22/10, scaled to the number of shots, with fewer than three videos', () => {
    const twoShots = estimateSteps({ samples: [{ clips: 999 }, { clips: 999 }], tier: 'standard', shotCount: 2, steps: [...ALL_STEPS] });
    expect(twoShots).toMatchObject({ source: 'fallback', totalSeconds: 380 }); // ≈ 6 min, as measured
    expect(estimateSteps({ samples: [], tier: 'pro', shotCount: 2, steps: [...ALL_STEPS] }).totalSeconds).toBe(330); // ≈ 5 min
    const fourShots = fallbackStepSeconds('standard', 4);
    expect(fourShots).toMatchObject({ preparation: 20, keyframes: 120, clips: 240, quality: 300, editing: 30 });
  });

  it('shows « Fin estimée vers 14 h 32 (≈ 3 min) » from the remaining steps, in whole minutes', () => {
    const progress = buildProgress({
      status: 'generating', metrics: { requestedAt: at(0), keyframingStartedAt: at(20), keyframingCompletedAt: at(80), providerSubmittedAt: at(80) },
      hasKeyframes: true, hasQuality: true, shots: [], now: T0 + 100_000,
      estimate: estimateSteps({ samples: [], tier: 'standard', shotCount: 2, steps: [...ALL_STEPS] }),
    });
    const view = describeProgress(progress, T0 + 100_000, T0 + 100_000);
    expect(view.stepLabel).toBe('Vidéo des plans');
    expect(view.totalSeconds).toBe(100);
    expect(view.stepSeconds).toBe(20);
    // 120 − 20 s of clips + 150 s of checks + 30 s of editing = 280 s → 5 min.
    expect(view.eta).toMatchObject({ kind: 'at', minutes: 5 });
    expect(etaText(view.eta, 'Africa/Abidjan')).toBe('Fin estimée vers 14 h 06 (≈ 5 min)');
  });

  it('says « Plus long que d’habitude » beyond the estimate + 50 %, never a false precision', () => {
    const progress = buildProgress({
      status: 'generating', metrics: { requestedAt: at(0), keyframingStartedAt: at(20) }, hasKeyframes: true, hasQuality: true, shots: [], now: T0 + 600_000,
      estimate: estimateSteps({ samples: [], tier: 'pro', shotCount: 2, steps: [...ALL_STEPS] }),
    });
    const view = describeProgress(progress, T0 + 600_000, T0 + 600_000);
    expect(view.eta).toEqual({ kind: 'late' });
    expect(etaText(view.eta)).toBe('Plus long que d’habitude');
  });
});

describe('a shot waiting for a human decision', () => {
  // Keyframe of shot 1 refused at 60 s; shot 2 accepted. The user has not decided yet.
  const shots: ProgressShotRow[] = [
    { shot_number: 1, title: 'Arrivée', keyframe_status: 'awaiting_review', verification_history: [{ stage: 'keyframe', attempt: 0, at: at(60), approved: false, issues: [], reason: '', decision: 'review', by: 'verifier' }] },
    { shot_number: 2, title: 'Héros', keyframe_status: 'ready' },
  ];
  const metrics = { requestedAt: at(0), keyframingStartedAt: at(20) };
  const estimate = estimateSteps({ samples: [], tier: 'standard', shotCount: 2, steps: [...ALL_STEPS] });

  it('inserts « Votre décision », stops the counter and does not count the wait in the estimate', () => {
    const progress = buildProgress({ status: 'generating', metrics, hasKeyframes: true, hasQuality: true, shots, estimate, now: T0 + 300_000 });
    expect(progress.phase).toBe('decision');
    expect(progress.waitingSince).toBe(at(60));
    const view = describeProgress(progress, T0 + 300_000, T0 + 300_000);
    expect(view.items.map((item) => item.label)).toEqual(['Préparation', 'Images clés', 'Votre décision', 'Vidéo des plans', 'Contrôle qualité', 'Montage']);
    expect(view.items.find((item) => item.state === 'current')?.label).toBe('Votre décision');
    expect(view.totalSeconds).toBe(60); // frozen at the moment the shot was stopped
    expect(view.waitingSeconds).toBe(240);
    // Two minutes later in the browser: the wait grows, the counter does not.
    const later = describeProgress(progress, T0 + 420_000, T0 + 300_000);
    expect(later.totalSeconds).toBe(60);
    expect(later.waitingSeconds).toBe(360);
    expect(later.eta).toEqual({ kind: 'after_decision', minutes: 6 }); // 380 − 60 s = 320 s → 6 min
    expect(etaText(later.eta)).toBe('Fin estimée ≈ 6 min après votre décision');
    expect(view.shots.map((shot) => shot.label)).toEqual(['à décider', 'image clé prête']);
  });

  it('removes the decision time once the user has decided', () => {
    const decided: ProgressShotRow[] = [{ ...shots[0], keyframe_status: 'ready', verification_history: [
      ...(shots[0].verification_history as unknown[]),
      { stage: 'keyframe', attempt: 0, at: at(160), approved: false, issues: [], reason: '', decision: 'human_accept', by: 'human' },
    ] }, shots[1]];
    expect(humanWaitIntervals(decided, T0 + 300_000)).toEqual([[T0 + 60_000, T0 + 160_000]]);
    const progress = buildProgress({ status: 'generating', metrics: { ...metrics, keyframingCompletedAt: at(170), providerSubmittedAt: at(170) }, hasKeyframes: true, hasQuality: true, shots: decided, estimate, now: T0 + 200_000 });
    const view = describeProgress(progress, T0 + 200_000, T0 + 200_000);
    expect(view.phase).toBe('clips');
    expect(view.totalSeconds).toBe(100); // 200 s since the launch − 100 s of decision
    expect(progress.durations.keyframes).toBe(50); // 150 s of step − 100 s of decision
  });
});

describe('same labels in the Studio, the generation queue and the header', () => {
  it('renders the step of the shared view everywhere', () => {
    const version = {
      status: 'generating', versionStatus: 'generating', observedAt: T0 + 190_000,
      progress: buildProgress({ status: 'generating', metrics: { requestedAt: at(0), keyframingStartedAt: at(20) }, hasKeyframes: true, hasQuality: true, shots: [{ shot_number: 1, title: 'Arrivée', keyframe_status: 'ready' }], estimate: null, now: T0 + 190_000 }),
    };
    const view = progressView(version, T0 + 192_000);
    expect(view.stepLabel).toBe(STEP_LABELS.keyframes);
    // Studio and queue: the GenerationProgress component.
    const markup = renderToStaticMarkup(createElement(GenerationProgress, { version, now: T0 + 192_000 }));
    expect(markup).toContain('Images clés');
    expect(markup).toContain(`Lancée il y a ${formatDuration(192)}`);
    expect(markup).toContain('image clé prête');
    // Header indicator.
    expect(indicatorText(1, view)).toBe('1 vidéo en cours · Images clés · 3 min 12 s');
  });

  it('maps the old stages, quality checks and decisions included, when the server sends no progress', () => {
    expect(legacyProgress({ status: 'generating', processingStage: 'quality_checking' }, T0).phase).toBe('quality');
    expect(legacyProgress({ status: 'generating', processingStage: 'transferring' }, T0).phase).toBe('editing');
    expect(legacyProgress({ status: 'generating', processingStage: 'keyframing', reviewRequired: [{}] }, T0).phase).toBe('decision');
  });
});
