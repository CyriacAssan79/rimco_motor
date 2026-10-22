import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANIMATION_PROMPT_MAX_LENGTH, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt, GROUND_CONTACT, NO_BODYWORK_CONTACT, parseKeyframeQuality, SAME_PLACE_CHECK, videoQualityTimestamps } from '@/core/providers/fal-keyframes';
import { buildSingleShotStoryboardInstruction, type StoryboardShot } from '@/core/storyboard';
import { collectQualityWarnings, qualityDecision, storedQualityWarnings, warningIssues } from '@/core/versions/quality-gate';

const rolling: StoryboardShot = { title: 'Suivi', shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'cruise', scene: 's', framing: 'f', location: 'l', action: 'a', camera: 'c', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place' };
const ok = { approved: true, issues: [], reason: 'OK' };
const refused = { approved: false, issues: ['Roue de secours arrière absente'], reason: 'Détail manquant' };

describe('E · mode avertissement', () => {
  it('reprend une fois, puis garde le plan avec avertissement en mode warn', () => {
    expect(qualityDecision(refused, 0, { stage: 'keyframe', mode: 'warn' })).toBe('retry');
    expect(qualityDecision(refused, 1, { stage: 'keyframe', mode: 'warn' })).toBe('accept_with_warning');
    expect(qualityDecision(refused, 1, { stage: 'video', mode: 'warn' })).toBe('accept_with_warning');
  });

  it('retrouve le contrôle bloquant en mode block', () => {
    expect(qualityDecision(refused, 1, { stage: 'keyframe', mode: 'block' })).toBe('reject');
    expect(qualityDecision(ok, 0, { stage: 'keyframe', mode: 'block' })).toBe('accept');
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
    expect(qualityDecision(text, 0, { stage: 'keyframe', mode: 'block' })).toBe('retry');
    expect(qualityDecision(text, 1, { stage: 'keyframe', mode: 'block' })).toBe('accept_with_warning');
    expect(warningIssues(text)).toEqual(['Texte visible dans le décor']);
  });
  it('clip : jamais de relance payante pour du texte seul', () => {
    expect(qualityDecision(text, 0, { stage: 'video', mode: 'block' })).toBe('accept_with_warning');
  });
  it('lit le champ readableText du juge', () => {
    expect(parseKeyframeQuality('{"approved":true,"issues":[],"reason":"OK","readableText":true}')?.readableText).toBe(true);
    expect(parseKeyframeQuality('{"approved":true,"issues":[],"reason":"OK"}')?.readableText).toBeUndefined();
  });
});

describe('F · juge du lieu recalibré', () => {
  it('accepte un autre point de vue du même lieu', () => {
    expect(SAME_PLACE_CHECK).toContain('different camera viewpoint');
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true })).toContain(SAME_PLACE_CHECK);
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: false })).not.toContain(SAME_PLACE_CHECK);
  });
});

describe('B · contact pneu-route', () => {
  it('impose le contact au sol dans l’image clé et l’animation, plan à l’arrêt compris', () => {
    expect(buildKeyframePrompt({ shot: rolling, vehicle: 'H6', lighting: 'day', format: '16:9', retryReason: null })).toContain(GROUND_CONTACT);
    const hero = buildKeyframeAnimationPrompt({ shot: { ...rolling, shotType: 'hero', travelDirection: 'static' }, vehicle: 'H6', durationS: 5, mood: 'm', lighting: 'l' });
    expect(hero).toContain(GROUND_CONTACT);
    expect(buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'H6', durationS: 5, mood: 'm', lighting: 'l' })).toContain('without artificial bouncing');
  });
  it('évite les personnes appuyées sur la carrosserie', () => {
    expect(buildKeyframePrompt({ shot: rolling, vehicle: 'H6', lighting: 'day', format: '16:9', retryReason: null, castTitles: ['Awa'] })).toContain(NO_BODYWORK_CONTACT);
    expect(buildSingleShotStoryboardInstruction({ durationSeconds: 5, vehicle: 'H6', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }], places: [], purpose: 'advertising', cast: [{ id: 'awa', title: 'Awa' }] })).toContain('never lean on');
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
    expect(prompt).toContain('"t=2.5s blocking: tyre floats above the road"');
    expect(prompt).toContain('image 8 = approved base photo');
    expect(prompt).toContain('image 9 = selected location');
  });
  it('garde un clip approuvé avec des défauts mineurs, en avertissement', () => {
    expect(qualityDecision({ approved: true, issues: ['t=4.5s minor: reflet'], reason: 'OK' }, 0, { stage: 'video', mode: 'warn' })).toBe('accept_with_warning');
  });
});

describe('Réglage QUALITY_GATE_MODE', () => {
  const original = process.env.QUALITY_GATE_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.QUALITY_GATE_MODE; else process.env.QUALITY_GATE_MODE = original;
    vi.resetModules();
  });
  it.each([[undefined, 'warn'], ['', 'warn'], ['warn', 'warn'], ['BLOCK', 'block'], ['autre', 'warn']])('%j donne %j', async (raw, expected) => {
    vi.resetModules();
    if (raw === undefined) delete process.env.QUALITY_GATE_MODE; else process.env.QUALITY_GATE_MODE = raw;
    const { env } = await import('@/env');
    expect(env.QUALITY_GATE_MODE).toBe(expected);
  });
});

describe('Limite de longueur du prompt Kling (422 observé le 22/10)', () => {
  const animation = (shot: StoryboardShot, extra: Partial<Parameters<typeof buildKeyframeAnimationPrompt>[0]> = {}) => buildKeyframeAnimationPrompt({
    shot, vehicle: 'GWM TANK 300 Gris', durationS: 5, mood: 'Chaleureux, fiable et accessible', lighting: 'Lumière douce de fin de journée',
    castDescription: 'One woman driver, early 30s, medium-brown skin, slim build, short natural black hair. She wears a cream linen shirt with rolled sleeves, olive chino trousers and clean white leather sneakers. Same look in every shot.',
    ...extra,
  });

  it('ramène sous 2 500 caractères le plan roulant qui dépassait chez Kling', () => {
    const full = animation(rolling);
    expect(full.length).toBeGreaterThan(ANIMATION_PROMPT_MAX_LENGTH.kling!);
    const fitted = animation(rolling, { maxLength: ANIMATION_PROMPT_MAX_LENGTH.kling });
    expect(fitted.length).toBeLessThanOrEqual(2500);
    expect(fitted).toContain('Action: a.');
    expect(fitted).toContain('Tyres roll without slipping');
    expect(fitted).toContain('Keep exactly the same people');
    expect(fitted).toContain('Avoid morphing');
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
