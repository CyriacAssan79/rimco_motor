import { describe, expect, it, vi } from 'vitest';

// The routes run without Supabase: the actor is the simulated administrator (also in CI, where fake Supabase URLs are set).
vi.mock('@/core/auth/guards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/auth/guards')>()),
  getActor: async () => ({ id: 'mock-admin', role: 'admin', department: 'Direction', brandId: 'rimco' }),
}));
import { detectBriefConflicts, forbiddenShotText, forbiddenShotsIssue, mergeBriefConflicts } from '@/core/brief/conflicts';
import { HttpError } from '@/core/auth/guards';
import { POST as createVersion } from '@/app/api/versions/route';
import { buildStoryboardInstruction, shotDraftSchema, singleShotStoryboardSchema, type StoryboardShot } from '@/core/storyboard';
import { assertStoryboardSignature, INVALID_STORYBOARD_SIGNATURE, signingKeyFor, signStoryboard, verifyStoryboardSignature, type SignedStoryboard } from '@/core/storyboard-signature';
import { applyShotRevision } from '@/core/verification/loop';

const day = { placeTimes: ['day' as const], hasInteriorPhoto: false };
const shot = (fields: Partial<StoryboardShot> = {}): StoryboardShot => shotDraftSchema.parse({
  title: 'Passage', shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'cruise', scene: 'Grey SUV on the boulevard', framing: 'Wide',
  location: 'Boulevard', action: 'The SUV passes the palm trees', camera: 'Panning camera', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place', ...fields,
});

describe('conflits entre le brief et les règles (26/10)', () => {
  it('« fais un drift avec le logo RIMCO sur un mur » : deux conflits signalés, en simulation comme en complément du réalisateur', () => {
    const detected = detectBriefConflicts('fais un drift avec le logo RIMCO sur un mur', day);
    expect(detected.map((conflict) => conflict.id)).toEqual(['drift', 'text']);
    // Simulation: the director returns none, the code provides both.
    expect(mergeBriefConflicts([], detected)).toEqual([
      'Drift ou dérapage demandé : remplacé par une conduite dynamique et légale qui garde l’énergie de la scène.',
      'Texte ou logo à l’image demandé : aucun texte n’est généré dans la scène ; le logo RIMCO est ajouté au montage.',
    ]);
    // Live: the director's own sentence is kept, the code adds only what it forgot.
    expect(mergeBriefConflicts(['Dérapage demandé : remplacé par un passage dynamique et légal.'], detected)).toEqual([
      'Dérapage demandé : remplacé par un passage dynamique et légal.',
      'Texte ou logo à l’image demandé : aucun texte n’est généré dans la scène ; le logo RIMCO est ajouté au montage.',
    ]);
  });

  it('détecte la nuit sur un lieu de jour, l’intérieur sans photo, le showroom en mouvement ; rien pour un brief permis', () => {
    expect(detectBriefConflicts('Une balade de nuit sur le pont', day).map((conflict) => conflict.id)).toEqual(['night']);
    expect(detectBriefConflicts('Une balade de nuit', { placeTimes: ['night'], hasInteriorPhoto: false })).toEqual([]);
    expect(detectBriefConflicts('Montrer le tableau de bord', day).map((conflict) => conflict.id)).toEqual(['interior']);
    expect(detectBriefConflicts('Montrer le tableau de bord', { ...day, hasInteriorPhoto: true })).toEqual([]);
    expect(detectBriefConflicts('La voiture entre dans le showroom', { placeTimes: ['interior'], hasInteriorPhoto: false }).map((conflict) => conflict.id)).toEqual(['showroom']);
    expect(detectBriefConflicts('Une Haval H6 bleue roule doucement dans le Plateau à Abidjan.', day)).toEqual([]);
    expect(detectBriefConflicts('Une lumière naturelle douce sur un boulevard calme.', day)).toEqual([]);
  });

  it('les conflits sont du texte borné et nettoyé, 5 au plus', () => {
    const merged = mergeBriefConflicts(['<b>Logo</b> {demandé}', 'x'.repeat(500), 'a', 'b1 c2 d3', 'e4 f5 g6', 'h7 i8 j9', 'k10 l11'], []);
    expect(merged).toHaveLength(5);
    expect(merged[0]).toBe('b Logo /b demandé');
    expect(merged[1].length).toBeLessThanOrEqual(200);
  });

  it('le réalisateur reçoit la règle de priorité et le champ briefConflicts', () => {
    const instruction = buildStoryboardInstruction({ durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }], places: [{ id: 'place', title: 'Boulevard' }] });
    expect(instruction).toContain('"briefConflicts":[]');
    expect(instruction).toContain('PRIORITY: locked rules > user brief > your creative choices.');
  });

  it('une manœuvre interdite écrite dans un plan ou une correction est refusée ; la correction ne touche que les champs modifiables', () => {
    expect(forbiddenShotText(shot({ action: 'The SUV drifts around the roundabout' }))).toBe('drifts');
    expect(forbiddenShotText(shot())).toBeNull();
    expect(forbiddenShotsIssue([shot({ camera: 'Low camera, burnout smoke' })])).toContain('manœuvre interdite');
    const revised = applyShotRevision(shot({ withPeople: true }), { scene: 'Wide view', framing: 'Wide', location: 'Boulevard', action: 'The SUV drifts', camera: 'Static', title: 'Autre', durationSeconds: 9, vehiclePhotoId: 'other' } as never);
    expect(revised).toMatchObject({ title: 'Passage', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place', withPeople: true });
    expect(forbiddenShotText(revised)).toBe('drifts');
    // Director text never carries tags or braces into the prompts.
    expect(shot({ action: 'The SUV <b>passes</b> {x}' }).action).toBe('The SUV b passes /b x');
  });
});

describe('storyboard signé (26/10)', () => {
  const key = 'k'.repeat(48);
  const context = { userId: 'user-1', vehicleDossierId: 'dossier-1', workflow: 'single' as const, mode: 'pro', durationSeconds: 5, format: '16:9' };
  const signed: SignedStoryboard = { storyboard: singleShotStoryboardSchema.parse([shot()]), castDescription: '', context };

  it('accepte le storyboard exact, même relu par le schéma ; refuse une modification, un autre utilisateur ou une signature expirée', () => {
    const signature = signStoryboard(signed, key, 1_000);
    const roundTrip = { ...signed, storyboard: singleShotStoryboardSchema.parse(JSON.parse(JSON.stringify(signed.storyboard))) };
    expect(verifyStoryboardSignature(signature, roundTrip, key, 2_000)).toBe(true);
    expect(verifyStoryboardSignature(signature, { ...signed, storyboard: [shot({ action: 'The SUV drifts' })] }, key, 2_000)).toBe(false);
    expect(verifyStoryboardSignature(signature, { ...signed, castDescription: 'Another person' }, key, 2_000)).toBe(false);
    expect(verifyStoryboardSignature(signature, { ...signed, context: { ...context, userId: 'user-2' } }, key, 2_000)).toBe(false);
    expect(verifyStoryboardSignature(signature, signed, key, 1_000 + 24 * 3_600 + 1)).toBe(false);
    expect(verifyStoryboardSignature(signature, signed, 'z'.repeat(48), 2_000)).toBe(false);
    expect(verifyStoryboardSignature(undefined, signed, key, 2_000)).toBe(false);
  });

  it('sans clé en mode live : message clair ; en simulation : clé de développement', () => {
    expect(() => signingKeyFor(undefined, 'live')).toThrow(/STORYBOARD_SIGNING_KEY/);
    expect(signingKeyFor(undefined, 'mock')).toMatch(/simulation/);
    expect(() => assertStoryboardSignature('v1.1.invalid', signed)).toThrow(HttpError);
  });

  it('/api/versions refuse un storyboard modifié côté navigateur (422, message en français)', async () => {
    const payload = {
      workflow: 'single_storyboard', description: '', title: 'Essai', assetId: 'front', vehicleDossierId: '00000000-0000-4000-8000-000000000001',
      storyMode: 'pro', tier: 'pro', clipDurationSeconds: 5, purpose: 'advertising', format: '16:9', placeIds: ['00000000-0000-4000-8000-000000000002'],
      storyboard: [{ ...shot({ locationPhotoId: '00000000-0000-4000-8000-000000000002' }), action: 'The SUV drifts with a RIMCO logo on a wall' }],
      storyboardSignature: 'v1.9999999999.forged',
    };
    const response = await createVersion(new Request('http://localhost/api/versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe(INVALID_STORYBOARD_SIGNATURE);
  });

  it('/api/versions lance le storyboard signé tel que le navigateur le renvoie (simulation)', async () => {
    const storyboard = singleShotStoryboardSchema.parse([shot({ locationPhotoId: '00000000-0000-4000-8000-000000000002' })]);
    const castDescription = 'Adult driver in her thirties.';
    // Simulation without Supabase: the actor is the mock administrator.
    const storyboardSignature = signStoryboard({ storyboard, castDescription, context: { userId: 'mock-admin', vehicleDossierId: '00000000-0000-4000-8000-000000000001', workflow: 'single', mode: 'pro', durationSeconds: 5, format: '16:9' } }, signingKeyFor(undefined, 'mock'));
    const payload = {
      workflow: 'single_storyboard', description: '', title: 'Essai', assetId: 'front', vehicleDossierId: '00000000-0000-4000-8000-000000000001',
      storyMode: 'pro', tier: 'pro', clipDurationSeconds: 5, purpose: 'advertising', format: '16:9', placeIds: ['00000000-0000-4000-8000-000000000002'],
      storyboard: JSON.parse(JSON.stringify(storyboard)), castDescription, storyboardSignature,
    };
    const response = await createVersion(new Request('http://localhost/api/versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }));
    expect(response.status).toBe(201);
  });
});
