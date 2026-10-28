import { describe, expect, it } from 'vitest';
import { locationCatalog } from '@/core/assets/location-catalog';
import { extractGenerationInputs, generationInputAssetIds } from './generation-inputs';

const uploadedPlace = '11111111-1111-4111-8111-111111111111';
const audio = '22222222-2222-4222-8222-222222222222';

describe('generation inputs read back from the brief', () => {
  it('returns the description and every selection made in the Studio', () => {
    const curated = locationCatalog[0];
    const brief = {
      user_direction: ' Une Haval H6 au Plateau. ', vehicle_description: 'Haval H6 bleu',
      placeIds: [curated.id, uploadedPlace], castAssets: [{ id: 'a', title: 'Awa' }],
      lighting: 'Lumière du matin', mood: 'Premium', audioAssetId: audio,
    };
    const titles = new Map([[uploadedPlace, 'Pont HKB'], [audio, 'Musique calme']]);
    expect(extractGenerationInputs(brief, titles)).toEqual({
      description: 'Une Haval H6 au Plateau.', vehicle: 'Haval H6 bleu', places: [curated.title, 'Pont HKB'],
      cast: ['Awa'], lighting: 'Lumière du matin', mood: 'Premium', music: 'Musique calme', adaptations: [],
    });
  });

  it('reads back the adaptations accepted before launch (28/10)', () => {
    expect(extractGenerationInputs({ briefAdaptations: ['Drift demandé : conduite dynamique et légale.', 42, ' '] }).adaptations).toEqual(['Drift demandé : conduite dynamique et légale.']);
  });

  it('only asks for titles of uploaded assets', () => {
    expect(generationInputAssetIds({ placeIds: [locationCatalog[0].id, uploadedPlace], audioAssetId: audio })).toEqual([uploadedPlace, audio]);
  });

  it('stays readable for older or partial briefs', () => {
    expect(extractGenerationInputs({ location: 'Boulevard Latrille', user_direction: '', audioAssetId: null })).toEqual({
      description: null, vehicle: null, places: ['Boulevard Latrille'], cast: [], lighting: null, mood: null, music: null, adaptations: [],
    });
  });
});
