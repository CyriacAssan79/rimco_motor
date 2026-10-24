import { describe, expect, it } from 'vitest';
import { locationCatalog, PLACE_DESCRIPTION_MAX_CHARS, placeDescription } from '@/core/assets/location-catalog';
import { buildEndKeyframePrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildVideoQualityPrompt } from '@/core/providers/fal-keyframes';
import { IMAGE_PROMPT_MAX_CHARS, placeRule, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { buildStoryboardInstruction, shotDraftSchema } from '@/core/storyboard';

const bridge = locationCatalog[0];
const scene = { trafficSide: 'right' as const, steeringSide: 'left' as const, marketLocation: 'Abidjan, Côte d’Ivoire' };
const shot = shotDraftSchema.parse({ title: 'Pont', motion: 'approach', travelDirection: 'towards_camera', travelSpeed: 'cruise', scene: 'SUV on the HKB bridge', framing: 'Wide', location: 'HKB bridge', action: 'The SUV passes the white pylons', camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: bridge.id });

describe('lieu · description envoyée aux modèles', () => {
  it('décrit un lieu intégré par sa ville et son décor, un lieu importé par son titre', () => {
    expect(placeDescription(bridge)).toBe('Abidjan, pont Henri-Konan-Bédié. Pont à haubans blanc, lagune Ébrié et skyline d’Abidjan en plein jour');
    expect(placeDescription({ id: 'x', title: 'Marché de Treichville', category: 'Abidjan · marché' })).toBe('Marché de Treichville · Abidjan · marché');
  });

  it('reste courte et sans balises', () => {
    const long = placeDescription({ id: 'x', title: `<b>${'Avenue '.repeat(60)}</b>` });
    expect(long.length).toBeLessThanOrEqual(PLACE_DESCRIPTION_MAX_CHARS);
    expect(long).not.toMatch(/[<>]/);
  });
});

describe('lieu · réalisateur', () => {
  const vehiclePhotos = [{ id: 'front', role: 'exterior', title: 'Avant', angle: 'Avant trois-quarts' }];
  const places = [{ id: bridge.id, title: bridge.title, timeOfDay: 'day' as const, description: placeDescription(bridge) }];

  it('prend la ville dans les réglages de la marque, plus jamais en dur', () => {
    const withMarket = buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, places, format: '16:9', marketLocation: 'Abidjan, Côte d’Ivoire' });
    expect(withMarket).toContain('car commercial for RIMCO Motors in Abidjan, Côte d’Ivoire, 16:9');
    expect(buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, places, format: '16:9' })).not.toContain('Côte d');
  });

  it('impose un lieu listé à chaque plan et décrit chaque lieu', () => {
    const instruction = buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos, places, format: '16:9' });
    expect(instruction).toContain('locationPhotoId from the listed places (never null)');
    expect(instruction).toContain('"description":"Abidjan, pont Henri-Konan-Bédié.');
  });
});

describe('lieu · prompts et juge', () => {
  const place = placeDescription(bridge);

  it('demande que tout ce que la caméra révèle reste dans le lieu choisi', () => {
    const rule = placeRule(place, scene.marketLocation);
    expect(rule).toContain('(Abidjan, Côte d’Ivoire)');
    expect(rule).toContain('nothing from another city or country');
    const animation = buildKeyframeAnimationPrompt({ shot, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: 'premium', lighting: 'day', excludePeople: true, scene, place });
    expect(animation).toContain('Everything the camera reveals belongs to this same place');
    expect(animation.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
    const keyframe = buildKeyframePrompt({ shot, vehicle: 'GWM Tank 300 gris', lighting: 'day', format: '16:9', retryReason: null, hasLocationReference: true, excludePeople: true, scene, place });
    expect(keyframe).toContain('Place: Abidjan, pont Henri-Konan-Bédié');
    expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
    expect(buildEndKeyframePrompt({ shot, durationS: 5, format: '16:9', excludePeople: true, scene, place })).toContain('Place: Abidjan');
  });

  it('tient sous la limite Kling même avec un plan très long et des personnes', () => {
    const long = shotDraftSchema.parse({ ...shot, action: 'A'.repeat(400), camera: 'B'.repeat(400), scene: 'C'.repeat(400) });
    const prompt = buildKeyframeAnimationPrompt({ shot: long, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: 'premium and confident', lighting: 'golden hour', castDescription: 'D'.repeat(400), scene, place, retryReason: 'E'.repeat(300), maxLength: 2_500 });
    expect(prompt.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
    expect(prompt).toContain('Right-hand traffic');
    expect(prompt).toContain('Place: Abidjan');
  });

  it('fait juger bloquant un décor d’une autre ville révélé par la caméra', () => {
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, motion: 'approach', durationS: 5 })).toContain('streets, buildings or road layout from another city or country are blocking');
  });

  it('ne change rien pour une vidéo créée avant (sans description de lieu)', () => {
    expect(buildKeyframeAnimationPrompt({ shot, vehicle: 'GWM Tank 300 gris', durationS: 5, mood: '', lighting: 'day', excludePeople: true })).not.toContain('Place:');
  });
});
