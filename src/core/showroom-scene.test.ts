import { describe, expect, it } from 'vitest';
import { locationCatalog, placeTimeOfDay } from '@/core/assets/location-catalog';
import { buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt } from '@/core/providers/fal-keyframes';
import { IMAGE_PROMPT_MAX_CHARS, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { buildStoryboardInstruction, holdStillInInterior, interiorShotIssue, shotDraftSchema } from '@/core/storyboard';

const showroom = locationCatalog.find((place) => place.title.includes('Showroom'))!;
const vehiclePhotos = [{ id: 'front', role: 'exterior', title: 'Avant', angle: 'Avant trois-quarts' }];
const entering = shotDraftSchema.parse({ title: 'Entrée dans le showroom', shotType: 'rolling', travelDirection: 'towards_camera', travelSpeed: 'slow', scene: 'SUV entering the showroom', framing: 'Wide', location: 'Showroom', action: 'The SUV drives in', camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: showroom.id });

describe('showroom · le véhicule reste immobile (essai Pro du 24/10)', () => {
  it('reconnaît le showroom comme un lieu intérieur', () => {
    expect(placeTimeOfDay(showroom)).toBe('interior');
  });

  it('impose au réalisateur une voiture à l’arrêt dans un lieu intérieur, et seulement s’il y en a un', () => {
    const withShowroom = buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, format: '16:9', places: [{ id: showroom.id, title: showroom.title, timeOfDay: 'interior' }] });
    expect(withShowroom).toContain('In an interior place (showroom) the car never moves');
    expect(buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, format: '16:9', places: [{ id: 'bridge', title: 'Pont', timeOfDay: 'day' }] })).not.toContain('interior place');
  });

  it('refuse un plan roulant dans le showroom (tentative corrigée du réalisateur)', () => {
    expect(interiorShotIssue([entering], [showroom.id])).toContain('le véhicule reste immobile');
    expect(interiorShotIssue([{ ...entering, shotType: 'hero', travelDirection: 'static' }], [showroom.id])).toBeNull();
    expect(interiorShotIssue([{ ...entering, shotType: 'detail', travelDirection: 'static' }], [showroom.id])).toBeNull();
    expect(interiorShotIssue([entering], [])).toBeNull();
  });

  it('force à l’arrêt un plan de showroom côté serveur, même après une correction du réalisateur', () => {
    expect(holdStillInInterior(entering, [showroom.id])).toMatchObject({ shotType: 'hero', travelDirection: 'static', travelSpeed: undefined, vehiclePhotoId: 'front', locationPhotoId: showroom.id });
    expect(holdStillInInterior({ ...entering, shotType: 'detail' }, [showroom.id]).shotType).toBe('detail');
    expect(holdStillInInterior(entering, [])).toBe(entering);
  });

  it('demande une voiture posée au sol, immobile, dans les prompts d’image et d’animation', () => {
    const still = holdStillInInterior(entering, [showroom.id]);
    const keyframe = buildKeyframePrompt({ shot: still, vehicle: 'GWM Tank 300 gris', lighting: 'interior', format: '16:9', retryReason: null, hasLocationReference: true, excludePeople: true, interior: true });
    expect(keyframe).toContain('the car stands still on the showroom floor');
    expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
    const animation = buildKeyframeAnimationPrompt({ shot: still, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: '', lighting: 'interior', excludePeople: true, interior: true, retryReason: 'E'.repeat(300), castDescription: 'D'.repeat(400), maxLength: 2_500 });
    expect(animation).toContain('it never drives in or out');
    expect(animation).toContain('The car is stopped: wheels do not turn.');
    expect(animation.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
  });

  it('fait juger bloquant un véhicule qui bouge ou flotte dans le showroom', () => {
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, interior: true })).toContain('never floating or on a podium edge');
    const video = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, shotType: 'hero', durationS: 5, interior: true });
    expect(video).toContain('Any travel of the car or rotation of its wheels across the frames is blocking');
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, shotType: 'hero', durationS: 5 })).not.toContain('showroom');
  });
});
