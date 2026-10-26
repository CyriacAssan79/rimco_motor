import { describe, expect, it } from 'vitest';
import { buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt, peopleDirection } from '@/core/providers/fal-keyframes';
import { IMAGE_PROMPT_MAX_CHARS, PEOPLE_IN_MOVING_CAR, steeringRule, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { shotDraftSchema } from '@/core/storyboard';

const driver = 'Adult driver in their thirties, warm brown skin, short black hair, white shirt and navy trousers';
const rolling = shotDraftSchema.parse({ title: 'Boulevard', shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'cruise', scene: 'SUV on the lagoon boulevard', framing: 'Medium', location: 'Boulevard', action: 'The SUV passes the palm trees', camera: 'Panning camera', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place' });

describe('conducteur · présence, volant et regard (essais du 24/10)', () => {
  it('écrit le côté du volant lu dans les réglages de la marque', () => {
    expect(steeringRule('left')).toBe('Left-hand drive: the steering wheel and the driver are on the car’s left side.');
    expect(steeringRule('right')).toContain('right side');
  });

  it('garde le conducteur tourné vers la route quand la voiture roule', () => {
    expect(PEOPLE_IN_MOVING_CAR).toContain('facing forward, eyes on the road ahead');
    expect(peopleDirection({ castDescription: driver, stage: 'keyframe', moving: true, steeringSide: 'left' })).toContain('facing forward, eyes on the road ahead');
  });

  it('versions d’avant le 26/10 : volant du bon côté dès qu’une personne est visible, jamais dans une voiture vide', () => {
    expect(peopleDirection({ castDescription: driver, stage: 'animation', moving: true, steeringSide: 'left' })).toContain('Left-hand drive');
    expect(peopleDirection({ excludePeople: true, stage: 'keyframe', moving: true, steeringSide: 'left', steeringWithPeopleOnly: true })).not.toContain('hand drive');
    expect(peopleDirection({ castDescription: driver, stage: 'keyframe', moving: true })).not.toContain('hand drive');
  });

  it('fait juger bloquant un volant du mauvais côté ou un conducteur qui ne regarde pas la route', () => {
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, steeringSide: 'left', steeringWithPeopleOnly: true })).toContain('a driver turned away from the road while driving, is a defect');
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, steeringSide: 'left' })).toContain('A steering wheel or driver on the other side, or a driver turned away from the road while driving, is blocking.');
    const video = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: false, steeringSide: 'left', durationS: 5 });
    expect(video).toContain('a steering wheel or driver on the wrong side; a driver turned away from the road while driving');
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, steeringSide: 'left', steeringWithPeopleOnly: true, durationS: 5 })).not.toContain('wrong side');
  });

  it('tient sous les limites de longueur avec conducteur, lieu et reprise', () => {
    const long = shotDraftSchema.parse({ ...rolling, action: 'A'.repeat(400), camera: 'B'.repeat(400), scene: 'C'.repeat(400) });
    const place = 'Abidjan, boulevard du front lagunaire. Boulevard dégagé au bord de la lagune avec la ville visible à l’horizon';
    const animation = buildKeyframeAnimationPrompt({ shot: long, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: 'premium', lighting: 'golden hour', castDescription: 'D'.repeat(400), place, market: 'Abidjan, Côte d’Ivoire', steeringSide: 'left', retryReason: 'E'.repeat(300) });
    expect(animation.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
    expect(animation).toContain('Left-hand drive');
    const image = buildKeyframePrompt({ shot: long, vehicle: 'GWM Tank 300 gris', lighting: 'golden hour', format: '16:9', retryReason: 'E'.repeat(300), vehicleReferenceCount: 4, hasLocationReference: true, castDescription: 'D'.repeat(400), place, market: 'Abidjan, Côte d’Ivoire', steeringSide: 'left' });
    expect(image.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
    expect(image).toContain('Left-hand drive');
  });
});
