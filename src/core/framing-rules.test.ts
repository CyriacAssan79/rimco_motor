import { describe, expect, it } from 'vitest';
import {
  buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt, framingCriterionOf,
} from '@/core/providers/fal-keyframes';
import { framingRule, IDENTITY_DEFECT, IMAGE_PROMPT_MAX_CHARS, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { shotDraftSchema, travelDirectionSchema, type StoryboardShot } from '@/core/storyboard';
import { keyframeLoopDecision } from '@/core/verification/loop';

const shot = (fields: Partial<StoryboardShot>): StoryboardShot => shotDraftSchema.parse({
  title: 'Plan', shotType: 'hero', travelDirection: 'static', scene: 'SUV on the bridge deck', framing: 'Wide front three-quarter, whole car', location: 'Bridge',
  action: 'The SUV stands still', camera: 'Slow push-in', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'bridge', ...fields,
});
const wide = shot({});
const detail = shot({ shotType: 'detail', framing: 'Close-up of the front grille and badge' });
const judges = (brief: Record<string, unknown>, draft: StoryboardShot) => [
  buildKeyframeQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, excludePeople: true, framing: framingCriterionOf(brief, draft) }),
  buildVideoQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, excludePeople: true, shotType: draft.shotType, durationS: 5, framing: framingCriterionOf(brief, draft) }),
];

describe('cadrage et badge · image de marque, tous niveaux (26/10)', () => {
  it('envoie la même liste de défauts bloquants aux juges en Standard, Pro et Premium', () => {
    const [standard, pro, premium] = (['standard', 'pro', 'premium'] as const).map((tier) => judges({ generationTier: tier, storyMode: tier, framingRules: true }, wide));
    expect(pro).toEqual(standard);
    expect(premium).toEqual(standard);
    for (const prompt of standard) {
      expect(prompt).toContain(IDENTITY_DEFECT);
      expect(prompt).toContain('Requested framing (a criterion): "Wide front three-quarter, whole car".');
      expect(prompt).toContain('a car cut by a frame edge is blocking');
      expect(prompt).toContain('A framing clearly different from it (for example a close-up when a wide shot was asked) is blocking; slightly tighter, looser or off-centre is a minor defect.');
    }
    expect(standard[1]).toContain('a car cut by a frame edge; a framing clearly different from the requested one;');
  });

  it('un plan de détail peut couper le véhicule ; un plan large ne le peut pas', () => {
    const [keyframe, clip] = judges({ framingRules: true }, detail);
    for (const prompt of [keyframe, clip]) {
      expect(prompt).toContain('Detail shot: the requested detail must be sharp and whole; a cropped car is normal here.');
      expect(prompt).not.toContain('a car cut by a frame edge');
    }
    expect(framingRule('detail')).toContain('the car may be cropped');
    expect(framingRule('hero')).toBe('Whole car in frame, with space around it, never cut by an edge.');
    // A pass-by enters and leaves the frame: only there may the clip show a partial car.
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: false, excludePeople: true, durationS: 5, framing: framingCriterionOf({ framingRules: true }, shot({ shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'cruise' })) }))
      .toContain('except while it enters or leaves it in this crossing shot');
  });

  it('le juge de l’image clé cite le badge comme celui du clip, et garde un défaut mineur en avertissement', () => {
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: false })).toContain(`An ${IDENTITY_DEFECT} is blocking.`);
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: false, excludePeople: true })).toContain(`(${IDENTITY_DEFECT};`);
    expect(keyframeLoopDecision({ approved: true, issues: ['minor: framing slightly tighter'], reason: 'OK' }, 0, 2)).toBe('accept_with_warning');
    expect(keyframeLoopDecision({ approved: true, issues: [], reason: 'OK' }, 0, 2)).toBe('accept');
    expect(keyframeLoopDecision({ approved: false, issues: ['blocking: car cut by the frame edge'], reason: 'Cropped' }, 0, 2)).toBe('revise');
  });

  it('les générateurs reçoivent la même règle de cadrage ; les versions d’avant le 26/10 n’ont aucune règle ajoutée', () => {
    const base = { vehicle: 'GWM Tank 300', lighting: 'day', format: '16:9', retryReason: null };
    expect(buildKeyframePrompt({ shot: wide, ...base, framed: true })).toContain(framingRule('hero'));
    expect(buildKeyframeAnimationPrompt({ shot: detail, vehicle: 'GWM Tank 300', durationS: 5, mood: '', lighting: 'day', framed: true })).toContain(framingRule('detail'));
    expect(framingCriterionOf({}, wide)).toBeUndefined();
    expect(buildKeyframePrompt({ shot: wide, ...base })).not.toContain(framingRule('hero'));
    expect(judges({}, wide)[0]).not.toContain('Requested framing');
  });

  // Bounds of the real inputs: lighting and mood 160, castDescription 400, 2 casting titles of 160, place 160, market 120.
  it('tient sous les plafonds au pire cas avec la règle de cadrage, pour chaque mouvement et chaque type de plan', () => {
    const rules = { steeringSide: 'left' as const, trafficSide: 'right' as const, steeringWithPeopleOnly: false, onRoad: true, framed: true };
    const people = [{ castDescription: 'D'.repeat(400) }, { castTitles: ['A'.repeat(160), 'B'.repeat(160)] }, { excludePeople: true }];
    for (const direction of travelDirectionSchema.options) {
      for (const shotType of ['rolling', 'establishing', 'hero', 'detail'] as const) {
        const long = shotDraftSchema.parse({
          title: 'T'.repeat(80), shotType, travelDirection: direction, travelSpeed: 'dynamic', scene: 'scene '.repeat(40), framing: 'framing '.repeat(20),
          location: 'place '.repeat(30), action: 'action '.repeat(40), camera: 'camera '.repeat(30), durationSeconds: 15, vehiclePhotoId: 'front', locationPhotoId: 'place',
        });
        for (const who of people) {
          const common = { place: 'P'.repeat(160), market: 'M'.repeat(120), ...who, ...rules };
          const keyframe = buildKeyframePrompt({ shot: long, vehicle: 'V'.repeat(60), lighting: 'L'.repeat(160), format: '16:9', retryReason: 'x'.repeat(2_000), vehicleReferenceCount: 4, hasLocationReference: true, ...common });
          expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
          expect(keyframe).toContain(framingRule(shotType));
          const animation = buildKeyframeAnimationPrompt({ shot: long, vehicle: 'V'.repeat(60), durationS: 15, mood: 'M'.repeat(160), lighting: 'L'.repeat(160), hasEndFrame: true, retryReason: 'x'.repeat(2_000), ...common });
          expect(animation.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
        }
      }
    }
  });
});
