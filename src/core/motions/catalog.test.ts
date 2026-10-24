import { describe, expect, it } from 'vitest';
import { allowedDirections, allowedMoves, allowedSpeeds, motionCatalog, motionIds, normalizeMotion, shotCoherenceIssues, storyboardCoherenceIssue, type CoherenceShot } from '@/core/motions/catalog';
import { normalizePhotoAngle, parseVehicleView, vehicleViewIncomplete, vehicleViewOptions } from '@/core/assets/vehicle-views';
import type { PlaceGeometry } from '@/core/assets/place-geometry';
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
      if (motion.endFrameByDefault) expect(motion.endFrame).not.toBeNull();
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

  it('lit la vue des photos et le sens du nez', () => {
    expect(normalizePhotoAngle('Avant trois-quarts')).toBe('front_three_quarter');
    expect(normalizePhotoAngle('3/4 avant · nez à droite')).toBe('front_three_quarter');
    expect(normalizePhotoAngle('3/4 arrière · nez à gauche')).toBe('rear_three_quarter');
    expect(normalizePhotoAngle('Profil · nez à gauche')).toBe('profile');
    expect(normalizePhotoAngle('Face avant')).toBe('front');
    expect(normalizePhotoAngle('Intérieur')).toBe('interior');
    expect(normalizePhotoAngle('Photo 1')).toBeUndefined();
    expect(normalizePhotoAngle(null)).toBeUndefined();
    expect(parseVehicleView('Profil · nez à droite')).toEqual({ angle: 'profile', nose: 'right' });
    expect(parseVehicleView('Profil')).toEqual({ angle: 'profile' });
    expect(parseVehicleView('Avant · nez à gauche')).toEqual({ angle: 'front' });
    for (const option of vehicleViewOptions) expect(vehicleViewIncomplete(option)).toBe(false);
    expect(vehicleViewIncomplete('Profil')).toBe(true);
  });
});

describe('catalogue de mouvements · contrôle du réalisateur', () => {
  // 25/10: the director's answer is checked against the photo's view and the place's geometry.
  const photos = {
    front: parseVehicleView('3/4 avant · nez à gauche'), side: parseVehicleView('Profil · nez à gauche'),
    back: parseVehicleView('3/4 arrière · nez à gauche'), unknown: parseVehicleView('Photo 1'), oldSide: parseVehicleView('Profil'),
  };
  const place = (geometry: Partial<PlaceGeometry> = {}): PlaceGeometry => ({ viewpoint: 'ground', roadAxis: 'diagonal', roadType: 'urban', timeOfDay: 'day', landmarks: 'boulevard and palm trees', ...geometry });
  const context = (places: Record<string, PlaceGeometry | null> = { road: place() }) => ({ photos, places });
  const plan = (fields: Partial<CoherenceShot>): CoherenceShot => ({ title: 'P', vehiclePhotoId: 'front', locationPhotoId: 'road', ...fields });

  it('accepte un plan cohérent', () => {
    expect(shotCoherenceIssues(plan({ motion: 'approach', travelDirection: 'towards_camera', travelSpeed: 'cruise' }), context())).toEqual([]);
    expect(shotCoherenceIssues(plan({ motion: 'pass_by', travelDirection: 'right_to_left', travelSpeed: 'slow', vehiclePhotoId: 'side' }), context())).toEqual([]);
    expect(shotCoherenceIssues(plan({ motion: 'hero_still', travelDirection: 'static' }), context())).toEqual([]);
  });

  it('refuse un mouvement absent, un sens, une vitesse ou un plan sans lieu décrit', () => {
    expect(shotCoherenceIssues({ title: 'A' }, context())[0]).toContain('mouvement absent');
    expect(shotCoherenceIssues(plan({ motion: 'approach', travelSpeed: 'slow' }), context()).join()).toContain('travelDirection');
    expect(shotCoherenceIssues(plan({ motion: 'approach', travelDirection: 'towards_camera', travelSpeed: 'dynamic' }), context()).join()).toContain('travelSpeed slow ou cruise');
    expect(shotCoherenceIssues(plan({ motion: 'hero_still', travelDirection: 'towards_camera' }), context()).join()).toContain('static');
    expect(shotCoherenceIssues(plan({ motion: 'hero_still', travelDirection: 'static' }), context({ road: null })).join()).toContain('lieu absent ou non décrit');
  });

  it('refuse une voiture qui recule ou qui roule du mauvais côté de sa photo', () => {
    // Front three-quarter photo driving away = reversing (accepted before 25/10 because direction and angle were checked apart).
    expect(allowedDirections('pull_away', photos.front, place())).toEqual(['right_to_left']);
    expect(shotCoherenceIssues(plan({ motion: 'pull_away', travelDirection: 'away_from_camera', travelSpeed: 'slow' }), context()).join()).toContain('accepte travelDirection right_to_left');
    expect(allowedDirections('turn_left', photos.front, place({ roadAxis: 'crossroads' }))).toEqual(['towards_camera']);
    // A profile with the nose on the left only drives to the left; without its nose side it never drives.
    expect(allowedDirections('pass_by', photos.side, place())).toEqual(['right_to_left']);
    expect(allowedDirections('pass_by', photos.oldSide, place())).toEqual([]);
    expect(allowedDirections('hero_still', photos.oldSide, place())).toEqual(['static']);
    expect(allowedDirections('approach', photos.unknown, place())).toEqual([]);
    expect(allowedDirections('detail_glide', photos.unknown, place())).toEqual(['static']);
  });

  it('suit la route et le point de vue de la photo du lieu', () => {
    expect(allowedDirections('pass_by', photos.side, place({ roadAxis: 'depth' }))).toEqual([]);
    expect(allowedDirections('approach', photos.front, place({ roadAxis: 'lateral' }))).toEqual([]);
    expect(allowedMoves(photos.front, place({ viewpoint: 'distant' }))).toEqual({ establishing_drive: ['right_to_left', 'towards_camera'] });
    expect(allowedDirections('hero_still', photos.front, place({ viewpoint: 'elevated' }))).toEqual([]);
    expect(allowedDirections('turn_left', photos.back, place({ roadAxis: 'bend_left' }))).toEqual(['away_from_camera']);
    expect(allowedDirections('turn_right', photos.back, place({ roadAxis: 'bend_left' }))).toEqual([]);
    expect(allowedMoves(photos.front, place({ viewpoint: 'interior', roadAxis: 'none', roadType: null, timeOfDay: 'interior' }))).toEqual({ hero_still: ['static'], detail_glide: ['static'] });
    expect(allowedSpeeds('pass_by', place())).toEqual(['slow', 'cruise']);
    expect(allowedSpeeds('pass_by', place({ roadType: 'open' }))).toEqual(['slow', 'cruise', 'dynamic']);
  });

  it('ne laisse jamais le texte libre « action » déplacer la voiture', () => {
    expect(shotCoherenceIssues(plan({ motion: 'approach', travelDirection: 'towards_camera', travelSpeed: 'slow', action: 'The SUV turns left then stops by the lagoon' }), context()).join()).toContain('« action »');
    expect(shotCoherenceIssues(plan({ motion: 'approach', travelDirection: 'towards_camera', travelSpeed: 'slow', action: 'The driver smiles; palm trees sway' }), context())).toEqual([]);
  });

  it('impose un seul sens à l’écran, un seul moment de la journée et des plans qui roulent', () => {
    const toLeft = plan({ title: 'Passage', motion: 'pass_by', travelDirection: 'right_to_left', travelSpeed: 'slow', vehiclePhotoId: 'side' });
    const approachLeft = plan({ title: 'Approche', motion: 'approach', travelDirection: 'towards_camera', travelSpeed: 'slow' });
    expect(storyboardCoherenceIssue([approachLeft, toLeft], context())).toBeNull();
    const rightPhotos = { ...photos, frontRight: parseVehicleView('3/4 avant · nez à droite') };
    expect(storyboardCoherenceIssue([toLeft, plan({ title: 'Approche droite', motion: 'approach', travelDirection: 'towards_camera', travelSpeed: 'slow', vehiclePhotoId: 'frontRight' })], { photos: rightPhotos, places: { road: place() } })).toContain('ce plan part vers la droite');
    // After a turn the film continues towards the turn's exit side.
    const turn = plan({ title: 'Virage', motion: 'turn_left', travelDirection: 'away_from_camera', travelSpeed: 'slow', vehiclePhotoId: 'back' });
    expect(storyboardCoherenceIssue([turn, toLeft].map((shot) => ({ ...shot, locationPhotoId: 'crossing' })), context({ crossing: place({ roadAxis: 'crossroads' }) }))).toBeNull();
    const night = { road: place(), night: place({ timeOfDay: 'night' }) };
    expect(storyboardCoherenceIssue([approachLeft, { ...toLeft, locationPhotoId: 'night' }], context(night))).toContain('Un seul moment de la journée');
    const still = plan({ motion: 'hero_still', travelDirection: 'static' });
    expect(storyboardCoherenceIssue([still, still, approachLeft], context())).toContain('Au moins la moitié des plans roulent');
  });

  it('n’autorise qu’un travelling latéral par film', () => {
    const tracking = plan({ motion: 'side_tracking', travelDirection: 'right_to_left', travelSpeed: 'cruise', vehiclePhotoId: 'side' });
    expect(storyboardCoherenceIssue([tracking, plan({ motion: 'hero_still', travelDirection: 'static' })], context())).toBeNull();
    expect(storyboardCoherenceIssue([tracking, tracking], context())).toContain('Un seul travelling latéral');
  });

  it('présente tout le menu et les combinaisons permises au réalisateur', () => {
    const geometry = place();
    const instruction = buildStoryboardInstruction({ durationSeconds: 20, mode: 'premium', vehicle: 'Haval H6', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant', angle: '3/4 avant · nez à gauche' }], places: [{ id: 'road', title: 'Boulevard', geometry }], format: '16:9' });
    for (const id of motionIds) expect(instruction).toContain(id);
    expect(instruction).toContain('"motion":""');
    expect(instruction).not.toContain('"camera"');
    expect(instruction).toContain('"arrives then stops" = two shots');
    expect(instruction).toContain('"view":"front_three_quarter","nose":"left"');
    expect(instruction).toContain('"place":"road","photos":[{"photo":"front","moves":"establishing_drive:right_to_left/towards_camera pass_by:right_to_left approach:towards_camera');
    expect(instruction).toContain('never mirrored');
    expect(instruction.length).toBeLessThan(5_000);
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
    expect(keyframe).toContain('bend to the car’s right');
    expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
  });

  it('prévoit une image de fin pour tout mouvement, y compris l’arrivée, jamais pour un plan à l’arrêt', () => {
    expect(needsEndKeyframe(shot({ motion: 'arrive_and_stop', travelDirection: 'towards_camera' }), true)).toBe(true);
    expect(needsEndKeyframe(shot({ motion: 'turn_left', travelDirection: 'towards_camera' }), true)).toBe(true);
    expect(needsEndKeyframe(shot({ motion: 'hero_still', travelDirection: 'static' }), true)).toBe(false);
    // Étape 2: on by default where the arrival point matters, behind KEYFRAME_END_FRAME_ROLLING for the others.
    expect(needsEndKeyframe(shot({ motion: 'turn_left', travelDirection: 'towards_camera' }), false)).toBe(true);
    expect(needsEndKeyframe(shot({ motion: 'arrive_and_stop', travelDirection: 'towards_camera' }), false)).toBe(true);
    expect(needsEndKeyframe(shot({ motion: 'pass_by', travelDirection: 'left_to_right' }), false)).toBe(false);
    expect(needsEndKeyframe(shot({ motion: 'side_tracking', travelDirection: 'left_to_right' }), false)).toBe(false);
    expect(needsEndKeyframe(shot({ motion: 'side_tracking', travelDirection: 'left_to_right' }), true)).toBe(true);
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
