import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { buildDirectorInstruction, buildDirectorUserPrompt, shotDraftSchema } from '@/core/storyboard';
import { buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt, framingCriterionOf } from '@/core/providers/fal-keyframes';
import { locationCatalog, placeDescription, resolveShotLighting } from '@/core/assets/location-catalog';
import { buildMotionMatrix } from '@/core/motion/place-motion';
import { detectBriefConflicts } from './conflicts';
import { resolveFilmLighting, placesForFilm, filmLightingIssue } from './film-lighting';

/** Reproducible examples from the real prompt builders; never calls a model or an external service. */
describe('exemples des prompts demandés, avant/après transition', () => {
  it('produit les quatre prompts depuis les mêmes lieux et garde une lumière unique ou un ordre monotone', async () => {
    const day = locationCatalog.find((place) => !place.retired && place.profile.timeOfDay === 'day')!;
    const golden = locationCatalog.find((place) => !place.retired && place.profile.timeOfDay === 'golden')!;
    const selected = [day, golden];
    const photos = [{ id: 'vehicle-front', role: 'exterior', title: 'Trois-quarts avant', angle: 'Avant trois-quarts' }];
    const places = selected.map((place) => ({ id: place.id, title: place.title, timeOfDay: place.profile.timeOfDay, description: placeDescription(place) }));
    const matrix = buildMotionMatrix(selected.map((place) => ({ id: place.id, profile: place.profile })), photos);
    const sections: string[] = ['# Prompts générés — 27 octobre 2026', 'Exemples produits par les fonctions réellement utilisées par l’application. Aucun appel payant. Véhicule Haval H6 bleu, lieux de jour et au coucher de soleil. Il n’y a pas de lieu de nuit : la demande de nuit est donc signalée dans les conflits.'];
    for (const transition of [false, true]) {
      const brief = `Une Haval H6 bleue traverse Abidjan${transition ? ', du jour à la nuit' : ''}.`;
      const policy = resolveFilmLighting(places, brief);
      const allowed = placesForFilm(places, policy);
      const shots = [0, 1, 2, 3].map((index) => {
        const place = allowed[transition && index >= 2 ? 1 : 0];
        return shotDraftSchema.parse({ title: `Plan ${index + 1}`, shotType: 'rolling', travelDirection: 'towards_camera', travelSpeed: 'cruise', scene: 'Blue SUV advancing on the selected road', framing: 'Wide front three-quarter', location: place.description, action: 'The car drives forward past fixed roadside posts', camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: photos[0].id, locationPhotoId: place.id });
      });
      expect(filmLightingIssue(shots, places, policy)).toBeNull();
      const director = buildDirectorInstruction({ durationSeconds: 20, mode: 'premium', vehicle: 'Haval H6 blue', vehiclePhotos: photos, places, direction: brief, motionMatrix: matrix, trafficSide: 'right', steeringSide: 'left', marketLocation: 'Abidjan, Côte d’Ivoire', format: '16:9' });
      expect(director).toContain(transition ? 'Order outdoor shots day → golden → night' : 'ONE time of day for the whole film: day');
      if (!transition) expect(director).not.toContain(`"id":"${golden.id}"`);
      const conflicts = detectBriefConflicts(brief, { placeTimes: places.map((place) => place.timeOfDay), hasInteriorPhoto: false });
      sections.push(`## ${transition ? 'Avec « du jour à la nuit »' : 'Sans transition'}\n\nBrief : ${brief}\n\nConflits : ${conflicts.map((conflict) => conflict.message).join(' | ')}\n\n### Réalisateur (système + message utilisateur)\n\n\`\`\`text\n${director}\n\n${buildDirectorUserPrompt(brief)}\n\`\`\``);
      for (const number of transition ? [0, 3] : [0]) {
        const shot = shots[number];
        const place = selected.find((place) => place.id === shot.locationPhotoId)!;
        const common = { vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, onRoad: true, moving: true, timeOfDay: place.profile.timeOfDay, trafficSide: 'right' as const, steeringSide: 'left' as const, framing: framingCriterionOf({ framingRules: true, frameChecks: 2 }, shot, 'still'), plan: shot };
        const image = buildKeyframePrompt({ ...common, shot, vehicle: 'Haval H6 blue', lighting: resolveShotLighting('', place.profile.timeOfDay), format: '16:9', place: placeDescription(place), retryReason: null, framed: true });
        const imageJudge = buildKeyframeQualityPrompt(common);
        const clipJudge = buildVideoQualityPrompt({ ...common, shotType: 'rolling', durationS: 5, startKeyframe: true });
        for (const [label, prompt] of [['Image clé', image], ['Juge de l’image clé', imageJudge], ['Juge du clip', clipJudge]]) sections.push(`### ${label} — plan ${number + 1}, ${place.profile.timeOfDay}\n\n\`\`\`text\n${prompt}\n\`\`\``);
        expect(imageJudge).toContain(`The light must be ${place.profile.timeOfDay} like the place`);
        expect(clipJudge).toContain('The light must not change time of day during the clip');
      }
    }
    if (process.env.WRITE_PROMPT_EXAMPLES === '1') await writeFile('docs/PROMPT-EXAMPLES-2026-10-27.md', sections.join('\n\n') + '\n', 'utf8');
  });
});
