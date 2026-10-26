import { describe, expect, it } from 'vitest';
import { ANIMATION_PROMPT_MAX_LENGTH, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt, GROUND_CONTACT, NO_BODYWORK_CONTACT, parseKeyframeQuality, SAME_PLACE_CHECK, videoQualityTimestamps } from '@/core/providers/fal-keyframes';
import { buildSingleShotStoryboardInstruction, type StoryboardShot } from '@/core/storyboard';
import { collectQualityWarnings, storedQualityWarnings, warningIssues } from '@/core/versions/quality-gate';
import { clipLoopDecision, keyframeLoopDecision } from '@/core/verification/loop';

const rolling: StoryboardShot = { title: 'Suivi', shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'cruise', scene: 's', framing: 'f', location: 'l', action: 'a', camera: 'c', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place' };
const ok = { approved: true, issues: [], reason: 'OK' };
const refused = { approved: false, issues: ['Roue de secours arrière absente'], reason: 'Détail manquant' };

describe('E · avertissements (la décision est dans la boucle de vérification depuis le 25/10)', () => {
  it('un plan encore refusé attend une décision humaine au lieu de passer avec un avertissement', () => {
    expect(keyframeLoopDecision(refused, 2, 2)).toBe('review');
    expect(clipLoopDecision(refused, 1)).toBe('review');
    expect(keyframeLoopDecision(ok, 0, 2)).toBe('accept');
  });

  it('relit les avertissements stockés sur les plans', () => {
    const warnings = collectQualityWarnings([
      { shot_number: 1, title: 'A', keyframe_quality: { ...refused, warning: true, warningIssues: ['Roue de secours arrière absente'] }, video_quality: null },
      { shot_number: 2, title: 'B', keyframe_quality: ok, video_quality: { ...ok, warning: true, warningIssues: ['t=2.5s minor: reflet'] } },
    ]);
    expect(warnings).toEqual([
      { shotNumber: 1, title: 'A', stage: 'keyframe', issues: ['Roue de secours arrière absente'] },
      { shotNumber: 2, title: 'B', stage: 'video', issues: ['t=2.5s minor: reflet'] },
    ]);
  });

  it('relit les avertissements figés dans la version pour le valideur, en ignorant les entrées invalides', () => {
    expect(storedQualityWarnings({ qualityWarnings: [
      { shotNumber: 3, title: 'Héros', stage: 'video', issues: ['Roue arrière figée', 42] },
      { shotNumber: 4, stage: 'autre', issues: [] },
      null,
    ] })).toEqual([{ shotNumber: 3, title: 'Héros', stage: 'video', issues: ['Roue arrière figée'] }]);
    expect(storedQualityWarnings({})).toEqual([]);
    expect(storedQualityWarnings(null)).toEqual([]);
  });
});

describe('A · le texte n’empêche plus la génération', () => {
  const text = { ...ok, readableText: true };
  it('image clé : une reprise « enseignes vierges », puis avertissement', () => {
    expect(keyframeLoopDecision(text, 0, 2)).toBe('retry_image');
    expect(keyframeLoopDecision(text, 1, 2)).toBe('accept_with_warning');
    expect(warningIssues(text)).toEqual(['Texte visible dans le décor']);
  });
  it('clip : jamais de relance payante pour du texte seul', () => {
    expect(clipLoopDecision(text, 0)).toBe('accept_with_warning');
  });
  it('lit le champ readableText du juge', () => {
    expect(parseKeyframeQuality('{"approved":true,"issues":[],"reason":"OK","readableText":true}')?.readableText).toBe(true);
    expect(parseKeyframeQuality('{"approved":true,"issues":[],"reason":"OK"}')?.readableText).toBeUndefined();
  });
});

describe('F · juge du lieu recalibré', () => {
  it('accepte un autre point de vue du même lieu', () => {
    expect(SAME_PLACE_CHECK).toContain('another angle or another part of the same setting is normal');
    // 26/10: about the place only, so that it never excuses a badly framed car.
    expect(SAME_PLACE_CHECK).not.toMatch(/framing|crop/);
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true })).toContain(SAME_PLACE_CHECK);
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: false })).not.toContain(SAME_PLACE_CHECK);
  });
});

describe('B · contact pneu-route', () => {
  it('impose le contact au sol dans l’image clé et l’animation, plan à l’arrêt compris', () => {
    expect(buildKeyframePrompt({ shot: rolling, vehicle: 'H6', lighting: 'day', format: '16:9', retryReason: null })).toContain(GROUND_CONTACT);
    const hero = buildKeyframeAnimationPrompt({ shot: { ...rolling, shotType: 'hero', travelDirection: 'static' }, vehicle: 'H6', durationS: 5, mood: 'm', lighting: 'l' });
    expect(hero).toContain(GROUND_CONTACT);
    expect(buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'H6', durationS: 5, mood: 'm', lighting: 'l' })).toContain('the body has weight');
  });
  it('évite les personnes appuyées sur la carrosserie', () => {
    expect(buildKeyframePrompt({ shot: { ...rolling, shotType: 'hero', travelDirection: 'static' }, vehicle: 'H6', lighting: 'day', format: '16:9', retryReason: null, castTitles: ['Awa'] })).toContain(NO_BODYWORK_CONTACT);
    expect(buildSingleShotStoryboardInstruction({ durationSeconds: 5, vehicle: 'H6', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }], places: [], purpose: 'advertising', cast: [{ id: 'awa', title: 'Awa' }] })).toContain('never leaning on the car');
  });
});

describe('C · juge vidéo daté, avec gros plans des roues', () => {
  it('répartit 5 images sur tout le clip et 2 gros plans', () => {
    expect(videoQualityTimestamps(5)).toEqual({ frames: [0.5, 1.5, 2.5, 3.5, 4.5], crops: [1.5, 3.5] });
    expect(videoQualityTimestamps(4).frames).toEqual([0.4, 1.2, 2, 2.8, 3.6]);
  });
  it('demande l’horodatage, la gravité et un refus seulement pour les défauts bloquants', () => {
    const prompt = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, shotType: 'rolling', durationS: 5 });
    expect(prompt).toContain('t=0.5s, 1.5s, 2.5s, 3.5s, 4.5s');
    expect(prompt).toContain('wheel and road zone');
    expect(prompt).toContain('"t=2.5s blocking: tyre floats"');
    expect(prompt).toContain('image 8 = approved base photo');
    expect(prompt).toContain('image 9 = selected location');
  });
  it('garde un clip approuvé avec des défauts mineurs, en avertissement', () => {
    expect(clipLoopDecision({ approved: true, issues: ['t=4.5s minor: reflet'], reason: 'OK' }, 0)).toBe('accept_with_warning');
  });
});

describe('Limite de longueur du prompt Kling (422 observé le 22/10)', () => {
  const animation = (shot: StoryboardShot, extra: Partial<Parameters<typeof buildKeyframeAnimationPrompt>[0]> = {}) => buildKeyframeAnimationPrompt({
    shot, vehicle: 'GWM TANK 300 Gris', durationS: 5, mood: 'Chaleureux, fiable et accessible', lighting: 'Lumière douce de fin de journée',
    castDescription: 'One woman driver, early 30s, medium-brown skin, slim build, short natural black hair. She wears a cream linen shirt with rolled sleeves, olive chino trousers and clean white leather sneakers. Same look in every shot.',
    ...extra,
  });

  it('tient sous 2 500 caractères le plan roulant qui dépassait chez Kling, sans rien retirer (v3.2)', () => {
    const full = animation(rolling);
    expect(full.length).toBeLessThanOrEqual(2000);
    const fitted = animation(rolling, { maxLength: ANIMATION_PROMPT_MAX_LENGTH.kling });
    expect(fitted).toBe(full);
    expect(fitted).toContain('Action: a.');
    expect(fitted).toContain('Tyres roll on the road without slipping');
    expect(fitted).toContain('Same people as in the first frame');
    expect(fitted).toContain('Mood:');
  });

  it('tient la limite dans le pire cas (champs au maximum, reprise et image de fin)', () => {
    const long = (size: number) => 'word '.repeat(size / 5).trim();
    const worst: StoryboardShot = { ...rolling, action: long(240), camera: long(240) };
    const fitted = animation(worst, { castDescription: long(400), retryReason: long(300), hasEndFrame: true, mood: long(160), lighting: long(160), maxLength: 2500 });
    expect(fitted.length).toBeLessThanOrEqual(2500);
  });

  it('laisse le prompt intact quand il tient ou quand le moteur n’a pas de limite', () => {
    const full = animation(rolling);
    expect(animation(rolling, { maxLength: ANIMATION_PROMPT_MAX_LENGTH.wan })).toBe(full);
    expect(animation(rolling, { maxLength: ANIMATION_PROMPT_MAX_LENGTH.seedance })).toBe(full);
    expect(animation(rolling, { maxLength: 10_000 })).toBe(full);
  });
});
