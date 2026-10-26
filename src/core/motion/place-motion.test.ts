import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSelectableLocation, locationCatalog, placeProfileFor, placeTimeOfDay, selectableLocations } from '@/core/assets/location-catalog';
import { vehicleTestKit } from '@/core/assets/vehicle-kit';
import {
  allowedCombinations, buildMotionMatrix, defaultPlaceProfile, fitShotToMatrix, keepWithinMatrix, loadPlaceProfiles,
  motionMatrixIssue, placeProfileSchema, shotMotionAllowance, storedMotionMatrix, vehicleViewOf, type MotionMatrix,
} from '@/core/motion/place-motion';
import {
  buildEndKeyframePrompt, buildEndKeyframeQualityPrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt,
  buildVideoQualityPrompt, isMoving, ROAD_AXIS_CHECK, ROAD_PATH_CHECK,
} from '@/core/providers/fal-keyframes';
import { HEADING_ALIGNED, IMAGE_PROMPT_MAX_CHARS, ROAD_ALIGNED, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { buildStoryboardInstruction, shotDraftSchema, travelDirectionSchema, type StoryboardShot } from '@/core/storyboard';
import { applyShotRevision, buildShotRevisionInstruction } from '@/core/verification/loop';

const id = (suffix: string) => `d55c82b1-95d3-4d2e-a2d2-25068739${suffix}`;
const BRIDGE = id('d212');
const RED_TRACK = id('d202');
const BOULEVARD = id('d209');
const SHOWROOM = id('d211');
const AERIAL = id('d201');
const photos = [
  { id: 'front', angle: '3/4 avant · nez à droite' },
  { id: 'side', angle: 'Profil · nez à gauche' },
  { id: 'rear', angle: '3/4 arrière · nez à gauche' },
  { id: 'old', angle: 'Profil' },
];
const matrix: MotionMatrix = buildMotionMatrix([BRIDGE, RED_TRACK, BOULEVARD, SHOWROOM, AERIAL].map((placeId) => ({ id: placeId, ...placeProfileFor({ id: placeId }) })), photos);
const shot = (fields: Partial<StoryboardShot>): StoryboardShot => shotDraftSchema.parse({
  title: 'Plan', shotType: 'rolling', travelDirection: 'towards_camera', travelSpeed: 'cruise', scene: 'SUV on the road', framing: 'Wide', location: 'Road',
  action: 'The SUV passes the lamp posts', camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: BRIDGE, ...fields,
});

describe('matrice des mouvements · lieux (26/10)', () => {
  it('classe un lieu importé « Showroom · nuit » en intérieur, avant le moment de la journée', () => {
    expect(placeTimeOfDay({ title: 'Showroom · nuit' })).toBe('interior');
    expect(defaultPlaceProfile({ title: 'Showroom · nuit' }).timeOfDay).toBe('interior');
    expect(placeTimeOfDay({ title: 'Route rouge · coucher de soleil' })).toBe('golden');
    expect(placeTimeOfDay({ title: 'Boulevard · nuit' })).toBe('night');
  });

  it('décrit chaque lieu intégré par un profil valide et masque « Pont HKB · approche »', () => {
    for (const location of locationCatalog) {
      expect(placeProfileSchema.safeParse(location.profile).success, location.title).toBe(true);
      expect(existsSync(join(process.cwd(), 'public', location.path)), location.path).toBe(true);
    }
    expect(locationCatalog).toHaveLength(19);
    expect(selectableLocations.some((location) => location.title.startsWith('Pont HKB · approche'))).toBe(false);
    expect(findSelectableLocation(id('d210'))).toBeUndefined();
    expect(selectableLocations.filter((location) => location.title.includes('tablier'))).toHaveLength(2);
  });

  it('donne un profil prudent à un lieu importé sans fiche, et lit la fiche que l’admin a validée', () => {
    expect(placeProfileFor({ id: 'upload', title: 'Rue de Cocody · nuit' })).toEqual({ described: false, profile: { timeOfDay: 'night', view: 'road', roadAxes: ['along'], shotTypes: ['hero', 'detail'], dust: false, maxSpeed: 'slow', promptEn: '', hasReadableText: false } });
    const described = { timeOfDay: 'day', view: 'road', roadAxes: ['along', 'across'], shotTypes: ['rolling'], dust: true, maxSpeed: 'slow', promptEn: 'Red laterite track between palm trees', hasReadableText: false };
    expect(placeProfileFor({ id: 'upload', title: 'Piste', place_profile: described })).toEqual({ described: true, profile: described });
    expect(placeProfileSchema.safeParse({ ...described, timeOfDay: 'interior' }).success).toBe(false);
    expect(placeProfileSchema.safeParse({ ...described, view: 'aerial' }).success).toBe(false);
  });

  it('tolère une base sans la migration 0034', async () => {
    expect(await loadPlaceProfiles(Promise.resolve({ data: null, error: { message: 'column assets.place_profile does not exist' } }))).toEqual({});
    expect(await loadPlaceProfiles(Promise.resolve({ data: [{ id: 'a', place_profile: null }], error: null }))).toEqual({ a: null });
  });
});

describe('matrice des mouvements · combinaisons', () => {
  it('lit la vue et le côté du nez des photos du kit (Haval « profil avant » = 3/4 arrière)', () => {
    const haval = vehicleTestKit.find((vehicle) => vehicle.model === 'H6')!.photos.find((photo) => photo.file === 'profil-avant.webp')!;
    expect(vehicleViewOf(haval)).toEqual({ angle: 'rear_three_quarter', nose: 'left' });
    expect(vehicleViewOf({ angle: 'Profil', photo_role: 'interior' })).toEqual({ angle: 'interior' });
  });

  it('pont : la voiture suit le tablier, jamais en passage latéral', () => {
    expect(allowedCombinations(matrix.places[BRIDGE], matrix.photos.front)).toEqual({ establishing: ['towards_camera'], rolling: ['towards_camera'], hero: ['static', 'towards_camera'] });
    expect(allowedCombinations(matrix.places[BRIDGE], matrix.photos.side)).toEqual({ hero: ['static'] });
  });

  it('boulevard lagunaire : passage latéral possible, du côté du nez de la photo', () => {
    expect(allowedCombinations(matrix.places[BOULEVARD], matrix.photos.side).rolling).toEqual(['right_to_left']);
    expect(allowedCombinations(matrix.places[BOULEVARD], matrix.photos.front).rolling).toEqual(['towards_camera', 'left_to_right']);
    // A profile photo without nose side keeps the behaviour of before: both lateral directions.
    expect(allowedCombinations(matrix.places[BOULEVARD], matrix.photos.old).rolling).toEqual(['left_to_right', 'right_to_left']);
  });

  it('showroom immobile, vue aérienne en plan d’ensemble seulement', () => {
    expect(allowedCombinations(matrix.places[SHOWROOM], matrix.photos.front)).toEqual({ detail: ['static'], hero: ['static'] });
    expect(allowedCombinations(matrix.places[AERIAL], matrix.photos.rear)).toEqual({ establishing: ['away_from_camera'] });
  });

  it('refuse une réponse du réalisateur hors matrice (tentative corrigée) et accepte une réponse conforme', () => {
    expect(motionMatrixIssue([shot({})], matrix)).toBeNull();
    expect(motionMatrixIssue([shot({ travelDirection: 'left_to_right' })], matrix)).toContain('travelDirection left_to_right impossible pour rolling');
    expect(motionMatrixIssue([shot({ locationPhotoId: RED_TRACK, travelSpeed: 'dynamic' })], matrix)).toContain('vitesse maximale dans ce lieu : slow');
    expect(motionMatrixIssue([shot({ locationPhotoId: RED_TRACK, travelSpeed: 'slow', action: 'Red dust rises behind the SUV' })], matrix)).toBeNull();
    expect(motionMatrixIssue([shot({ locationPhotoId: BOULEVARD, action: 'Dust rises behind the SUV' })], matrix)).toContain('pas de poussière');
    expect(motionMatrixIssue([shot({ locationPhotoId: SHOWROOM })], matrix)).toContain('shotType rolling impossible');
  });

  it('une correction du réalisateur ne sort jamais de la matrice', () => {
    const approved = shot({});
    const lateral = applyShotRevision(approved, { scene: approved.scene, framing: 'Low wide', location: approved.location, action: approved.action, camera: approved.camera, travelDirection: 'left_to_right' });
    const kept = keepWithinMatrix(approved, lateral, matrix);
    expect(kept).toMatchObject({ framing: 'Low wide', travelDirection: 'towards_camera', shotType: 'rolling' });
    expect(keepWithinMatrix(approved, lateral, undefined)).toBe(lateral);
    expect(shotMotionAllowance(approved, matrix)).toBe('{"allowed":{"establishing":["towards_camera"],"rolling":["towards_camera"],"hero":["static","towards_camera"]},"maxSpeed":"cruise","dust":false}');
  });

  it('à la création, ramène un plan modifié dans la matrice (comme le showroom)', () => {
    expect(fitShotToMatrix(shot({ travelDirection: 'left_to_right' }), matrix)).toMatchObject({ shotType: 'rolling', travelDirection: 'towards_camera' });
    expect(fitShotToMatrix(shot({ locationPhotoId: RED_TRACK, travelSpeed: 'dynamic' }), matrix).travelSpeed).toBe('slow');
    expect(fitShotToMatrix(shot({ locationPhotoId: SHOWROOM }), matrix)).toMatchObject({ shotType: 'hero', travelDirection: 'static', travelSpeed: undefined });
  });
});

describe('matrice des mouvements · réalisateur, prompts et juges', () => {
  const base = { durationSeconds: 10 as const, mode: 'pro' as const, vehicle: 'GWM Tank 300 gris', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant', angle: '3/4 avant · nez à droite' }], places: [{ id: BRIDGE, title: 'Pont HKB · sur le tablier' }] };

  it('le réalisateur reçoit la table ALLOWED par lieu et par photo ; sans matrice, la consigne d’avant', () => {
    const withMatrix = buildStoryboardInstruction({ ...base, motionMatrix: buildMotionMatrix([{ id: BRIDGE, ...placeProfileFor({ id: BRIDGE }) }], base.vehiclePhotos) });
    expect(withMatrix).toContain(`ALLOWED (per place: maxSpeed, dust, and for each photo the accepted shotType → travelDirection): {"${BRIDGE}":{"maxSpeed":"cruise","dust":false,"photos":{"front":{"establishing":["towards_camera"],"rolling":["towards_camera"],"hero":["static","towards_camera"]}}}}`);
    expect(withMatrix).not.toContain('Match travelDirection to the photo angle');
    expect(buildStoryboardInstruction(base)).toContain('Match travelDirection to the photo angle');
  });

  it('l’image clé oriente la voiture par rapport à la route du lieu, pas au cadre', () => {
    const keyframe = buildKeyframePrompt({ shot: shot({}), vehicle: 'GWM Tank 300', lighting: 'day', format: '16:9', retryReason: null, onRoad: true });
    expect(keyframe).toContain(ROAD_ALIGNED);
    expect(keyframe).not.toContain(HEADING_ALIGNED);
    expect(buildKeyframePrompt({ shot: shot({}), vehicle: 'GWM Tank 300', lighting: 'day', format: '16:9', retryReason: null })).toContain(HEADING_ALIGNED);
    expect(buildEndKeyframePrompt({ shot: shot({}), durationS: 5, format: '16:9', onRoad: true })).toContain(ROAD_ALIGNED);
  });

  it('les juges refusent une voiture en biais ou contre l’axe, et une trajectoire qui sort de la route', () => {
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, onRoad: true })).toContain(ROAD_AXIS_CHECK);
    expect(buildEndKeyframeQualityPrompt({ onRoad: true })).toContain(ROAD_AXIS_CHECK);
    const clip = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, onRoad: true, moving: true, durationS: 5 });
    expect(clip).toContain(ROAD_PATH_CHECK);
    expect(clip).toContain('; a path that leaves the road or changes axis)');
  });

  it('la correction reçoit les combinaisons encore permises', () => {
    expect(buildShotRevisionInstruction({ vehicle: 'GWM Tank 300', allowedMotion: '{"allowed":{"rolling":["towards_camera"]},"maxSpeed":"cruise","dust":false}' }))
      .toContain('shotType, travelDirection and travelSpeed stay within ALLOWED for this place and photo');
  });

  it('versions créées avant le 26/10 (sans motionMatrix) : aucune règle ajoutée', () => {
    expect(storedMotionMatrix({})).toBeUndefined();
    expect(storedMotionMatrix({ motionMatrix: matrix })).toEqual(matrix);
    const prompts = [
      buildKeyframePrompt({ shot: shot({}), vehicle: 'GWM Tank 300', lighting: 'day', format: '16:9', retryReason: null }),
      buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, moving: true }),
      buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, moving: true, durationS: 5 }),
      buildShotRevisionInstruction({ vehicle: 'GWM Tank 300' }),
    ];
    for (const prompt of prompts) {
      expect(prompt).not.toContain('road of the place');
      expect(prompt).not.toContain('ALLOWED');
    }
  });

  // Bounds of the real inputs: lighting and mood 160, castDescription 400, 2 casting titles of 160, place 160, market 120.
  it('tient sous les plafonds au pire cas avec l’axe de la route, pour chaque mouvement et chaque type de plan', () => {
    const rules = { steeringSide: 'left' as const, trafficSide: 'right' as const, steeringWithPeopleOnly: false };
    const people = [{ castDescription: 'D'.repeat(400) }, { castTitles: ['A'.repeat(160), 'B'.repeat(160)] }, { excludePeople: true }];
    for (const direction of travelDirectionSchema.options) {
      for (const shotType of ['rolling', 'establishing', 'hero', 'detail'] as const) {
        const long = shotDraftSchema.parse({
          title: 'T'.repeat(80), shotType, travelDirection: direction, travelSpeed: 'dynamic', scene: 'scene '.repeat(40), framing: 'framing '.repeat(20),
          location: 'place '.repeat(30), action: 'action '.repeat(40), camera: 'camera '.repeat(30), durationSeconds: 15, vehiclePhotoId: 'front', locationPhotoId: 'place',
        });
        for (const who of people) {
          const common = { place: 'P'.repeat(160), market: 'M'.repeat(120), onRoad: true, ...who, ...rules };
          const keyframe = buildKeyframePrompt({ shot: long, vehicle: 'V'.repeat(60), lighting: 'L'.repeat(160), format: '16:9', retryReason: 'x'.repeat(2_000), vehicleReferenceCount: 4, hasLocationReference: true, ...common });
          expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
          expect(keyframe).toContain(ROAD_ALIGNED);
          const animation = buildKeyframeAnimationPrompt({ shot: long, vehicle: 'V'.repeat(60), durationS: 15, mood: 'M'.repeat(160), lighting: 'L'.repeat(160), hasEndFrame: true, retryReason: 'x'.repeat(2_000), ...common });
          expect(animation.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
          if (isMoving(long)) expect(buildEndKeyframePrompt({ shot: long, durationS: 15, format: '16:9', ...common }).length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
        }
      }
    }
  });
});
