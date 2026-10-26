import type { PlaceTimeOfDay } from '@/core/motion/place-motion';
import { scenePresets } from './catalog';

/**
 * 26/10 · the Studio light and mood chips (French, from the scene catalogue) as English sentences for the prompts.
 * Only catalogue values exist here: any other value is ignored, so no free text from the brief can reach the locked
 * layer (director system prompt, generator prompts).
 */
const LIGHTING_EN: Record<string, { text: string; timeOfDay: PlaceTimeOfDay }> = {
  'Lumière naturelle claire du matin': { text: 'Clear natural morning light', timeOfDay: 'day' },
  'Lumière douce du début de matinée': { text: 'Soft early-morning light', timeOfDay: 'golden' },
  'Lumière de lever du jour, douce et réaliste': { text: 'Soft, realistic sunrise light', timeOfDay: 'golden' },
  'Lumière douce de fin de journée': { text: 'Soft late-afternoon light', timeOfDay: 'golden' },
  'Éclairage de soirée doux, sans couleurs artificielles excessives': { text: 'Soft evening lighting without excessive artificial colours', timeOfDay: 'night' },
  'Nuit urbaine avec éclairage doux et réaliste': { text: 'Urban night with soft, realistic street lighting', timeOfDay: 'night' },
  'Lumière intérieure diffuse et régulière': { text: 'Even, diffuse interior light', timeOfDay: 'interior' },
};

const MOOD_EN: Record<string, string> = {
  'Élégant, moderne et rassurant': 'Elegant, modern and reassuring',
  'Premium, sobre et contemporain': 'Premium, understated and contemporary',
  'Libre, élégant et apaisant': 'Free, elegant and soothing',
  'Confiant, polyvalent et premium': 'Confident, versatile and premium',
  'Évasion, confort et maîtrise': 'Escape, comfort and control',
  'Robuste, fiable et professionnel': 'Rugged, reliable and professional',
  'Puissant, fiable et maîtrisé': 'Powerful, reliable and controlled',
  'Sûr, accueillant et fiable': 'Safe, welcoming and reliable',
  'Précis, puissant et professionnel': 'Precise, powerful and professional',
  'Moderne, naturel et rassurant': 'Modern, natural and reassuring',
  'Ouvert, lumineux et désirable': 'Open, bright and desirable',
  'Précis, premium et rassurant': 'Precise, premium and reassuring',
  'Chaleureux, fiable et accessible': 'Warm, reliable and approachable',
  'Nouveau, confiant et ambitieux': 'New, confident and ambitious',
  'Présent, élégant et mémorable': 'Striking, elegant and memorable',
};

/** Light chips and moods offered by the Studio (the scene catalogue): the only values the routes accept. */
export const catalogLightings: readonly string[] = [...new Set(scenePresets.map((scene) => scene.lighting))];
export const catalogMoods: readonly string[] = [...new Set(scenePresets.map((scene) => scene.mood))];

/** Zod-friendly filter: a catalogue value is kept, anything else becomes '' without error (cached Studio pages keep working). */
export const onlyCatalogLighting = (value: string) => catalogLightings.includes(value.trim()) ? value.trim() : '';
export const onlyCatalogMood = (value: string) => catalogMoods.includes(value.trim()) ? value.trim() : '';

/** English light sentence and its time of day for a Studio chip; null for anything else. */
export function lightingForPrompt(value: string | null | undefined): { text: string; timeOfDay: PlaceTimeOfDay } | null {
  return LIGHTING_EN[(value ?? '').trim()] ?? null;
}

const FRENCH_LIGHT = /[àâçéèêëîïôûùüÿœ]|lumi[eè]re|\bnuit\b|\bjour\b|\bmatin\b|\bsoir/i;

/**
 * Light sentence of a keyframe prompt: the English sentence resolved for the shot, a chip translated, or the neutral
 * light when an older version stored a French or unknown text (26/10).
 */
export function lightingSentence(value: string | null | undefined): string {
  const light = (value ?? '').trim();
  return lightingForPrompt(light)?.text ?? (light && !FRENCH_LIGHT.test(light) ? light : 'Natural light matching the selected location photo');
}

/** English mood for a Studio chip, an English mood already translated, or '' (free text is never sent). */
export function moodForPrompt(value: string | null | undefined): string {
  const mood = (value ?? '').trim();
  return MOOD_EN[mood] ?? (Object.values(MOOD_EN).includes(mood) ? mood : '');
}
