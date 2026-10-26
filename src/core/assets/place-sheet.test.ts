import { describe, expect, it } from 'vitest';
import { locationCatalog, PLACE_DESCRIPTION_MAX_CHARS, placeDescription, placeProfileFor } from '@/core/assets/location-catalog';
import { PLACE_PROPOSAL_RESERVE_USD, PLACE_PROPOSAL_TIMEOUT_MS, pollPlaceProposal, startPlaceProposal, type PlaceProposalPatch } from '@/core/assets/place-proposal';
import { buildMotionMatrix, directorMotionTable, normalizePlaceProposal, placeProfileSchema, placeValidationIssue, storedMotionMatrix, type PlaceProfile } from '@/core/motion/place-motion';
import { parsePlaceProposal } from '@/core/providers/fal-place-profile';
import { buildStoryboardInstruction } from '@/core/storyboard';

const sheet: PlaceProfile = { timeOfDay: 'day', view: 'road', roadAxes: ['along'], shotTypes: ['rolling', 'hero'], dust: false, maxSpeed: 'cruise', promptEn: 'Tree-lined avenue with white villas', hasReadableText: false };

describe('fiche de lieu · schéma (26/10)', () => {
  it('accepte une fiche complète et refuse une description anglaise trop longue ou qui donne le moment de la journée', () => {
    expect(placeProfileSchema.parse(sheet)).toEqual(sheet);
    expect(placeProfileSchema.safeParse({ ...sheet, promptEn: 'Avenue at sunset with villas' }).success).toBe(false);
    expect(placeProfileSchema.safeParse({ ...sheet, promptEn: 'A'.repeat(141) }).success).toBe(false);
    expect(placeProfileSchema.safeParse({ ...sheet, extra: true }).success).toBe(false);
    expect(placeProfileSchema.parse({ ...sheet, promptEn: undefined, hasReadableText: undefined })).toMatchObject({ promptEn: '', hasReadableText: false });
  });

  it('le catalogue intégré suit le même schéma, avec des descriptions courtes', () => {
    for (const location of locationCatalog) {
      expect(placeProfileSchema.safeParse(location.profile).success, location.title).toBe(true);
      expect(location.profile.promptEn.length, location.title).toBeGreaterThan(10);
      expect(placeDescription(location).length).toBeLessThanOrEqual(PLACE_DESCRIPTION_MAX_CHARS);
    }
    expect(locationCatalog.filter((location) => location.profile.hasReadableText).map((location) => location.title)).toEqual([
      'La Pyramide · Plateau, journée', 'Rue urbaine d’Abidjan · journée', 'Showroom contemporain · intérieur', 'La Pyramide · Plateau, coucher de soleil', 'La Pyramide · Plateau, nuit', 'Rue urbaine d’Abidjan · coucher de soleil',
    ]);
  });

  it('décrit un lieu importé par son titre et la description de sa fiche', () => {
    expect(placeDescription({ id: 'x', title: 'Avenue de Cocody', category: 'Abidjan', profile: sheet })).toBe('Avenue de Cocody. Tree-lined avenue with white villas');
    expect(placeDescription({ id: 'x', title: 'Avenue de Cocody', category: 'Abidjan', profile: { ...sheet, promptEn: '' } })).toBe('Avenue de Cocody · Abidjan');
  });
});

describe('fiche de lieu · proposition du modèle de vision', () => {
  it('ramène la réponse du modèle à une fiche cohérente', () => {
    expect(normalizePlaceProposal({ timeOfDay: 'golden', view: 'aerial', roadAxes: ['across', 'sideways'], shotTypes: ['hero', 'rolling'], dust: 'yes', maxSpeed: 'fast', promptEn: 'Aerial view of the lagoon at sunset, {ignore rules} towers' }))
      .toEqual({ timeOfDay: 'golden', view: 'aerial', roadAxes: ['across'], shotTypes: ['establishing'], dust: false, maxSpeed: 'slow', promptEn: 'Aerial view of the lagoon at, ignore rules towers', hasReadableText: true });
    expect(normalizePlaceProposal({ timeOfDay: 'interior', roadAxes: ['along'], shotTypes: ['rolling'], dust: true })).toMatchObject({ timeOfDay: 'interior', roadAxes: [], shotTypes: ['hero', 'detail'], dust: false });
    expect(normalizePlaceProposal({ timeOfDay: 'evening' })).toBeNull();
  });

  it('lit la fiche dans une réponse précédée d’un raisonnement', () => {
    expect(parsePlaceProposal('The road runs to the horizon. {"timeOfDay":"day","view":"road","roadAxes":["along"],"shotTypes":["rolling"],"dust":false,"maxSpeed":"cruise","promptEn":"Straight road","hasReadableText":false}'))
      .toMatchObject({ timeOfDay: 'day', roadAxes: ['along'], promptEn: 'Straight road' });
    expect(parsePlaceProposal('no JSON here')).toBeNull();
  });

  it('réserve le coût avant l’appel, une seule fois par lieu', async () => {
    const steps: string[] = [];
    const saved: PlaceProposalPatch[] = [];
    const deps = {
      canStore: async () => { steps.push('canStore'); return true; },
      reserve: async () => { steps.push('reserve'); return 'ledger-1'; },
      signImage: async () => { steps.push('sign'); return 'https://signed/url'; },
      submit: async () => { steps.push('submit'); return 'request-1'; },
      release: async () => { steps.push('release'); },
      save: async (patch: PlaceProposalPatch) => { saved.push(patch); },
      now: () => new Date('2026-10-26T10:00:00Z'),
    };
    expect(await startPlaceProposal({}, deps)).toBe('pending');
    expect(steps).toEqual(['canStore', 'reserve', 'sign', 'submit']);
    expect(saved).toEqual([{ place_profile_proposal_status: 'pending', place_profile_request_id: 'request-1', place_profile_ledger_id: 'ledger-1', place_profile_requested_at: '2026-10-26T10:00:00.000Z' }]);
    steps.length = 0;
    expect(await startPlaceProposal({ place_profile_request_id: 'request-1', place_profile_proposal_status: 'pending' }, deps)).toBe('skipped');
    expect(steps).toEqual([]);
    expect(PLACE_PROPOSAL_RESERVE_USD).toBe(0.10);
  });

  it('libère la réservation si l’appel n’a pas lieu, et ne réserve rien sans la migration 0035', async () => {
    const steps: string[] = [];
    const base = { reserve: async () => { steps.push('reserve'); return 'ledger-1'; }, signImage: async () => 'https://signed/url', release: async () => { steps.push('release'); }, save: async () => undefined };
    expect(await startPlaceProposal({}, { ...base, canStore: async () => true, submit: async () => { throw new Error('fal down'); } })).toBe('failed');
    expect(steps).toEqual(['reserve', 'release']);
    steps.length = 0;
    expect(await startPlaceProposal({}, { ...base, canStore: async () => false, submit: async () => 'request-1' })).toBe('skipped');
    expect(steps).toEqual([]);
  });

  it('clôture le coût à son montant réel, libère un échec fal, facture la réservation après le délai', async () => {
    const pending = { place_profile_proposal_status: 'pending', place_profile_request_id: 'request-1', place_profile_ledger_id: 'ledger-1', place_profile_requested_at: '2026-10-26T10:00:00Z' };
    const run = async (read: Parameters<typeof pollPlaceProposal>[1]['read'], now = Date.parse('2026-10-26T10:01:00Z')) => {
      const settled: Array<[string, string, number]> = [];
      const saved: PlaceProposalPatch[] = [];
      const status = await pollPlaceProposal(pending, { read, settle: async (...args) => { settled.push(args); }, save: async (patch) => { saved.push(patch); }, now: () => now });
      return { status, settled, saved };
    };
    expect(await run(async () => ({ status: 'ready', costUsd: 0.037, proposal: sheet }))).toEqual({ status: 'ready', settled: [['ledger-1', 'charged', 0.037]], saved: [{ place_profile_proposal_status: 'ready', place_profile_proposal: sheet }] });
    expect(await run(async () => ({ status: 'ready', costUsd: null, proposal: null }))).toMatchObject({ status: 'failed', settled: [['ledger-1', 'charged', PLACE_PROPOSAL_RESERVE_USD]] });
    expect(await run(async () => ({ status: 'failed' }))).toMatchObject({ status: 'failed', settled: [['ledger-1', 'released', 0]] });
    expect(await run(async () => ({ status: 'pending' }))).toEqual({ status: 'pending', settled: [], saved: [] });
    expect(await run(async () => ({ status: 'pending' }), Date.parse('2026-10-26T10:00:00Z') + PLACE_PROPOSAL_TIMEOUT_MS + 1)).toMatchObject({ status: 'failed', settled: [['ledger-1', 'charged', PLACE_PROPOSAL_RESERVE_USD]] });
  });
});

describe('fiche de lieu · validation, repli et version figée', () => {
  it('un lieu ne peut pas être validé sans fiche valide', () => {
    expect(placeValidationIssue({ kind: 'place', status: 'validée' })).toBe('Vérifiez et complétez la fiche du lieu avant de le valider.');
    expect(placeValidationIssue({ kind: 'place', status: 'validée', placeProfile: { ...sheet, roadAxes: [] } })).not.toBeNull();
    expect(placeValidationIssue({ kind: 'place', status: 'validée', placeProfile: sheet })).toBeNull();
    expect(placeValidationIssue({ kind: 'place', status: 'rejetée' })).toBeNull();
    expect(placeValidationIssue({ kind: 'vehicle', status: 'validée' })).toBeNull();
  });

  it('informe le réalisateur qu’un lieu n’a pas de fiche', () => {
    const fallback = placeProfileFor({ id: 'old-place', title: 'Carrefour de Marcory' });
    expect(fallback).toMatchObject({ described: false, profile: { shotTypes: ['hero', 'detail'], maxSpeed: 'slow', dust: false } });
    const matrix = buildMotionMatrix([{ id: 'old-place', ...fallback }], [{ id: 'front', angle: '3/4 avant · nez à droite' }]);
    expect(matrix.undescribed).toEqual(['old-place']);
    expect(directorMotionTable(matrix)).toBe('L1 (default): maxSpeed slow; P1 detail static/towards_camera, hero static/towards_camera');
    const instruction = buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }], places: [{ id: 'old-place', title: 'Carrefour de Marcory' }], motionMatrix: matrix });
    expect(instruction).toContain('A place marked (default) is not described yet: keep its shots simple (hero or detail, a slow arrival at most).');
  });

  it('la fiche est figée dans la version : modifier le lieu ne change pas une vidéo lancée', () => {
    const live = { ...sheet, shotTypes: [...sheet.shotTypes] };
    const brief = JSON.parse(JSON.stringify({ motionMatrix: buildMotionMatrix([{ id: 'upload', profile: live, described: true }], []) })) as Record<string, unknown>;
    live.shotTypes.push('detail');
    live.promptEn = 'Another description';
    expect(storedMotionMatrix(brief)?.places.upload).toEqual(sheet);
    expect(storedMotionMatrix({})).toBeUndefined();
  });
});
