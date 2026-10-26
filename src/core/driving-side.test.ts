import { describe, expect, it } from 'vitest';
import { loadBrandSettings, storedDrivingRules } from '@/core/brand-market';
import {
  buildEndKeyframePrompt, buildEndKeyframeQualityPrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt,
  buildKeyframeQualityPrompt, buildVideoQualityPrompt, isMoving,
} from '@/core/providers/fal-keyframes';
import { IMAGE_PROMPT_MAX_CHARS, steeringRule, trafficRule, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { buildStoryboardInstruction, shotDraftSchema, travelDirectionSchema, type StoryboardShot } from '@/core/storyboard';
import { buildShotRevisionInstruction } from '@/core/verification/loop';

const base = { title: 'Pont', scene: 'SUV on the HKB bridge', framing: 'Wide', location: 'HKB bridge', action: 'The SUV passes the white pylons', camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'bridge' };
const towards = shotDraftSchema.parse({ ...base, shotType: 'rolling', travelDirection: 'towards_camera', travelSpeed: 'cruise' });
const parked = shotDraftSchema.parse({ ...base, shotType: 'hero', travelDirection: 'static' });
/** Rules frozen in brief_json by a version created from 26/10 on (RIMCO: right-hand traffic, left-hand drive). */
const current = storedDrivingRules({ steeringSide: 'left', trafficSide: 'right' });
/** Version created on 25/10: steering side frozen, no traffic side. */
const legacy = storedDrivingRules({ steeringSide: 'left' });
const TRAFFIC = trafficRule('right');

describe('côté de circulation et volant de la marque (26/10)', () => {
  it('lit traffic_side avec la même tolérance que les autres réglages', async () => {
    expect(await loadBrandSettings(Promise.resolve({ data: { market_location: 'Abidjan, Côte d’Ivoire', steering_side: 'left', traffic_side: 'right' }, error: null })))
      .toEqual({ marketLocation: 'Abidjan, Côte d’Ivoire', steeringSide: 'left', trafficSide: 'right' });
    expect(await loadBrandSettings(Promise.resolve({ data: { steering_side: 'left', traffic_side: 'middle' }, error: null }))).toEqual({ steeringSide: 'left' });
    expect(await loadBrandSettings(Promise.resolve({ data: null, error: { message: 'column brands.traffic_side does not exist' } }))).toEqual({});
  });

  it('écrit la règle en termes de voie de la voiture, jamais de gauche ou droite de l’image', () => {
    expect(TRAFFIC).toBe('Right-hand traffic: the car keeps to the right-hand lane of its own direction (its right, not the image’s); oncoming cars pass on its left.');
    expect(trafficRule('left')).toContain('left-hand lane of its own direction');
    expect(TRAFFIC).not.toMatch(/(left|right) (side )?of the (frame|image)/);
  });

  it('vers la caméra : la règle de voie accompagne la phrase de trajet, sans fixer de côté de l’image', () => {
    const keyframe = buildKeyframePrompt({ shot: towards, vehicle: 'GWM Tank 300', lighting: 'golden hour', format: '16:9', retryReason: null, hasLocationReference: true, ...current });
    expect(keyframe).toContain('drives towards the camera and grows in the frame');
    expect(keyframe).toContain(TRAFFIC);
    expect(keyframe).not.toMatch(/(left|right) (side )?of the (frame|image)/);
    const judge = buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, ...current, moving: isMoving(towards) });
    expect(judge).toContain(`${TRAFFIC} When the lanes are visible, a car in the lane of the wrong side is blocking.`);
  });

  it('donne la règle de circulation aux plans en mouvement seulement (image clé, image de fin, animation)', () => {
    const animation = buildKeyframeAnimationPrompt({ shot: towards, vehicle: 'GWM Tank 300', durationS: 5, mood: '', lighting: 'golden hour', excludePeople: true, ...current });
    const end = buildEndKeyframePrompt({ shot: towards, durationS: 5, format: '16:9', excludePeople: true, ...current });
    expect(animation).toContain(TRAFFIC);
    expect(end).toContain(TRAFFIC);
    const still = buildKeyframePrompt({ shot: parked, vehicle: 'GWM Tank 300', lighting: 'golden hour', format: '16:9', retryReason: null, excludePeople: true, ...current });
    expect(still).not.toContain('hand traffic');
    expect(buildKeyframeAnimationPrompt({ shot: parked, vehicle: 'GWM Tank 300', durationS: 5, mood: '', lighting: 'golden hour', excludePeople: true, ...current, interior: true })).not.toContain('hand traffic');
  });

  it('voiture vide : le volant reste du côté de la marque, et le juge refuse un volant du mauvais côté', () => {
    const empty = steeringRule('left', false);
    expect(empty).toBe('Left-hand drive: the steering wheel, visible through the windscreen, is on the car’s left side.');
    for (const shot of [towards, parked]) {
      expect(buildKeyframePrompt({ shot, vehicle: 'GWM Tank 300', lighting: 'golden hour', format: '16:9', retryReason: null, excludePeople: true, ...current })).toContain(empty);
      expect(buildKeyframeAnimationPrompt({ shot, vehicle: 'GWM Tank 300', durationS: 5, mood: '', lighting: 'golden hour', excludePeople: true, ...current })).toContain(empty);
    }
    expect(buildEndKeyframePrompt({ shot: towards, durationS: 5, format: '16:9', excludePeople: true, ...current })).toContain(empty);
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, ...current })).toContain(`${empty} A steering wheel seen on the other side is blocking.`);
    expect(buildEndKeyframeQualityPrompt({ excludePeople: true, ...current })).toContain('A steering wheel seen on the other side is blocking.');
    const clip = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, durationS: 5, ...current, moving: true });
    expect(clip).toContain('; a steering wheel on the wrong side; a car in the lane of the wrong side of the road)');
    expect(clip).toContain(empty);
  });

  it('versions créées avant le 26/10 (sans trafficSide) : aucune règle ajoutée', () => {
    expect(legacy).toEqual({ steeringSide: 'left', steeringWithPeopleOnly: true });
    expect(storedDrivingRules({})).toEqual({ steeringWithPeopleOnly: true });
    const prompts = [
      buildKeyframePrompt({ shot: towards, vehicle: 'GWM Tank 300', lighting: 'golden hour', format: '16:9', retryReason: null, excludePeople: true, ...legacy }),
      buildKeyframeAnimationPrompt({ shot: towards, vehicle: 'GWM Tank 300', durationS: 5, mood: '', lighting: 'golden hour', excludePeople: true, ...legacy }),
      buildEndKeyframePrompt({ shot: towards, durationS: 5, format: '16:9', excludePeople: true, ...legacy }),
      buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, ...legacy, moving: true }),
      buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, durationS: 5, ...legacy, moving: true }),
      buildEndKeyframeQualityPrompt({ excludePeople: true, ...legacy }),
      buildShotRevisionInstruction({ vehicle: 'GWM Tank 300', ...legacy }),
    ];
    for (const prompt of prompts) {
      expect(prompt).not.toContain('hand traffic');
      expect(prompt).not.toContain('hand drive');
      expect(prompt).not.toContain('wrong side');
    }
  });

  it('le réalisateur reçoit les deux règles dans le bloc MOTION, et sa correction aussi', () => {
    const instruction = buildStoryboardInstruction({
      durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300 gris', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }],
      places: [{ id: 'hkb', title: 'Pont HKB', timeOfDay: 'day' }], trafficSide: 'right', steeringSide: 'left',
    });
    const motion = instruction.split('\n').find((line) => line.startsWith('MOTION:')) ?? '';
    expect(motion).toContain(TRAFFIC);
    expect(motion).toContain(steeringRule('left'));
    const revision = buildShotRevisionInstruction({ vehicle: 'GWM Tank 300', ...current });
    expect(revision).toContain(TRAFFIC);
    expect(revision).toContain(steeringRule('left'));
  });

  // Bounds of the real inputs: lighting and mood 160 (Studio), castDescription 400, 2 casting titles of 160, place 160, market 120.
  it('tient sous les plafonds au pire cas, pour chaque mouvement et chaque type de plan', () => {
    const longest = (travelDirection: StoryboardShot['travelDirection'], shotType: StoryboardShot['shotType']): StoryboardShot => shotDraftSchema.parse({
      title: 'T'.repeat(80), shotType, travelDirection, travelSpeed: 'dynamic',
      scene: 'scene '.repeat(40), framing: 'framing '.repeat(20), location: 'place '.repeat(30), action: 'action '.repeat(40), camera: 'camera '.repeat(30),
      durationSeconds: 15, vehiclePhotoId: 'front', locationPhotoId: 'place',
    });
    const place = 'P'.repeat(160);
    const market = 'M'.repeat(120);
    const people = [{ castDescription: 'D'.repeat(400) }, { castTitles: ['A'.repeat(160), 'B'.repeat(160)] }, { excludePeople: true }];
    for (const direction of travelDirectionSchema.options) {
      for (const shotType of ['rolling', 'establishing', 'hero', 'detail'] as const) {
        for (const who of people) {
          const shot = longest(direction, shotType);
          // A showroom shot is always a stopped hero or detail shot (holdStillInInterior).
          for (const interior of shot.travelDirection === 'static' && (shotType === 'hero' || shotType === 'detail') ? [false, true] : [false]) {
            const animation = buildKeyframeAnimationPrompt({ shot, vehicle: 'V'.repeat(60), durationS: 15, mood: 'M'.repeat(160), lighting: 'L'.repeat(160), hasEndFrame: true, retryReason: 'x'.repeat(2_000), place, market, interior, ...who, ...current });
            const keyframe = buildKeyframePrompt({ shot, vehicle: 'V'.repeat(60), lighting: 'L'.repeat(160), format: '16:9', retryReason: 'x'.repeat(2_000), vehicleReferenceCount: 4, hasLocationReference: true, place, market, interior, ...who, ...current });
            expect(animation.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
            expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
            expect(animation).toContain('hand drive');
            expect(keyframe).toContain('hand drive');
            if (isMoving(shot)) expect(keyframe).toContain(TRAFFIC);
          }
          const end = buildEndKeyframePrompt({ shot, durationS: 15, format: '16:9', place, market, ...who, ...current });
          expect(end.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
          expect(end).toContain(TRAFFIC);
        }
      }
    }
  });
});
