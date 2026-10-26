import { describe, expect, it } from 'vitest';
import { peoplePresetIds, peoplePresets } from '@/core/people-presets';
import { buildStoryboardInstruction } from '@/core/storyboard';

const base = { durationSeconds: 20 as const, mode: 'premium' as const, vehicle: 'GWM Tank 300', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant', angle: 'Avant trois-quarts' }], places: [], format: '16:9' as const };

describe('choix « Personnage » du Studio', () => {
  it('propose « Aucun » puis des personnages décrits en anglais pour le réalisateur', () => {
    expect(peoplePresetIds[0]).toBe('none');
    expect(peoplePresets.none.direction).toBeNull();
    for (const id of peoplePresetIds.slice(1)) expect(peoplePresets[id].direction).toMatch(/^[a-z]/);
  });

  it('impose au réalisateur la personne choisie et sa fiche', () => {
    const instruction = buildStoryboardInstruction({ ...base, peoplePreset: 'driver' });
    expect(instruction).toContain(`PEOPLE: ${peoplePresets.driver.direction}.`);
    expect(instruction).toContain('Describe them once in castDescription');
    expect(instruction).toContain('never leaning on the car');
    expect(instruction).not.toContain('nobody unless the brief asks');
    expect(instruction.length).toBeLessThan(3_700);
  });

  it('garde l’ancienne règle sans choix, et le casting prime sur le choix', () => {
    expect(buildStoryboardInstruction(base)).toContain('nobody unless the brief asks');
    const withCast = buildStoryboardInstruction({ ...base, peoplePreset: 'driver', cast: [{ id: 'c1', title: 'Awa' }] });
    expect(withCast).toContain('only this approved casting');
    expect(withCast).not.toContain(peoplePresets.driver.direction!);
  });
});
