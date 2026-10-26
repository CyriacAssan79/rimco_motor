import { describe, expect, it } from 'vitest';
import { locationCatalog, PLACE_DESCRIPTION_MAX_CHARS, placeDescription } from '@/core/assets/location-catalog';
import { loadBrandSettings, storedBrandMarket, storedSteeringSide } from '@/core/brand-market';
import { buildEndKeyframePrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt } from '@/core/providers/fal-keyframes';
import { IMAGE_PROMPT_MAX_CHARS, placeRule, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { buildStoryboardInstruction, shotDraftSchema } from '@/core/storyboard';

const bridge = locationCatalog[0];
const market = 'Abidjan, Côte d’Ivoire';
const shot = shotDraftSchema.parse({ title: 'Pont', shotType: 'rolling', travelDirection: 'towards_camera', travelSpeed: 'cruise', scene: 'SUV on the HKB bridge', framing: 'Wide', location: 'HKB bridge', action: 'The SUV passes the white pylons', camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: bridge.id });

describe('cadre · ville de la marque', () => {
  it('lit la ville et le côté du volant en base et ne bloque pas avant la migration 0031', async () => {
    expect(await loadBrandSettings(Promise.resolve({ data: { market_location: market, steering_side: 'left' }, error: null }))).toEqual({ marketLocation: market, steeringSide: 'left' });
    expect(await loadBrandSettings(Promise.resolve({ data: { market_location: '', steering_side: 'milieu' }, error: null }))).toEqual({});
    expect(await loadBrandSettings(Promise.resolve({ data: null, error: { message: 'column brands.market_location does not exist' } }))).toEqual({});
  });

  it('relit la ville et le côté du volant figés dans la version', () => {
    expect(storedBrandMarket({ marketLocation: market })).toBe(market);
    expect(storedBrandMarket({})).toBeUndefined();
    expect(storedSteeringSide({ steeringSide: 'left' })).toBe('left');
    expect(storedSteeringSide({ steeringSide: 'centre' })).toBeUndefined();
  });
});

describe('cadre · description des lieux', () => {
  it('décrit un lieu intégré par sa ville et la description anglaise de sa fiche, un lieu importé par son titre', () => {
    expect(placeDescription(bridge)).toBe('HKB bridge (Henri-Konan-Bédié), Abidjan. Aerial view of the white single-pylon cable-stayed HKB bridge over the Ebrie lagoon, Plateau towers behind');
    expect(placeDescription({ id: 'x', title: 'Marché de Treichville', category: 'Abidjan · marché' })).toBe('Marché de Treichville · Abidjan · marché');
  });

  it('reste courte et sans balises', () => {
    const long = placeDescription({ id: 'x', title: `<b>${'Avenue '.repeat(60)}</b>` });
    expect(long.length).toBeLessThanOrEqual(PLACE_DESCRIPTION_MAX_CHARS);
    expect(long).not.toMatch(/[<>]/);
  });
});

describe('cadre · réalisateur', () => {
  const vehiclePhotos = [{ id: 'front', role: 'exterior', title: 'Avant', angle: 'Avant trois-quarts' }];
  const places = [{ id: bridge.id, title: bridge.title, timeOfDay: 'day' as const, description: placeDescription(bridge) }];

  it('prend la ville dans les réglages de la marque, plus jamais en dur', () => {
    expect(buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, places, format: '16:9', marketLocation: market })).toContain(`car commercial for RIMCO Motors in ${market}, 16:9`);
    expect(buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, places, format: '16:9' })).not.toContain('Côte d');
  });

  it('impose un lieu listé à chaque plan et décrit chaque lieu', () => {
    const instruction = buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, places, format: '16:9', marketLocation: market });
    expect(instruction).toContain('locationPhotoId from the listed places (never null)');
    expect(instruction).toContain('"description":"HKB bridge (Henri-Konan-Bédié), Abidjan.');
    expect(instruction.length).toBeLessThan(4_000); // 26/10: + the priority rule and briefConflicts (readability budget, no engine limit).
  });
});

describe('cadre · prompts et juges', () => {
  const place = placeDescription(bridge);

  it('demande que tout ce que la caméra révèle reste dans le lieu choisi', () => {
    expect(placeRule(place, market)).toContain(`(${market})`);
    const animation = buildKeyframeAnimationPrompt({ shot, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: 'premium', lighting: 'day', excludePeople: true, place, market });
    expect(animation).toContain('Everything the camera reveals belongs to this same place');
    expect(animation.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
    const keyframe = buildKeyframePrompt({ shot, vehicle: 'GWM Tank 300 gris', lighting: 'day', format: '16:9', retryReason: null, hasLocationReference: true, excludePeople: true, place, market });
    expect(keyframe).toContain('Place: HKB bridge (Henri-Konan-Bédié), Abidjan');
    expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
    expect(buildEndKeyframePrompt({ shot, durationS: 5, format: '16:9', excludePeople: true, place, market })).toContain('Place: HKB bridge');
  });

  it('tient sous la limite Kling même avec un plan très long, des personnes et une reprise', () => {
    const long = shotDraftSchema.parse({ ...shot, action: 'A'.repeat(400), camera: 'B'.repeat(400), scene: 'C'.repeat(400) });
    const prompt = buildKeyframeAnimationPrompt({ shot: long, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: 'premium and confident', lighting: 'golden hour', castDescription: 'D'.repeat(400), place, market, retryReason: 'E'.repeat(300), maxLength: 2_500 });
    expect(prompt.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
    expect(prompt).toContain('Place: HKB bridge');
    const image = buildKeyframePrompt({ shot: long, vehicle: 'GWM Tank 300 gris', lighting: 'golden hour', format: '16:9', retryReason: 'E'.repeat(300), vehicleReferenceCount: 4, hasLocationReference: true, castDescription: 'D'.repeat(400), place, market });
    expect(image.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
  });

  it('fait juger bloquant un décor d’une autre ville, sur l’image clé comme sur le clip', () => {
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true })).toContain('from another city or country are blocking');
    const video = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, durationS: 5 });
    expect(video).toContain('from another city or country are blocking');
    expect(video).toContain('a setting from another city or country');
  });

  it('ne change rien pour une vidéo créée avant (sans description de lieu)', () => {
    expect(buildKeyframeAnimationPrompt({ shot, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: '', lighting: 'day', excludePeople: true })).not.toContain('Place:');
  });
});
