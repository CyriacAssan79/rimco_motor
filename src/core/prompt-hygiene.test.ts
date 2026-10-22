import { describe, expect, it } from 'vitest';
import { BRAND_COLOR_DIRECTION, compactStoryboardText, shotDraftSchema, vehicleDescriptionForPrompt } from '@/core/storyboard';
import { buildKeyframeAnimationPrompt, buildKeyframePrompt } from '@/core/providers/fal-keyframes';

const shot = shotDraftSchema.parse({ title: 'Suivi', shotType: 'rolling', scene: 'Lagoon boulevard', framing: 'Medium tracking shot', location: 'Pont HKB, Abidjan', action: 'The SUV drives toward camera', camera: 'Low gimbal tracking backward', durationSeconds: 5, vehiclePhotoId: 'photo-1', locationPhotoId: null });

describe('hygiène des prompts', () => {
  it('ne termine jamais un champ coupé sur un mot de liaison orphelin', () => {
    const framing = 'Plan large 16:9 en légère contre-plongée, à hauteur de phare. Le véhicule occupe environ la moitié de la largeur du cadre et reste net pendant tout le plan sans jamais sortir';
    const compact = compactStoryboardText(framing, 120);
    expect(compact.length).toBeLessThanOrEqual(121);
    expect(compact).toMatch(/[.!?]$/);
    expect(compact).not.toMatch(/\s(?:du|de|la|le|les|et|à|avec)\.$/i);
  });

  it('garde entiers les champs visuels un peu plus longs que la consigne du réalisateur', () => {
    const camera = 'Low gimbal tracking shot moving backward in front of the SUV at matching speed, keeping a near-constant frame size, then easing gently to a stop on the final hero frame';
    expect(camera.length).toBeGreaterThan(160);
    expect(shotDraftSchema.parse({ ...shot, camera }).camera).toBe(camera);
  });

  it('décrit le véhicule par sa marque, son modèle et sa couleur, sans la variante interne', () => {
    expect(vehicleDescriptionForPrompt({ make: 'GWM', model: 'Tank 300', color: 'Gris' })).toBe('GWM Tank 300 Gris');
    expect(vehicleDescriptionForPrompt({ make: 'Haval', model: 'H6', color: null })).toBe('Haval H6');
  });

  it('applique la charte bleu/rouge à l’image-clé et à l’animation sans recolorer le véhicule', () => {
    const keyframe = buildKeyframePrompt({ shot, vehicle: 'Haval H6 Beige', lighting: 'Lumière douce de fin de journée', format: '16:9', retryReason: null });
    const animation = buildKeyframeAnimationPrompt({ shot, vehicle: 'Haval H6 Beige', durationS: 5, mood: 'Premium', lighting: 'Lumière douce de fin de journée' });
    for (const prompt of [keyframe, animation]) {
      expect(prompt).toContain(BRAND_COLOR_DIRECTION);
      expect(prompt).toMatch(/never change the vehicle paint color/);
    }
  });
});
