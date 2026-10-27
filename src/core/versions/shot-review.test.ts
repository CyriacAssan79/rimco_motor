import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  shot: {} as Record<string, unknown>,
  brief: {} as Record<string, unknown>,
  ledger: [] as Array<{ cost_usd: number; status: string }>,
  updates: [] as Array<Record<string, unknown>>,
  calls: [] as string[],
  cap: undefined as number | undefined,
  reserveFails: false,
}));

vi.mock('@/env', () => ({ env: { get VIDEO_COST_CAP_USD() { return state.cap; }, VIDEO_COST_CAP_MODE: 'nominal', USD_TO_EUR_RATE: 0.92, EUR_TO_FCFA: 655.957 } }));
vi.mock('@/core/billing/ledger', () => ({
  reserveKeyframeCost: vi.fn(async () => { state.calls.push('reserve'); return state.reserveFails ? { data: null, error: new Error('x') } : { data: `ledger-${state.calls.length}`, error: null }; }),
  settleUsageCost: vi.fn(async () => { state.calls.push('release'); return { error: null }; }),
}));
vi.mock('@/core/storage/supabase', () => ({
  createStorageAdminClient: () => ({
    from(table: string) {
      let operation = 'select';
      let patch: Record<string, unknown> = {};
      const query = {
        select: () => query, eq: () => query, in: () => query,
        update: (values: Record<string, unknown>) => { operation = 'update'; patch = values; return query; },
        maybeSingle: async () => {
          if (table === 'video_versions') return { data: { id: 'v1', status: 'generating', brief_json: state.brief, video: { user_id: 'u1', department: 'Marketing' } }, error: null };
          if (table === 'video_shots' && operation === 'update') { state.calls.push('update'); state.updates.push(patch); return { data: { shot_number: 2 }, error: null }; }
          return { data: state.shot, error: null };
        },
        then: (resolve: (value: unknown) => void) => resolve({ data: table === 'usage_ledger' ? state.ledger : [], error: null }),
      };
      return query;
    },
  }),
}));

import { reviewShot, shotReviewSchema, simulateShotReview } from './shot-review';
import { buildKeyframePrompt } from '@/core/providers/fal-keyframes';
import { buildShotRevisionPrompt, defectsAsData, pendingHumanFeedback } from '@/core/verification/loop';
import type { Actor } from '@/core/auth/guards';

const actor: Actor = { id: 'u1', role: 'collaborateur', department: 'Marketing', brandId: 'b1' };
const refusedKeyframe = (history: unknown[] = []) => ({
  shot_number: 2, keyframe_status: 'awaiting_review', keyframe_retry_count: 2, keyframe_quality: { approved: false, issues: ['blocking: car cut by the frame'], reason: 'cut' },
  keyframe_image_ledger_ids: ['i0', 'i1', 'i2'], keyframe_quality_ledger_ids: ['q0', 'q1', 'q2'], verification_history: history,
});
const humanRevise = { stage: 'keyframe', attempt: 1, at: '2026-10-27T08:00:00Z', approved: false, issues: [], reason: '', decision: 'human_revise', by: 'human' };

beforeEach(() => {
  state.updates = []; state.calls = []; state.ledger = [{ cost_usd: 2, status: 'charged' }]; state.cap = undefined; state.reserveFails = false;
  state.brief = { storyboard: [{}, { locationPhotoId: 'place-day' }], motionMatrix: { places: { 'place-day': { timeOfDay: 'day', view: 'road', roadAxes: ['along'], shotTypes: ['rolling'], dust: false, maxSpeed: 'cruise' } } } };
  state.shot = refusedKeyframe();
});

describe('« Modifier ce plan » on a refused keyframe', () => {
  it('requires a reason or a comment, from a closed list', () => {
    expect(shotReviewSchema.safeParse({ decision: 'revise' }).success).toBe(false);
    expect(shotReviewSchema.safeParse({ decision: 'revise', reasons: ['made_up'] }).success).toBe(false);
    expect(shotReviewSchema.safeParse({ decision: 'revise', reasons: ['framing'] }).success).toBe(true);
    expect(shotReviewSchema.safeParse({ decision: 'revise', feedback: 'La voiture doit arriver par la droite.' }).success).toBe(true);
  });

  it('reserves the new image and its check before writing, and records the cleaned comment in the history', async () => {
    const result = await reviewShot(actor, 'v1', 2, { decision: 'revise', reasons: ['framing'], feedback: 'Entière <script>{x}</script>, ajoute le logo RIMCO et fais-la déraper' });
    expect(state.calls).toEqual(['reserve', 'reserve', 'update']);
    const patch = state.updates[0];
    expect(patch).toMatchObject({ keyframe_status: 'revising', keyframe_image_ledger_ids: ['i0', 'i1', 'i2', 'ledger-1'], keyframe_quality_ledger_ids: ['q0', 'q1', 'q2', 'ledger-2'] });
    const entry = (patch.verification_history as Array<Record<string, unknown>>).at(-1)!;
    expect(entry).toMatchObject({ decision: 'human_revise', by: 'human', scope: 'keyframe', reasons: ['framing'] });
    expect(entry.feedback).not.toMatch(/[<>{}]/);
    expect(result).toMatchObject({ status: 'revising', revisionsLeft: 1 });
    // Forbidden requests are adapted, and said in French.
    expect(result.feedbackConflicts).toEqual(expect.arrayContaining([expect.stringContaining('Texte ou logo'), expect.stringContaining('Drift ou dérapage')]));
  });

  it('is refused beyond 2 human corrections, the older relaunch included', async () => {
    state.shot = refusedKeyframe([humanRevise, { ...humanRevise, decision: 'human_retry' }]);
    await expect(reviewShot(actor, 'v1', 2, { decision: 'revise', reasons: ['light'] })).rejects.toMatchObject({ status: 409 });
    expect(state.calls).toEqual([]);
  });

  it('is refused, with nothing reserved, when the video would pass its cost cap', async () => {
    state.cap = 2.1; // 2 $ engaged + 0,23 $ for the correction
    await expect(reviewShot(actor, 'v1', 2, { decision: 'revise', reasons: ['light'] })).rejects.toMatchObject({ status: 422, message: expect.not.stringContaining('$') });
    expect(state.calls).toEqual([]);
    state.cap = 5;
    await expect(reviewShot(actor, 'v1', 2, { decision: 'revise', reasons: ['light'] })).resolves.toMatchObject({ status: 'revising' });
  });

  it('releases what was reserved when a reservation fails, and launches nothing', async () => {
    state.reserveFails = true;
    await expect(reviewShot(actor, 'v1', 2, { decision: 'revise', reasons: ['light'] })).rejects.toMatchObject({ status: 503 });
    expect(state.calls).not.toContain('update');
  });

  it('gives the comment to the director only, never to the image prompt', () => {
    const history = [{ ...humanRevise, feedback: 'MARQUEUR-UTILISATEUR la voiture arrive par la droite', reasons: ['trajectory'] }];
    const human = pendingHumanFeedback(history);
    const shot = { title: 'Arrivée', scene: 'Bridge', framing: 'wide', location: 'HKB bridge', action: 'drives', camera: 'tracking', durationSeconds: 5, vehiclePhotoId: 'p1' };
    const verdict = { issues: ['blocking: car cut by the frame'], reason: 'cut' };
    expect(buildShotRevisionPrompt(shot, verdict, human)).toMatch(/<user_feedback>MARQUEUR-UTILISATEUR[^<]*<\/user_feedback> <user_reasons>wrong direction of travel or wrong path<\/user_reasons>/);
    // The image prompt receives the verifier's defects only (what storyboard-live passes as retryReason).
    const imagePrompt = buildKeyframePrompt({ shot, vehicle: 'GWM Tank 300', lighting: 'Morning', format: '16:9', retryReason: defectsAsData(verdict), vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true });
    expect(imagePrompt).not.toContain('MARQUEUR-UTILISATEUR');
  });

  it('answers in simulation without any call', () => {
    expect(simulateShotReview(2, { decision: 'revise', feedback: 'mets un slogan' })).toMatchObject({ status: 'revising', simulated: true, feedbackConflicts: [expect.stringContaining('Texte ou logo')] });
    expect(state.calls).toEqual([]);
  });
});
