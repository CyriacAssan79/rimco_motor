import { describe, expect, it } from 'vitest';
import { motionCatalog, motionIds, normalizeMotion, normalizePhotoAngle, shotMotionIssues, storyboardMotionIssue } from '@/core/motions/catalog';
import { buildEndKeyframePrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildVideoQualityPrompt, needsEndKeyframe, travelSentence } from '@/core/providers/fal-keyframes';
import { CALM_DRIVING, IMAGE_PROMPT_MAX_CHARS, PULL_AWAY_DRIVING, STOP_DRIVING, TURN_DRIVING, VIDEO_PROMPT_MAX_CHARS, WHEEL_PHYSICS } from '@/core/prompts/rules';
import { buildStoryboardInstruction, shotDraftSchema } from '@/core/storyboard';

const base = { title: 'Plan', scene: 'SUV on the lagoon boulevard', framing: 'Medium wide', location: 'Abidjan lagoon boulevard', action: 'The SUV passes lamp posts and lane markings', camera: 'Static camera, slow pan', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place' };
const shot = (fields: Record<string, unknown>) => shotDraftSchema.parse({ ...base, ...fields });
const animate = (fields: Record<string, unknown>) => buildKeyframeAnimationPrompt({ shot: shot(fields), vehicle: 'Haval H6 gris', durationS: 5, mood: 'premium', lighting: 'day', excludePeople: true });

describe('catalogue de mouvements · données', () => {
  it('décrit chaque mouvement de façon complète et cohérente', () => {
    for (const id of motionIds) {
      const motion = motionCatalog[id];
      expect(motion.id).toBe(id);
      expect(motion.directions.length).toBeGreaterThan(0);
      expect(motion.keyframe && motion.animation && motion.menu && motion.label).toBeTruthy();
      // A motion with no driving rule is a stopped car, and only stopped cars have no end frame.
      expect(motion.driving === 'none').toBe(motion.directions.every((direction) => direction === 'static'));
      expect(motion.endFrame === null).toBe(motion.driving === 'none');
    }
  });

  it('lit le mouvement avec tolérance, sans faire échouer le storyboard', () => {
    expect(normalizeMotion('Turn left')).toBe('turn_left');
    expect(normalizeMotion('pass-by')).toBe('pass_by');
    expect(normalizeMotion('acceleration')).toBe('pull_away');
    expect(normalizeMotion('zigzag')).toBeUndefined();
    expect(shot({ motion: 'zigzag', shotType: 'rolling' }).motion).toBeUndefined();
  });

  it('déduit le type de plan du mouvement, même si un ancien shotType le contredit', () => {
    expect(shot({ motion: 'arrive_and_stop' }).shotType).toBe('hero');
    expect(shot({ motion: 'turn_right', shotType: 'hero' }).shotType).toBe('rolling');
    expect(shot({ shotType: 'detail' }).shotType).toBe('detail');
  });

  it('lit l’angle libre des photos', () => {
    expect(normalizePhotoAngle('Avant trois-quarts')).toBe('front_three_quarter');
    expect(normalizePhotoAngle('3/4 avant')).toBe('front_three_quarter');
    expect(normalizePhotoAngle('Arrière trois-quarts')).toBe('rear_three_quarter');
    expect(normalizePhotoAngle('Profil')).toBe('profile');
    expect(normalizePhotoAngle('Face avant')).toBe('front');
    expect(normalizePhotoAngle('Intérieur')).toBe('interior');
    expect(normalizePhotoAngle('Photo 1')).toBeUndefined();
    expect(normalizePhotoAngle(null)).toBeUndefined();
  });
});

describe('catalogue de mouvements · contrôle du réalisateur', () => {
  const angles = { front: 'Avant trois-quarts', side: 'Profil', back: 'Arrière trois-quarts', unknown: 'Photo 1' };

  it('accepte un plan cohérent', () => {
    expect(shotMotionIssues({ motion: 'approach', travelDirection: 'towards_camera', travelSpeed: 'cruise', vehiclePhotoId: 'front' }, angles)).toEqual([]);
    expect(shotMotionIssues({ motion: 'pass_by', travelDirection: 'left_to_right', vehiclePhotoId: 'unknown' }, angles)).toEqual([]);
  });

  it('refuse un mouvement absent, un sens, une vitesse ou un angle de photo incompatibles', () => {
    expect(shotMotionIssues({ title: 'A' })[0]).toContain('mouvement absent');
    expect(shotMotionIssues({ motion: 'approach', travelDirection: 'left_to_right' }).join()).toContain('travelDirection');
    expect(shotMotionIssues({ motion: 'turn_left', travelDirection: 'towards_camera', travelSpeed: 'dynamic' }).join()).toContain('travelSpeed');
    expect(shotMotionIssues({ motion: 'drive_away', travelDirection: 'away_from_camera', vehiclePhotoId: 'front' }, angles).join()).toContain('Avant trois-quarts');
    // 22/10: a hero « à l'arrêt » whose action says the car arrives is now a motion choice, not a contradiction.
    expect(shotMotionIssues({ motion: 'hero_still', travelDirection: 'towards_camera' }).join()).toContain('static');
  });

  it('n’autorise qu’un travelling latéral par film', () => {
    const tracking = { motion: 'side_tracking' as const, travelDirection: 'left_to_right' as const, travelSpeed: 'cruise' as const };
    expect(storyboardMotionIssue([tracking, { motion: 'hero_still', travelDirection: 'static' }])).toBeNull();
    expect(storyboardMotionIssue([tracking, tracking])).toContain('Un seul travelling latéral');
  });

  it('présente tout le menu au réalisateur sans dépasser 3 500 caractères', () => {
    const instruction = buildStoryboardInstruction({ durationSeconds: 20, mode: 'premium', vehicle: 'Haval H6', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant', angle: 'Avant trois-quarts' }], places: [], format: '16:9' });
    for (const id of motionIds) expect(instruction).toContain(id);
    expect(instruction).toContain('"motion":""');
    expect(instruction).toContain('"arrives then stops" = two shots');
    expect(instruction.length).toBeLessThan(3_500);
  });
});

describe('catalogue de mouvements · prompts', () => {
  it('remplace la conduite à vitesse constante par la règle du mouvement', () => {
    const turn = animate({ motion: 'turn_left', travelDirection: 'towards_camera', travelSpeed: 'slow' });
    expect(turn).toContain(TURN_DRIVING);
    expect(turn).toContain('bends to the car’s own left');
    expect(turn).not.toContain(CALM_DRIVING);
    expect(animate({ motion: 'pull_away', travelDirection: 'away_from_camera', travelSpeed: 'slow' })).toContain(PULL_AWAY_DRIVING);
    const stop = animate({ motion: 'arrive_and_stop', travelDirection: 'towards_camera', travelSpeed: 'slow' });
    expect(stop).toContain(STOP_DRIVING);
    expect(stop).toContain(WHEEL_PHYSICS);
    expect(animate({ motion: 'pass_by', travelDirection: 'left_to_right' })).toContain(CALM_DRIVING);
    expect(animate({ motion: 'hero_still', travelDirection: 'static' })).not.toContain(WHEEL_PHYSICS);
  });

  it('décrit un démarrage, pas une vitesse de croisière constante', () => {
    expect(travelSentence({ motion: 'pull_away', shotType: 'rolling', travelDirection: 'away_from_camera', travelSpeed: 'cruise' })).toBe('The car starts still, then drives away from the camera and gets smaller in the frame as it gathers speed.');
  });

  it('donne à l’image-clé l’instant du mouvement choisi', () => {
    const keyframe = buildKeyframePrompt({ shot: shot({ motion: 'turn_right', travelDirection: 'towards_camera', travelSpeed: 'slow' }), vehicle: 'Haval H6 gris', lighting: 'day', format: '16:9', retryReason: null, hasLocationReference: true, excludePeople: true });
    expect(keyframe).toContain('visibly bends to the car’s right');
    expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
  });

  it('prévoit une image de fin pour tout mouvement, y compris l’arrivée, jamais pour un plan à l’arrêt', () => {
    expect(needsEndKeyframe(shot({ motion: 'arrive_and_stop', travelDirection: 'towards_camera' }), true)).toBe(true);
    expect(needsEndKeyframe(shot({ motion: 'turn_left', travelDirection: 'towards_camera' }), true)).toBe(true);
    expect(needsEndKeyframe(shot({ motion: 'hero_still', travelDirection: 'static' }), true)).toBe(false);
    expect(needsEndKeyframe(shot({ motion: 'turn_left', travelDirection: 'towards_camera' }), false)).toBe(false);
    const end = buildEndKeyframePrompt({ shot: shot({ motion: 'turn_left', travelDirection: 'towards_camera' }), durationS: 5, format: '16:9', excludePeople: true });
    expect(end).toContain('the car now through the bend');
  });

  it('fait vérifier par le juge le mouvement demandé', () => {
    const judge = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, shotType: 'rolling', motion: 'turn_right', durationS: 5 });
    expect(judge).toContain('change heading to its own right');
    expect(judge).toContain('a vehicle that does not perform the asked motion');
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, shotType: 'rolling' })).not.toContain('asked motion');
  });

  it('reste sous la limite des moteurs pour chaque mouvement', () => {
    for (const id of motionIds) {
      const motion = motionCatalog[id];
      const prompt = animate({ motion: id, travelDirection: motion.directions[0], travelSpeed: motion.speeds[0] });
      expect(prompt.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
    }
  });
});
