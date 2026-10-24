import { describe, expect, it } from 'vitest';
import { motionCatalog, motionIds } from '@/core/motions/catalog';
import { buildEndKeyframePrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt } from '@/core/providers/fal-keyframes';
import { IMAGE_PROMPT_MAX_CHARS, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { shotDraftSchema } from '@/core/storyboard';

/**
 * 24/10: a keyframe prompt reached 2 226 characters (limit 2 200) and the generation failed before any call.
 * Every prompt must fit its limit for every motion, with the longest director fields, casting sheet, place and anchor.
 */
const scene = { trafficSide: 'right' as const, steeringSide: 'left' as const, marketLocation: 'Abidjan, Côte d’Ivoire' };
const place = 'P'.repeat(160);
const castDescription = 'C'.repeat(400);
const longShot = (motion: (typeof motionIds)[number]) => shotDraftSchema.parse({
  title: 'T'.repeat(80), motion, travelDirection: motionCatalog[motion].directions[0], travelSpeed: motionCatalog[motion].speeds[0],
  scene: 'S'.repeat(400), framing: 'F'.repeat(400), location: 'L'.repeat(400), action: 'A'.repeat(400), camera: 'K'.repeat(400),
  durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place',
});

describe('pire cas · chaque prompt tient sous la limite de son moteur', () => {
  for (const motion of motionIds) {
    it(`mouvement ${motion}`, () => {
      const shot = longShot(motion);
      const keyframe = buildKeyframePrompt({ shot, vehicle: 'V'.repeat(80), lighting: 'G'.repeat(160), format: '16:9', retryReason: 'R'.repeat(300), vehicleReferenceCount: 3, hasLocationReference: true, castDescription, scene, place, hasAnchorReference: true });
      expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
      const castKeyframe = buildKeyframePrompt({ shot, vehicle: 'V'.repeat(80), lighting: 'G'.repeat(160), format: '16:9', retryReason: 'R'.repeat(300), vehicleReferenceCount: 3, hasLocationReference: true, castTitles: ['N'.repeat(80), 'M'.repeat(80)], scene, place, hasAnchorReference: true });
      expect(castKeyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
      expect(buildEndKeyframePrompt({ shot, durationS: 5, format: '16:9', castDescription, scene, place }).length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
      expect(buildKeyframeAnimationPrompt({ shot, vehicle: 'V'.repeat(80), durationS: 5, mood: 'M'.repeat(160), lighting: 'G'.repeat(160), castDescription, scene, place, retryReason: 'R'.repeat(300), hasEndFrame: true, maxLength: 2_500 }).length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
    });
  }
});
