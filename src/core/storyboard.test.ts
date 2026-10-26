import { describe, expect, it } from 'vitest';
import { buildDirectorUserPrompt, buildStoryboardInstruction, compactStoryboardText, expandSingleShotStoryboard, finalVideoSeconds, getSingleShotClipDurations, shotDraftSchema, storyboardDurationIssue, storyboardSchema, validatePremiumTwentySecondStoryboard, validateStoryboard, validateTierDuration } from './storyboard';

const shots = [
  { title: 'Découverte', scene: 'Plan large', framing: 'Plan large', location: 'Plateau', action: 'Le véhicule avance lentement', camera: 'Travelling latéral', durationSeconds: 8, vehiclePhotoId: 'vehicle-front', locationPhotoId: 'place-plateau' },
  { title: 'Habitacle', scene: 'Détail intérieur', framing: 'Gros plan', location: 'Habitacle du véhicule', action: 'La caméra révèle les finitions', camera: 'Travelling rapproché', durationSeconds: 7, vehiclePhotoId: 'vehicle-interior' },
];

describe('storyboard', () => {
  it('allows only 20 seconds for Premium and keeps other tier durations available', () => {
    expect(validateTierDuration('premium', 20)).toBe(true);
    for (const duration of [5, 10, 15] as const) expect(() => validateTierDuration('premium', duration)).toThrow(/20 secondes/i);
    expect(validateTierDuration('standard', 5)).toBe(true);
    expect(validateTierDuration('pro', 15)).toBe(true);
  });

  it('requires exactly four 5-second shots for a Premium 20-second storyboard', () => {
    const premiumShots = Array.from({ length: 4 }, (_, index) => ({ ...shots[index % 2], title: `Premium ${index + 1}`, durationSeconds: 5 }));
    expect(validatePremiumTwentySecondStoryboard(premiumShots)).toBe(true);
    expect(() => validatePremiumTwentySecondStoryboard(premiumShots.slice(0, 3))).toThrow(/quatre plans de 5 secondes/i);
    expect(() => validatePremiumTwentySecondStoryboard(premiumShots.map((shot, index) => ({ ...shot, durationSeconds: index === 0 ? 4 : 5 })))).toThrow(/quatre plans de 5 secondes/i);
  });

  it('asks the Premium director for four full 5-second shots at 20 seconds', () => {
    const instruction = buildStoryboardInstruction({
      durationSeconds: 20, mode: 'premium', vehicle: 'GWM Tank 300 gris', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }],
      places: [{ id: 'hkb', title: 'Pont HKB' }], purpose: 'advertising', format: '16:9',
    });
    expect(instruction).toContain('Exactly 4 shots of 5 seconds (20 s).');
  });

  it('accepts two or more complete shots with explicit reference images and durations', () => {
    expect(storyboardSchema.parse(shots)).toHaveLength(2);
    expect(() => shotDraftSchema.parse({ ...shots[0], durationSeconds: 0 })).toThrow();
    expect(() => shotDraftSchema.parse({ ...shots[0], extra: 'ignored' })).toThrow();
  });

  it('requires generated clips to fill the selected runtime before adding the logo card', () => {
    expect(validateStoryboard([{ ...shots[0], durationSeconds: 5 }, { ...shots[1], durationSeconds: 5 }], 10, 'seedance')).toBe(true);
    expect(validateStoryboard([{ ...shots[0], durationSeconds: 5 }, { ...shots[1], durationSeconds: 5 }, { ...shots[0], durationSeconds: 5 }], 15, 'wan')).toBe(true);
    expect(() => validateStoryboard(shots, 20, 'wan')).toThrow(/durée/i);
    expect(() => validateStoryboard([{ ...shots[0], durationSeconds: 11 }, { ...shots[1], durationSeconds: 9 }], 20, 'wan')).toThrow(/maximum/i);
    // 26/10 · architecture: Pro shots last 3 to 5 s (Kling itself accepts up to 15 s).
    expect(() => validateStoryboard([{ ...shots[0], durationSeconds: 12 }, { ...shots[1], durationSeconds: 8 }], 20, 'kling')).toThrow(/entre 3 et 5/);
    expect(validateStoryboard([5, 5, 5, 5].map((durationSeconds, index) => ({ ...shots[index % 2], durationSeconds })), 20, 'kling')).toBe(true);
    expect(validateStoryboard([3, 4, 3, 5, 5].map((durationSeconds, index) => ({ ...shots[index % 2], durationSeconds })), 20, 'kling')).toBe(true);
  });

  it('builds a director brief for the selected runtime, aspect ratio and user story', () => {
    const instruction = buildStoryboardInstruction({
      durationSeconds: 10,
      mode: 'standard',
      vehicle: 'GWM Tank 300 noir',
      vehiclePhotos: [{ id: 'vehicle-front', role: 'exterior', title: 'Avant trois-quarts' }],
      places: [{ id: 'place-plateau', title: 'Abidjan, Plateau' }],
      format: '9:16',
      lighting: 'Lumière douce de fin de journée',
    });

    expect(instruction).toContain('9:16');
    expect(instruction).not.toContain('Une famille traverse Abidjan au coucher du soleil.');
    expect(buildDirectorUserPrompt('Une famille traverse Abidjan au coucher du soleil.')).toContain('<user_brief>Une famille traverse Abidjan au coucher du soleil.</user_brief>');
    expect(instruction).toContain('You direct a premium live-action car commercial');
    expect(instruction).toContain('Lighting: Soft late-afternoon light.');
    expect(instruction).toContain('scene (120)');
    expect(instruction).toContain('action (160)');
    expect(instruction).toContain('Exactly 2 shots of 5 seconds (10 s).');
  });

  it('asks the Pro director for shots of 3 to 5 seconds totalling the runtime (architecture, 26/10)', () => {
    const instruction = buildStoryboardInstruction({
      durationSeconds: 10, mode: 'pro', vehicle: 'GWM Tank 300 gris', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }],
      places: [{ id: 'hkb', title: 'Pont HKB' }], format: '16:9',
    });
    expect(instruction).toContain('2 to 3 shots of 3 to 5 whole seconds each, totalling exactly 10 s.');
    expect(buildStoryboardInstruction({ durationSeconds: 20, mode: 'pro', vehicle: 'GWM Tank 300 gris', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant' }], places: [{ id: 'hkb', title: 'Pont HKB' }], format: '16:9' })).toContain('4 to 6 shots of 3 to 5 whole seconds each, totalling exactly 20 s.');
  });

  it('checks durations instead of silently rewriting them (patch v3.2)', () => {
    expect(storyboardDurationIssue([{ ...shots[0], durationSeconds: 5 }, { ...shots[1], durationSeconds: 5 }], 10, 'kling')).toBeNull();
    expect(storyboardDurationIssue([{ ...shots[0], durationSeconds: 4 }, { ...shots[1], durationSeconds: 4 }], 10, 'kling')).toMatch(/totaliser exactement 10/);
    expect(storyboardDurationIssue([{ ...shots[0], durationSeconds: 2 }, { ...shots[1], durationSeconds: 8 }], 10, 'kling')).toMatch(/entre 3 et 5/);
    expect(storyboardDurationIssue([{ ...shots[0], durationSeconds: 4 }, { ...shots[1], durationSeconds: 6 }], 10, 'kling')).toMatch(/entre 3 et 5/);
  });

  it('keeps verbose model storyboard fields within the validated limits without cutting a word', () => {
    const text = `${'A precise cinematic scene with the vehicle advancing slowly. '.repeat(5)}`;
    const compact = compactStoryboardText(text, 240);

    expect(compact.length).toBeLessThanOrEqual(240);
    expect(text.startsWith(compact)).toBe(true);
    expect(compact).toMatch(/[.!?]$/);
    expect(shotDraftSchema.parse({ ...shots[0], scene: text }).scene).toBe(compactStoryboardText(text, 150));
  });

  it('splits long endpoint-bound shots and appends two logo seconds to the final runtime', () => {
    expect(getSingleShotClipDurations(5, 'wan')).toEqual([5]);
    expect(getSingleShotClipDurations(10, 'wan')).toEqual([5, 5]);
    expect(getSingleShotClipDurations(15, 'wan')).toEqual([5, 5, 5]);
    expect(getSingleShotClipDurations(20, 'wan')).toEqual([5, 5, 5, 5]);
    expect(getSingleShotClipDurations(20, 'kling')).toEqual([5, 5, 5, 5]);
    expect(getSingleShotClipDurations(15, 'kling')).toEqual([5, 5, 5]);
    expect(getSingleShotClipDurations(20, 'seedance')).toEqual([20]);
    expect(finalVideoSeconds(20)).toBe(22);
    expect(finalVideoSeconds(5)).toBe(7);
    expect(expandSingleShotStoryboard(shots[0], 20, 'wan').map((shot) => shot.durationSeconds)).toEqual([5, 5, 5, 5]);
  });
});
