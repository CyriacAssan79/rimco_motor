import { describe, expect, it, vi } from 'vitest';
import { brandSceneFromRow, loadBrandScene, storedBrandScene } from '@/core/brand-scene';
import { storyboardMotionIssue } from '@/core/motions/catalog';
import { buildEndKeyframePrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt } from '@/core/providers/fal-keyframes';
import { PEOPLE_IN_MOVING_CAR, steeringRule, trafficRule } from '@/core/prompts/rules';
import { buildStoryboardInstruction, shotDraftSchema } from '@/core/storyboard';

const scene = { trafficSide: 'right' as const, steeringSide: 'left' as const };
const base = { title: 'Plan', scene: 'SUV on the HKB bridge', framing: 'Medium wide', location: 'Abidjan, HKB bridge', action: 'The SUV passes the white cable pylons', camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'bridge' };
const rolling = shotDraftSchema.parse({ ...base, motion: 'approach', travelDirection: 'towards_camera', travelSpeed: 'cruise' });
const still = shotDraftSchema.parse({ ...base, motion: 'hero_still', travelDirection: 'static' });
const driver = 'Adult driver, short black hair, white shirt';

describe('réglages de route de la marque', () => {
  it('lit la ligne brands avec tolérance', () => {
    expect(brandSceneFromRow({ traffic_side: 'right', steering_side: 'left', market_location: 'Abidjan, Côte d’Ivoire' })).toEqual({ trafficSide: 'right', steeringSide: 'left', marketLocation: 'Abidjan, Côte d’Ivoire' });
    expect(brandSceneFromRow({ traffic_side: 'middle', steering_side: 'left' })).toBeUndefined();
    expect(brandSceneFromRow(null)).toBeUndefined();
    expect(storedBrandScene({ brandScene: { trafficSide: 'left', steeringSide: 'right', marketLocation: '' } })?.trafficSide).toBe('left');
    expect(storedBrandScene({})).toBeUndefined();
  });

  it('continue sans règle tant que la migration 0031 n’est pas appliquée', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(loadBrandScene(Promise.resolve({ data: null, error: { message: 'column brands.traffic_side does not exist' } }))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('écrit les règles de circulation et de volant', () => {
    expect(trafficRule('right')).toBe('Right-hand traffic: the car keeps to the right-hand lane of its direction, never the oncoming lane.');
    expect(steeringRule('left')).toBe('Left-hand drive: the steering wheel and the driver are on the car’s left side.');
    expect(PEOPLE_IN_MOVING_CAR).toContain('eyes on the road ahead');
  });
});

describe('règles de route dans les prompts', () => {
  it('impose la voie de droite aux plans en mouvement seulement', () => {
    const keyframe = (shot: typeof rolling) => buildKeyframePrompt({ shot, vehicle: 'GWM Tank 300 gris', lighting: 'day', format: '16:9', retryReason: null, hasLocationReference: true, excludePeople: true, scene });
    expect(keyframe(rolling)).toContain(trafficRule('right'));
    expect(keyframe(still)).not.toContain(trafficRule('right'));
    const animation = buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: '', lighting: 'day', excludePeople: true, scene });
    expect(animation).toContain(trafficRule('right'));
    expect(buildEndKeyframePrompt({ shot: rolling, durationS: 5, format: '16:9', excludePeople: true, scene })).toContain(trafficRule('right'));
  });

  it('place le volant et le conducteur du bon côté quand il y a des personnes', () => {
    const withDriver = buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: '', lighting: 'day', castDescription: driver, scene });
    expect(withDriver).toContain(steeringRule('left'));
    expect(withDriver).toContain('eyes on the road ahead');
    expect(buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: '', lighting: 'day', excludePeople: true, scene })).not.toContain(steeringRule('left'));
  });

  it('reste inchangé pour une vidéo créée avant ces réglages', () => {
    const before = buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: '', lighting: 'day', castDescription: driver });
    expect(before).not.toContain('Right-hand traffic');
    expect(before).not.toContain('Left-hand drive');
  });

  it('fait refuser dès l’image-clé une voiture de biais ou à contresens', () => {
    const judge = buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, moving: true, scene });
    expect(judge).toContain('must point along its lane');
    expect(judge).toContain('A car in the oncoming lane is a defect.');
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, moving: false, scene })).not.toContain('must point along its lane');
  });

  it('classe contresens, volant du mauvais côté et conducteur tourné comme bloquants dans le clip', () => {
    const judge = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: false, motion: 'approach', moving: true, scene, durationS: 5 });
    expect(judge).toContain('a car in the oncoming lane; a steering wheel or driver on the wrong side; a driver turned away from the road while driving');
  });
});

describe('réalisateur · circulation et showroom', () => {
  const vehiclePhotos = [{ id: 'front', role: 'exterior', title: 'Avant', angle: 'Avant trois-quarts' }];

  it('annonce la circulation à droite et l’immobilité en intérieur', () => {
    const instruction = buildStoryboardInstruction({ durationSeconds: 20, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, places: [{ id: 'bridge', title: 'Pont HKB', timeOfDay: 'day' }, { id: 'showroom', title: 'Showroom', timeOfDay: 'interior' }], format: '16:9', trafficSide: 'right' });
    expect(instruction).toContain(trafficRule('right'));
    expect(instruction).toContain('In an interior place the car never moves');
    expect(buildStoryboardInstruction({ durationSeconds: 20, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, places: [], format: '16:9' })).not.toContain('interior place');
  });

  it('refuse un plan roulant dans le showroom', () => {
    const shots = [
      { title: 'Entrée dans le showroom', motion: 'approach' as const, travelDirection: 'towards_camera' as const, locationPhotoId: 'showroom' },
      { title: 'Pont', motion: 'pass_by' as const, travelDirection: 'left_to_right' as const, locationPhotoId: 'bridge' },
    ];
    expect(storyboardMotionIssue(shots, {}, ['showroom'])).toContain('reste immobile');
    expect(storyboardMotionIssue([{ ...shots[0], motion: 'hero_still', travelDirection: 'static' }, shots[1]], {}, ['showroom'])).toBeNull();
  });
});
