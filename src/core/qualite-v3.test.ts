import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSubmit = vi.fn();
vi.mock('@fal-ai/client', () => ({ createFalClient: () => ({ queue: { submit: mockSubmit } }) }));

import {
  buildEndKeyframePrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt,
  keyframeVideoProviders, KEYFRAME_VIDEO_ENDPOINTS, needsEndKeyframe, NO_READABLE_TEXT_CHECK, travelSentence, WHEEL_PHYSICS,
} from '@/core/providers/fal-keyframes';
import { NO_TEXT_IMAGE, NO_TEXT_VIDEO } from '@/core/prompts/rules';
import { buildSingleShotStoryboardInstruction, buildStoryboardInstruction, shotDraftSchema, validateStoryboardCast, type StoryboardShot } from '@/core/storyboard';
import { peopleForShot, withCastReferences } from '@/core/versions/casting';
import { chooseMontageFps, makeMultiClipMontageArgs, parseFfmpegFps } from '@/core/postproduction/ffmpeg-args';
import { montageFailureDecision, MAX_MONTAGE_ATTEMPTS } from '@/core/postproduction/montage-failure';
import { nominalVideoCostUsd } from '@/core/billing/video-cap';
import { keyframeImageUploadTarget } from '@/core/storage/keyframe-image';

const rolling: StoryboardShot = {
  title: 'Suivi', shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'cruise',
  scene: 'Lagoon boulevard', framing: 'Medium wide', location: 'Abidjan', action: 'The SUV passes the lamp posts', camera: 'Static camera, slow pan',
  durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place',
};
const hero: StoryboardShot = { ...rolling, title: 'Héros', shotType: 'hero', travelDirection: 'static' };

beforeEach(() => mockSubmit.mockReset());

describe('P1 · Kling O3 Pro image-to-video', () => {
  it('envoie image_url (et non start_image_url), comme la doc fal et fal-kling.ts', async () => {
    mockSubmit.mockResolvedValue({ request_id: 'kling-1' });
    await keyframeVideoProviders.kling.submit({ prompt: 'p', referenceImageUrls: ['https://a/start.png'], durationS: 5, aspectRatio: '16:9' }, 'key');
    const input = mockSubmit.mock.calls[0][1].input;
    expect(mockSubmit.mock.calls[0][0]).toBe(KEYFRAME_VIDEO_ENDPOINTS.kling);
    expect(input.image_url).toBe('https://a/start.png');
    expect(input).not.toHaveProperty('start_image_url');
    expect(input).not.toHaveProperty('end_image_url');
  });

  it('transmet l’image de fin aux trois moteurs quand elle existe', async () => {
    mockSubmit.mockResolvedValue({ request_id: 'x' });
    for (const family of ['wan', 'kling', 'seedance'] as const) {
      await keyframeVideoProviders[family].submit({ prompt: 'p', referenceImageUrls: ['https://a/start.png'], endImageUrl: 'https://a/end.png', durationS: 5, aspectRatio: '16:9' }, 'key');
    }
    expect(mockSubmit.mock.calls.map((call) => call[1].input.end_image_url)).toEqual(['https://a/end.png', 'https://a/end.png', 'https://a/end.png']);
  });
});

describe('P3 · mouvement naturel', () => {
  it('lit le sens et la vitesse avec tolérance, sans faire échouer le storyboard', () => {
    expect(shotDraftSchema.parse({ ...rolling, travelDirection: 'Left to right', travelSpeed: 'Cruising' }).travelDirection).toBe('left_to_right');
    const unknown = shotDraftSchema.parse({ ...rolling, travelDirection: 'zigzag', travelSpeed: 'warp' });
    expect(unknown.travelDirection).toBeUndefined();
    expect(unknown.travelSpeed).toBeUndefined();
  });

  it('écrit une phrase de déplacement contraignante', () => {
    expect(travelSentence(rolling)).toBe('The car travels from left to right across the frame at a steady cruising speed.');
    expect(travelSentence(hero)).toContain('stopped');
    expect(travelSentence({ shotType: 'rolling' })).toBe('');
  });

  it('impose la physique des roues aux plans roulants seulement, sans travelling à vitesse égale', () => {
    const moving = buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'Haval H6', durationS: 5, mood: 'premium', lighting: 'day' });
    expect(moving).toContain(WHEEL_PHYSICS);
    expect(moving).toContain('covers ground');
    expect(moving).not.toContain('at matching speed');
    const still = buildKeyframeAnimationPrompt({ shot: hero, vehicle: 'Haval H6', durationS: 5, mood: 'premium', lighting: 'day' });
    expect(still).not.toContain(WHEEL_PHYSICS);
  });

  it('demande au réalisateur sens, vitesse, raccord de direction et des mouvements où le déplacement se voit', () => {
    const base = { durationSeconds: 20 as const, mode: 'premium' as const, vehicle: 'Haval H6', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }], places: [], purpose: 'advertising' as const, format: '16:9' as const };
    const instruction = buildStoryboardInstruction(base);
    expect(instruction).toContain('travelDirection');
    expect(instruction).toContain('One screen direction for the whole film');
    expect(instruction).toContain('At most one side_tracking');
  });

  it('contrôle que la voiture avance dans les plans roulants', () => {
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: false, excludePeople: true, shotType: 'rolling' })).toContain('while only the background slides');
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: false, excludePeople: true, shotType: 'detail' })).not.toContain('while only the background slides');
  });
});

describe('P6 · aucun texte dans les décors', () => {
  it('rend vierges les enseignes du lieu dans l’image clé et l’animation', () => {
    const still = buildKeyframePrompt({ shot: rolling, vehicle: 'Haval H6', lighting: 'day', format: '16:9', retryReason: null, vehicleReferenceCount: 2, hasLocationReference: true });
    expect(still).toContain(NO_TEXT_IMAGE);
    expect(buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'Haval H6', durationS: 5, mood: 'm', lighting: 'l' })).toContain(NO_TEXT_VIDEO);
  });

  it('fait signaler par les juges tout texte lisible, y compris recopié du lieu', () => {
    expect(NO_READABLE_TEXT_CHECK).toContain('copied from the location reference');
    expect(NO_READABLE_TEXT_CHECK).toContain('Never set "approved" to false because of text alone');
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true })).toContain(NO_READABLE_TEXT_CHECK);
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: false })).toContain(NO_READABLE_TEXT_CHECK);
  });
});

describe('P2 · casting', () => {
  const brief = { castAssets: [{ id: 'awa', title: 'Awa, 30 ans, chemise blanche', path: 'u/awa.jpg' }, { id: 'kofi', title: 'Kofi, 35 ans', path: 'u/kofi.jpg' }] };

  it('n’accepte que les personnes du casting sélectionné', () => {
    expect(validateStoryboardCast([{ ...rolling, castIds: ['awa'] }], ['awa'])).toBe(true);
    expect(() => validateStoryboardCast([{ ...rolling, castIds: ['inconnu'] }], ['awa'])).toThrow('casting');
  });

  it('montre seulement les personnes du plan, et personne quand la liste est vide', () => {
    const withAwa = peopleForShot(brief, { ...rolling, castIds: ['awa'] });
    expect(withAwa.excludePeople).toBe(false);
    expect(withAwa.castTitles).toEqual(['Awa, 30 ans, chemise blanche']);
    expect(peopleForShot(brief, { ...rolling, castIds: [] }).excludePeople).toBe(true);
  });

  it('ordonne les références : véhicule, casting, lieu en dernier', () => {
    expect(withCastReferences(['front', 'side', 'place'], ['awa'], 'place')).toEqual(['front', 'side', 'awa', 'place']);
    expect(withCastReferences(['front'], ['awa', 'kofi'], null)).toEqual(['front', 'awa', 'kofi']);
  });

  it('numérote les photos de casting entre le véhicule et le lieu pour le juge', () => {
    const prompt = buildKeyframeQualityPrompt({ vehicleReferenceCount: 2, hasLocationReference: true, castTitles: ['Awa'] });
    expect(prompt).toContain('images 2 to 3 = approved views');
    expect(prompt).toContain('image 4 = approved casting photo of person 1 (Awa)');
    expect(prompt).toContain('image 5 = selected location');
    expect(prompt).toContain('same face, skin tone, hairstyle');
  });

  it('demande les mêmes visages et tenues dans l’image clé et l’animation', () => {
    const still = buildKeyframePrompt({ shot: rolling, vehicle: 'Haval H6', lighting: 'day', format: '16:9', retryReason: null, vehicleReferenceCount: 1, hasLocationReference: true, castTitles: ['Awa'] });
    expect(still).toContain('images 2-2 = casting photos');
    expect(still).toContain('same face, hair, skin tone and clothes');
    const motion = buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'Haval H6', durationS: 5, mood: 'm', lighting: 'l', castTitles: ['Awa'] });
    expect(motion).toContain('Same people as in the first frame');
  });

  it('sans casting, réutilise la fiche texte du réalisateur dans chaque plan', () => {
    const people = peopleForShot({ character: 'Une famille', user_direction: 'Une famille part à Assinie', castDescription: 'Woman, 35, short natural hair, white linen dress' }, rolling);
    expect(people.excludePeople).toBe(false);
    expect(buildKeyframePrompt({ shot: rolling, vehicle: 'H6', lighting: 'day', format: '16:9', retryReason: null, castDescription: people.castDescription })).toContain('white linen dress');
  });

  it('donne la liste du casting au réalisateur, ou lui demande une fiche texte', () => {
    const base = { durationSeconds: 5 as const, vehicle: 'H6', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }], places: [], purpose: 'advertising' as const };
    expect(buildSingleShotStoryboardInstruction({ ...base, cast: [{ id: 'awa', title: 'Awa' }] })).toContain('"id":"awa"');
    expect(buildSingleShotStoryboardInstruction(base)).toContain('castDescription');
  });
});

describe('P4 · cadence du montage', () => {
  it('lit la cadence affichée par ffmpeg', () => {
    expect(parseFfmpegFps('Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 1280x720, 2000 kb/s, 30 fps, 30 tbr, 15360 tbn')).toBe(30);
    expect(parseFfmpegFps('Stream #0:0: Video: h264, 24 tbr')).toBe(24);
    expect(parseFfmpegFps('no video')).toBeNull();
  });

  it('garde la cadence dominante au lieu de forcer 24 i/s', () => {
    expect(chooseMontageFps([30, 29.97, 24])).toBe(30);
    expect(chooseMontageFps([23.976, 24, 30])).toBe(24);
    expect(chooseMontageFps([24, 30])).toBe(30);
    expect(chooseMontageFps([null, 16])).toBe(24);
  });

  it('applique la cadence choisie à tout le montage, logo compris', () => {
    const args = makeMultiClipMontageArgs({ shotFiles: ['a.mp4', 'b.mp4'], shotDurations: [5, 5], logoFile: 'logo.png', outputFile: 'out.mp4', finalDurationSeconds: 12, clipDurationSeconds: 10, fps: 30 });
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).toContain('fps=30[v0]');
    expect(filter).toContain(':r=30:d=2[card]');
    expect(args[args.indexOf('-r') + 1]).toBe('30');
  });
});

describe('P5 · image de fin des plans roulants', () => {
  it('ne concerne que les plans en déplacement, et seulement si le réglage est actif', () => {
    expect(needsEndKeyframe(rolling, true)).toBe(true);
    expect(needsEndKeyframe(rolling, false)).toBe(false);
    expect(needsEndKeyframe(hero, true)).toBe(false);
    expect(needsEndKeyframe({ ...rolling, travelDirection: 'static' }, true)).toBe(false);
  });

  it('décrit la même prise, voiture plus loin dans son sens de marche', () => {
    const prompt = buildEndKeyframePrompt({ shot: rolling, durationS: 5, format: '16:9', excludePeople: true });
    expect(prompt).toContain('further to the right along the road');
    expect(prompt).toContain('every sign in the place is blank');
    expect(buildKeyframeAnimationPrompt({ shot: rolling, vehicle: 'H6', durationS: 5, mood: 'm', lighting: 'l', hasEndFrame: true })).toContain('exact last frame');
  });

  it('stocke l’image de fin à côté de l’image clé', () => {
    expect(keyframeImageUploadTarget({ videoId: 'v', versionId: 'r', shotNumber: 2, contentType: 'image/png', variant: 'end' }).path).toBe('v/r/keyframe-2-end.png');
    expect(keyframeImageUploadTarget({ videoId: 'v', versionId: 'r', shotNumber: 2, contentType: 'image/png' }).path).toBe('v/r/keyframe-2.png');
  });
});

describe('P8 · coût des images de fin', () => {
  it('ajoute image et contrôle de chaque image de fin au coût nominal', () => {
    const base = { generatedSeconds: 20, videoPriceUsdPerSecond: 0.473, shotCount: 4, keyframeImageCostUsd: 0.08, keyframeQualityCostUsd: 0.05, videoQualityCostUsd: 0.05, storyboardCostUsd: 0 };
    const without = nominalVideoCostUsd(base);
    const withEnd = nominalVideoCostUsd({ ...base, endFrameCount: 3, endFrameCostUsd: 0.13 });
    expect(withEnd.totalUsd - without.totalUsd).toBeCloseTo(0.39, 4);
  });
});

describe('P7 · échec de montage visible', () => {
  it('compte les tentatives et passe en échec à la troisième', () => {
    expect(montageFailureDecision(undefined, 'boom')).toMatchObject({ attempts: 1, final: false });
    expect(montageFailureDecision(MAX_MONTAGE_ATTEMPTS - 1, 'Impossible de démarrer FFmpeg : spawn ENOENT')).toMatchObject({ attempts: 3, final: true });
    expect(montageFailureDecision(2, 'spawn ENOENT').userMessage).toContain('FFmpeg ou le logo est introuvable');
    expect(montageFailureDecision(0, 'La post-production dépasse le délai autorisé.').userMessage).toContain('délai');
  });
});

describe('Réglage KEYFRAME_END_FRAME_ROLLING', () => {
  const original = process.env.KEYFRAME_END_FRAME_ROLLING;
  afterEach(() => {
    if (original === undefined) delete process.env.KEYFRAME_END_FRAME_ROLLING; else process.env.KEYFRAME_END_FRAME_ROLLING = original;
    vi.resetModules();
  });
  it.each([[undefined, false], ['', false], ['false', false], ['true', true], ['1', true], [' OUI ', true]])('%j donne %j', async (raw, expected) => {
    vi.resetModules();
    if (raw === undefined) delete process.env.KEYFRAME_END_FRAME_ROLLING; else process.env.KEYFRAME_END_FRAME_ROLLING = raw;
    const { env } = await import('@/env');
    expect(env.KEYFRAME_END_FRAME_ROLLING).toBe(expected);
  });
});
