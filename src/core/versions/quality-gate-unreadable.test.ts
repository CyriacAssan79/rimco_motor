import { describe, expect, it } from 'vitest';
import { KEYFRAME_QUALITY_RESERVE_USD, parseKeyframeQuality, VISION_MAX_OUTPUT_TOKENS } from '@/core/providers/fal-keyframes';
import { clipLoopDecision, keyframeLoopDecision, UNREADABLE_VERDICT } from '@/core/verification/loop';

describe('juge illisible (essai du 24/10)', () => {
  it('reconnaît comme illisible le verdict coupé reçu de fal', () => {
    // Real output of the 24/10 clip check: the 1 500-token budget ended inside the JSON.
    expect(parseKeyframeQuality('{"approved":true,"issues":[],"reason":"Tank 300 gris conforme, pont correct, voiture immobile, contact pneus-route correct.","readable')).toBeNull();
  });

  it('laisse au juge un budget de réponse suffisant et réserve son vrai coût', () => {
    expect(VISION_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(4_000);
    expect(KEYFRAME_QUALITY_RESERVE_USD).toBeGreaterThanOrEqual(0.1);
  });

  it('un contrôle illisible n’est jamais une acceptation : le plan attend une décision humaine (25/10)', () => {
    expect(keyframeLoopDecision(null, 0, 2)).toBe('review');
    expect(clipLoopDecision(null, 0)).toBe('review');
    expect(UNREADABLE_VERDICT.approved).toBe(false);
    expect(UNREADABLE_VERDICT.issues[0]).toContain('vérifier ce plan à l’œil');
  });
});
