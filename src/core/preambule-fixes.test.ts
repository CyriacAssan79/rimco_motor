import { describe, expect, it } from 'vitest';
import { locationCatalog, placeDescription } from '@/core/assets/location-catalog';
import { detectBriefConflicts, forbiddenShotText } from '@/core/brief/conflicts';
import { buildMotionMatrix, directorMotionTable } from '@/core/motion/place-motion';
import { buildEndKeyframePrompt, buildEndKeyframeQualityPrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt, extractFalVisionResult, framingCriterionOf, isMoving, splitQualityFeedback } from '@/core/providers/fal-keyframes';
import { fitPrompt, IMAGE_PROMPT_MAX_CHARS, INTEGRATION_CHECK, NO_EXTRA_VEHICLE_CHECK, ROAD_ALIGNED, ROAD_ALIGNED_BRIDGE, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { buildStoryboardInstruction, shotDraftSchema, travelDirectionSchema, type StoryboardShot } from '@/core/storyboard';
import { buildShotRevisionInstruction } from '@/core/verification/loop';

/** Corrections de la vérification du 26/10 sur la version « preambule ». */
const market = 'Abidjan, Côte d’Ivoire';
const driving = { trafficSide: 'right' as const, steeringSide: 'left' as const, steeringWithPeopleOnly: false };
const deck = locationCatalog.find((place) => place.id.endsWith('212'))!;
const boulevard = locationCatalog.find((place) => place.id.endsWith('209'))!;
const showroom = locationCatalog.find((place) => place.id.endsWith('211'))!;
const PLACE_RULE = 'Everything the camera reveals belongs to this same place: same road layout, buildings and vegetation; nothing from another city or country.';
const feedback = 'x '.repeat(150).trim() + '.';
const shot = (fields: Partial<StoryboardShot>): StoryboardShot => shotDraftSchema.parse({
  title: 'Plan', shotType: 'rolling', travelDirection: 'towards_camera', travelSpeed: 'cruise', scene: 'SUV on the HKB bridge deck', framing: 'Wide front three-quarter',
  location: 'HKB bridge deck', action: 'The SUV drives towards the camera along its lane, passing the white railings', camera: 'Static low camera on the deck edge',
  durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: deck.id, ...fields,
});

describe('A1 · la règle du lieu n’est jamais tronquée', () => {
  const longest = (travelDirection: StoryboardShot['travelDirection'], shotType: StoryboardShot['shotType']) => shot({
    shotType, travelDirection, travelSpeed: 'dynamic', title: 'T'.repeat(80), scene: 'scene '.repeat(40), framing: 'framing '.repeat(20),
    location: 'place '.repeat(30), action: 'action '.repeat(40), camera: 'camera '.repeat(30),
  });
  const people = [{ castDescription: 'Adult driver, about 40, dark-brown skin, short black hair, white shirt. '.repeat(6) }, { castTitles: ['A'.repeat(160), 'B'.repeat(160)] }];

  it('pour chaque mouvement, chaque type de plan, avec personnes et un retour du juge de 300 caractères', () => {
    expect(feedback.length).toBe(300);
    for (const direction of travelDirectionSchema.options) {
      for (const shotType of ['establishing', 'rolling', 'detail', 'hero'] as const) {
        for (const who of people) {
          const current = longest(direction, shotType);
          const common = { place: placeDescription(deck), market, onRoad: true, ...driving, ...who };
          const keyframe = buildKeyframePrompt({ shot: current, vehicle: 'GWM Tank 300 Gris', lighting: 'Clear natural morning light', format: '16:9', retryReason: feedback, vehicleReferenceCount: 4, hasLocationReference: true, framed: true, ...common });
          const animation = buildKeyframeAnimationPrompt({ shot: current, vehicle: 'GWM Tank 300 Gris', durationS: 5, mood: 'Confiant, polyvalent et premium', lighting: 'day', retryReason: feedback, hasEndFrame: true, framed: true, ...common });
          const end = buildEndKeyframePrompt({ shot: current, durationS: 5, format: '16:9', strictFrames: true, ...common });
          for (const prompt of [keyframe, animation, end]) expect(prompt).toContain(PLACE_RULE);
          expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
          expect(end.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
          expect(animation.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
        }
      }
    }
  });

  it('raccourcit la description du lieu après l’action et le cadrage', () => {
    const fitted = fitPrompt([
      { text: 'Place: a long description of the place that may be shortened.', shrinkTo: 20, shrinkOrder: 1 },
      { text: 'Action: a long action of the car that may be shortened first.', shrinkTo: 20 },
      { text: 'Framing: a long framing that may be shortened first too.', shrinkTo: 20 },
      { text: 'Locked.' },
    ], 150);
    expect(fitted).toContain('Place: a long description of the place that may be shortened.');
    expect(fitted).not.toContain('shortened first.');
  });

  it('retour du juge réel : défauts bloquants entiers, mineurs raccourcis en premier, action et lieu préservés', () => {
    const judge = 't=0s blocking: car angled across the lane, front wheels turned towards the railing; minor: pylon cables look thinner than in the location reference; minor: reflection of the lagoon on the bonnet is too strong; blocking: a second white car is visible on the far lane near the pylon base';
    expect(splitQualityFeedback(judge)).toEqual({
      blocking: 't=0s blocking: car angled across the lane, front wheels turned towards the railing; blocking: a second white car is visible on the far lane near the pylon base',
      minor: 'minor: pylon cables look thinner than in the location reference; minor: reflection of the lagoon on the bonnet is too strong',
    });
    // Without a severity, a defect counts as blocking.
    expect(splitQualityFeedback('logo added on the door')).toEqual({ blocking: 'logo added on the door', minor: '' });
    const current = shot({});
    const keyframe = buildKeyframePrompt({ shot: current, vehicle: 'GWM Tank 300 Gris', lighting: 'Clear natural morning light', format: '16:9', retryReason: judge, vehicleReferenceCount: 3, hasLocationReference: true, framed: true, place: placeDescription(deck), market, onRoad: true, castDescription: 'One man driver, about 40, dark-brown skin, white shirt', ...driving });
    expect(keyframe).toContain('Correct this defect of the previous attempt: t=0s blocking: car angled across the lane, front wheels turned towards the railing; blocking: a second white car is visible on the far lane near the pylon base.');
    expect(keyframe).toContain(`Action: ${current.action}.`);
    expect(keyframe).toContain(`Place: ${placeDescription(deck)} (${market}).`);
    expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
  });

  it('défauts bloquants raccourcis après l’action, le cadrage, la lumière et la description du lieu', () => {
    const current = shot({});
    const keyframe = buildKeyframePrompt({ shot: current, vehicle: 'GWM Tank 300 Gris', lighting: 'Clear natural morning light', format: '16:9', retryReason: feedback, vehicleReferenceCount: 3, hasLocationReference: true, framed: true, place: placeDescription(deck), market, onRoad: true, castDescription: 'One man driver, about 40, dark-brown skin, white shirt', ...driving });
    expect(keyframe).toContain(`Correct this defect of the previous attempt: ${feedback}`);
  });
});

describe('A2 · aucune voiture en face', () => {
  it('aucun prompt ni aucune consigne ne contient « oncoming » ; le juge bloque toujours la mauvaise voie', () => {
    const places = [deck, boulevard].map((place) => ({ id: place.id, title: place.title, timeOfDay: place.profile.timeOfDay, description: placeDescription(place) }));
    const prompts: string[] = [
      buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }], places, ...driving }),
      buildShotRevisionInstruction({ vehicle: 'GWM', ...driving }),
    ];
    for (const direction of travelDirectionSchema.options) {
      const current = shot({ travelDirection: direction, shotType: direction === 'static' ? 'hero' : 'rolling' });
      const common = { place: placeDescription(deck), market, onRoad: true, moving: isMoving(current), ...driving };
      prompts.push(
        buildKeyframePrompt({ shot: current, vehicle: 'GWM', lighting: 'day', format: '16:9', retryReason: null, hasLocationReference: true, ...common }),
        buildKeyframeAnimationPrompt({ shot: current, vehicle: 'GWM', durationS: 5, mood: '', lighting: 'day', ...common }),
        buildEndKeyframePrompt({ shot: current, durationS: 5, format: '16:9', ...common }),
        buildKeyframeQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, plan: current, ...common }),
        buildEndKeyframeQualityPrompt(common),
        buildVideoQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, excludePeople: true, plan: current, ...common }),
      );
    }
    for (const prompt of prompts) expect(prompt).not.toMatch(/oncoming/i);
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, excludePeople: true, moving: true, ...driving })).toContain('a car in the lane of the wrong side is blocking');
  });
});

describe('B1, B2, C4 · consigne du réalisateur', () => {
  const places = [boulevard].map((place) => ({ id: place.id, title: place.title, timeOfDay: place.profile.timeOfDay, description: placeDescription(place) }));
  const base = { durationSeconds: 10 as const, mode: 'pro' as const, vehicle: 'GWM', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }], places };

  it('autorise un gros plan sur un détail visible sur la photo du plan', () => {
    const instruction = buildStoryboardInstruction(base);
    expect(instruction).toContain('a close-up only on a detail visible on the photo of the shot; no interior, rear or profile without a matching photo.');
    expect(instruction).not.toContain('or close-up without a matching photo');
  });

  it('une lumière qui n’a le moment d’aucun lieu est signalée et n’est pas envoyée au réalisateur', () => {
    expect(detectBriefConflicts('Une vidéo élégante.', { placeTimes: ['day', 'day'], hasInteriorPhoto: false, lighting: 'Lumière douce de fin de journée' }))
      .toEqual([{ id: 'lighting', message: 'Lumière « fin de journée » demandée : les lieux choisis sont de jour, la lumière suit le lieu.' }]);
    expect(detectBriefConflicts('', { placeTimes: ['day', 'night'], hasInteriorPhoto: false, lighting: 'Lumière intérieure diffuse et régulière' })[0]?.message)
      .toBe('Lumière « intérieur » demandée : les lieux choisis sont de jour et de nuit, la lumière suit le lieu.');
    expect(detectBriefConflicts('', { placeTimes: ['day', 'golden'], hasInteriorPhoto: false, lighting: 'Lumière douce de fin de journée' })).toEqual([]);
    // A place without a known time of day can take the chip: no conflict.
    expect(detectBriefConflicts('', { placeTimes: ['day', null], hasInteriorPhoto: false, lighting: 'Lumière douce de fin de journée' })).toEqual([]);
    expect(buildStoryboardInstruction({ ...base, lighting: 'Lumière douce de fin de journée' })).toContain('Lighting: natural light matching each place.');
    expect(buildStoryboardInstruction({ ...base, lighting: 'Lumière naturelle claire du matin' })).toContain('Lighting: Clear natural morning light.');
  });

  it('sans personnage, la règle du volant prend la forme « voiture vide »', () => {
    expect(buildStoryboardInstruction({ ...base, steeringSide: 'left' })).toContain('the steering wheel, visible through the windows, is on the car’s left side');
    expect(buildStoryboardInstruction({ ...base, steeringSide: 'left', peoplePreset: 'driver' })).toContain('the steering wheel and the driver are on the car’s left side');
  });
});

describe('B3 · plans à l’arrêt dans le juge du clip', () => {
  it('ne demande des roues qui tournent que si le plan bouge', () => {
    const moving = buildVideoQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, excludePeople: true, moving: true });
    const still = buildVideoQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, excludePeople: true, moving: false, shotType: 'hero' });
    expect(moving).toContain('must keep turning consistently with the travel');
    expect(still).not.toContain('keep turning');
    expect(still).toContain('tyres stay in contact with the floor or road with a contact shadow, never floating or sinking; wheels do not turn');
  });
});

describe('B5 · longueur du réalisateur avec matrice et jetons des juges', () => {
  it('12 lieux et 6 photos : table compacte, chaque id une seule fois', () => {
    const places = locationCatalog.filter((place) => !place.retired).slice(0, 12);
    expect(places).toHaveLength(12);
    const angles = ['Avant trois-quarts', 'Profil gauche', 'Arrière trois-quarts', 'Avant', 'Arrière', 'Profil droit'];
    const photos = angles.map((angle, index) => ({ id: `0f1c2d3e-4b5a-4c6d-8e9f-${String(index).padStart(12, '0')}`, role: 'exterior', title: angle, angle }));
    const matrix = buildMotionMatrix(places.map((place) => ({ id: place.id, profile: place.profile })), photos);
    const instruction = buildStoryboardInstruction({ durationSeconds: 20, mode: 'pro', vehicle: 'GWM Tank 300 Gris', vehiclePhotos: photos, places: places.map((place) => ({ id: place.id, title: place.title, timeOfDay: place.profile.timeOfDay, description: placeDescription(place) })), format: '16:9', lighting: 'Lumière naturelle claire du matin', mood: 'Confiant, polyvalent et premium', marketLocation: market, ...driving, motionMatrix: matrix });
    // 26/10: 17 246 characters before (9 715 for the table alone); 10 796 after.
    expect(instruction.length).toBeLessThanOrEqual(11_000);
    for (const id of [...places.map((place) => place.id), ...photos.map((photo) => photo.id)]) expect(instruction.split(id)).toHaveLength(2);
    expect(directorMotionTable(matrix).length).toBeLessThanOrEqual(2_800); // 2 790 (9 715 before)
  });

  it('lit completion_tokens du juge quand fal le donne', () => {
    expect(extractFalVisionResult({ data: { output: '{"approved":true,"issues":[],"reason":"OK"}', usage: { cost: 0.01, completion_tokens: 1_234 } } }).completionTokens).toBe(1_234);
    expect(extractFalVisionResult({ data: { output: '{"approved":true,"issues":[],"reason":"OK"}' } }).completionTokens).toBeUndefined();
  });
});

describe('C1 à C6 · formulations', () => {
  it('showroom : voiture exposée, sol au lieu de route, pas de route ni de végétation', () => {
    const hero = shot({ shotType: 'hero', travelDirection: 'static', locationPhotoId: showroom.id });
    const common = { place: placeDescription(showroom), market, interior: true, excludePeople: true, ...driving };
    const keyframe = buildKeyframePrompt({ shot: hero, vehicle: 'GWM', lighting: 'Even, diffuse interior light', format: '16:9', retryReason: null, hasLocationReference: true, framed: true, ...common });
    const animation = buildKeyframeAnimationPrompt({ shot: hero, vehicle: 'GWM', durationS: 5, mood: '', lighting: 'interior', framed: true, ...common });
    expect(keyframe).toContain('Car on display, stopped');
    for (const prompt of [keyframe, animation]) {
      expect(prompt).toContain('touches the floor with a contact shadow');
      expect(prompt).not.toMatch(/touches the road|road layout|vegetation/);
      expect(prompt).toContain('Everything the camera reveals belongs to this same place: same walls, windows and floor; nothing from another city or country.');
    }
  });

  it('« (a bridge: its deck) » seulement sur un pont', () => {
    const onDeck = buildKeyframePrompt({ shot: shot({}), vehicle: 'GWM', lighting: 'day', format: '16:9', retryReason: null, onRoad: true, place: placeDescription(deck) });
    const onBoulevard = buildKeyframePrompt({ shot: shot({ locationPhotoId: boulevard.id }), vehicle: 'GWM', lighting: 'day', format: '16:9', retryReason: null, onRoad: true, place: placeDescription(boulevard) });
    expect(onDeck).toContain(ROAD_ALIGNED_BRIDGE);
    expect(onBoulevard).toContain(ROAD_ALIGNED);
    expect(onBoulevard).not.toContain('(a bridge: its deck)');
    expect(buildEndKeyframePrompt({ shot: shot({}), durationS: 5, format: '16:9', onRoad: true, place: placeDescription(deck) })).toContain(ROAD_ALIGNED_BRIDGE);
  });

  it('voiture vide : la cabine se voit par les vitres, comme le volant', () => {
    const keyframe = buildKeyframePrompt({ shot: shot({}), vehicle: 'GWM', lighting: 'day', format: '16:9', retryReason: null, excludePeople: true, ...driving });
    expect(keyframe).toContain('Nobody in or around the car; the empty cabin is visible through the windows.');
    expect(keyframe).toContain('the steering wheel, visible through the windows, is on the car’s left side');
    expect(keyframe).not.toContain('dark or reflective');
  });

  it('juge de l’image clé et de l’image de fin : pas de tolérance d’entrée ou de sortie du cadre ; le clip la garde', () => {
    const crossing = shot({ travelDirection: 'left_to_right', locationPhotoId: boulevard.id });
    const brief = { framingRules: true, frameChecks: 2 };
    const keyframeJudge = buildKeyframeQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, framing: framingCriterionOf(brief, crossing, 'still'), plan: crossing });
    const clipJudge = buildVideoQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, excludePeople: true, moving: true, framing: framingCriterionOf(brief, crossing), plan: crossing });
    expect(keyframeJudge).toContain('The whole car must stay inside the frame: a car cut by a frame edge is blocking.');
    expect(keyframeJudge).not.toContain('enters or leaves');
    expect(clipJudge).toContain('except while it enters or leaves it in this crossing shot');
    // Versions launched before keep their keyframe judge.
    expect(framingCriterionOf({ framingRules: true }, crossing, 'still')?.crossing).toBe(true);
  });

  it('juge de l’image de fin : cadrage, effet collé et véhicule en trop pour les nouvelles versions', () => {
    const current = shot({});
    const strict = buildEndKeyframeQualityPrompt({ framing: framingCriterionOf({ framingRules: true, frameChecks: 2 }, current, 'still') });
    expect(strict).toContain('Requested framing (a criterion): "Wide front three-quarter".');
    expect(strict).toContain(INTEGRATION_CHECK);
    expect(strict).toContain(NO_EXTRA_VEHICLE_CHECK);
    const legacy = buildEndKeyframeQualityPrompt({});
    expect(legacy).not.toContain(INTEGRATION_CHECK);
    expect(legacy).not.toContain('Requested framing');
    expect(buildEndKeyframePrompt({ shot: current, durationS: 5, format: '16:9', strictFrames: true })).toContain('Whole car in frame');
    expect(buildEndKeyframePrompt({ shot: current, durationS: 5, format: '16:9' })).not.toContain('Whole car in frame');
  });
});

describe('marche avant seulement (essai B du 24/10, règle perdue au retour en arrière du 25/10)', () => {
  it('les générateurs interdisent marche arrière et demi-tour, sans bloc en plus', () => {
    for (const speed of ['slow', 'cruise', 'dynamic'] as const) {
      const animation = buildKeyframeAnimationPrompt({ shot: shot({ travelSpeed: speed }), vehicle: 'GWM', durationS: 5, mood: '', lighting: 'day' });
      expect(animation).toContain('no drift, skid, spin, reversing, U-turn, sharp turn');
    }
    expect(buildKeyframeAnimationPrompt({ shot: shot({ shotType: 'hero', travelSpeed: 'slow' }), vehicle: 'GWM', durationS: 5, mood: '', lighting: 'day' })).toContain('Calm arrival: the car stays in its lane and follows the road, slowing down gently and evenly; no drift, skid, spin, reversing, U-turn, sharp turn or sudden braking.');
    expect(buildEndKeyframePrompt({ shot: shot({}), durationS: 5, format: '16:9' })).toContain('with the car having driven forward closer to the camera');
    // A stopped car gets no driving sentence.
    expect(buildKeyframeAnimationPrompt({ shot: shot({ shotType: 'hero', travelDirection: 'static' }), vehicle: 'GWM', durationS: 5, mood: '', lighting: 'day' })).not.toContain('reversing');
  });

  it('les juges bloquent une voiture qui recule ou fait demi-tour', () => {
    const clip = buildVideoQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, excludePeople: true, moving: true, plan: shot({}) });
    expect(clip).toContain('going another way, driving backwards, turning round or not moving is blocking');
    expect(clip).toContain('a car that drives backwards or turns round;');
    const strict = buildEndKeyframeQualityPrompt({ framing: framingCriterionOf({ framingRules: true, frameChecks: 2 }, shot({}), 'still') });
    expect(strict).toContain('a car turned round, or one that would have to drive backwards from image 2, is blocking');
    // Versions launched before keep their end-frame judge.
    expect(buildEndKeyframeQualityPrompt({})).not.toContain('drive backwards');
  });

  it('le réalisateur ne peut pas écrire une marche arrière ; un travelling arrière de la caméra reste permis', () => {
    const base = { scene: 'SUV on the deck', framing: 'Wide', location: 'HKB bridge deck', camera: 'Static camera' };
    expect(forbiddenShotText({ ...base, action: 'The SUV reverses towards the pylon' })).toBe('reverses');
    expect(forbiddenShotText({ ...base, action: 'The SUV makes a U-turn on the deck' })).toBe('u-turn');
    expect(forbiddenShotText({ ...base, action: 'The SUV backs up slowly' })).toBe('backs up');
    expect(forbiddenShotText({ ...base, action: 'The SUV drives towards the camera', camera: 'Reverse tracking shot, the camera pulls back in front of the car' })).toBeNull();
  });

  it('la liste fermée signale la marche arrière, pas la caméra qui recule', () => {
    const context = { placeTimes: ['day' as const], hasInteriorPhoto: false };
    expect(detectBriefConflicts('La voiture fait demi-tour sur le pont.', context)).toEqual([{ id: 'reverse', message: 'Marche arrière ou demi-tour demandé : la voiture roule toujours en marche avant.' }]);
    expect(detectBriefConflicts('Elle recule jusqu’au parking.', context).map((conflict) => conflict.id)).toEqual(['reverse']);
    expect(detectBriefConflicts('Travelling arrière : la caméra recule devant la voiture qui avance.', context)).toEqual([]);
  });
});
