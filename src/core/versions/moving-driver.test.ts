import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt } from '@/core/providers/fal-keyframes';
import { DRIVER_AT_WHEEL, HIDDEN_CABIN } from '@/core/prompts/rules';
import type { StoryboardShot } from '@/core/storyboard';
import { peopleForShot } from './casting';
import { FALLBACK_DRIVER_DESCRIPTION, loadDefaultDriver } from './moving-driver';

const shot = (patch: Partial<StoryboardShot>): StoryboardShot => ({ title: 'Plan', scene: 'Abidjan road', framing: 'wide', location: 'road', action: 'The car drives along the lagoon', camera: 'tracking', durationSeconds: 5, vehiclePhotoId: 'photo', locationPhotoId: 'road', shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'cruise', ...patch });
const rolling = shot({});
const stopped = shot({ shotType: 'hero', travelDirection: 'static', travelSpeed: undefined, action: 'The car stands still' });
const driver = { description: 'one adult driver in a white shirt' };
const brief = (storyboard: StoryboardShot[], extra: Record<string, unknown> = {}) => ({ promptRules: 'v3.2', castDescription: '', movingDriver: driver, storyboard, interiorPlaceIds: ['showroom'], character: 'as explicitly requested in the user direction; otherwise none', user_direction: 'Le Haval H6 longe la lagune', ...extra });

describe('« voiture fantôme » · a car that drives has a driver', () => {
  it('puts the brand’s discreet driver at the wheel of a car that drives', () => {
    const people = peopleForShot(brief([rolling]), rolling, 1);
    expect(people).toMatchObject({ excludePeople: false, castDescription: driver.description, cabin: 'driver' });
    const prompt = buildKeyframePrompt({ shot: rolling, vehicle: 'Haval H6', lighting: 'soft morning light', format: '16:9', retryReason: null, ...people, steeringSide: 'left' });
    expect(prompt).toContain(driver.description);
    expect(prompt).toContain(DRIVER_AT_WHEEL);
    expect(prompt).not.toContain('empty cabin');
  });

  it('keeps the driver in the stop right after a drive, leaves a parked car empty', () => {
    const story = [rolling, stopped];
    expect(peopleForShot(brief(story), stopped, 2)).toMatchObject({ cabin: 'driver' });
    // Parked from the start (first shot): nobody, as before.
    expect(peopleForShot(brief([stopped, rolling]), stopped, 1)).toMatchObject({ excludePeople: true });
    expect(peopleForShot(brief([stopped, rolling]), stopped, 1).cabin).toBeUndefined();
  });

  it('never adds a driver to a detail shot or a showroom shot', () => {
    const detail = shot({ shotType: 'detail', travelDirection: 'static' });
    const showroom = shot({ shotType: 'hero', travelDirection: 'static', locationPhotoId: 'showroom' });
    expect(peopleForShot(brief([rolling, detail]), detail, 2).cabin).toBeUndefined();
    expect(peopleForShot(brief([rolling, showroom]), showroom, 2).cabin).toBeUndefined();
  });

  it('« sans personne » asked: no driver, and the windows hide the cabin instead of showing it empty', () => {
    const noPeople = brief([rolling], { user_direction: 'Le Haval H6 sur le pont, sans personne' });
    const people = peopleForShot(noPeople, rolling, 1);
    expect(people).toMatchObject({ excludePeople: true, cabin: 'hidden' });
    const prompt = buildKeyframePrompt({ shot: rolling, vehicle: 'Haval H6', lighting: 'soft morning light', format: '16:9', retryReason: null, ...people });
    expect(prompt).toContain(HIDDEN_CABIN);
    expect(prompt).not.toContain('empty cabin is visible');
  });

  it('the judges block an empty driver seat in a car that drives', () => {
    const people = peopleForShot(brief([rolling]), rolling, 1);
    const keyframeJudge = buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, moving: true, ...people });
    expect(keyframeJudge).toContain('a visibly empty driver seat in a car that drives is blocking');
    expect(keyframeJudge).not.toContain('must look visually unoccupied');
    const clipJudge = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, moving: true, durationS: 5, ...people });
    expect(clipJudge).toContain('; a visibly empty driver seat in a car that drives');
  });

  it('keeps people already chosen (the director’s sheet) as the occupants', () => {
    const withSheet = brief([{ ...rolling, withPeople: true }], { castDescription: 'a young woman in a red dress' });
    expect(peopleForShot(withSheet, { ...rolling, withPeople: true }, 1)).toMatchObject({ castDescription: 'a young woman in a red dress' });
    expect(peopleForShot(withSheet, { ...rolling, withPeople: true }, 1).cabin).toBeUndefined();
  });

  it('changes nothing for a video launched before 27/10 (no movingDriver in its brief)', () => {
    const { movingDriver, ...old } = brief([rolling]);
    void movingDriver;
    expect(peopleForShot(old, rolling, 1)).toEqual({ excludePeople: true, castMembers: [], castTitles: [], castDescription: null });
  });

  it('reads the driver from the brand, with a fallback before migration 0039', async () => {
    const admin = (result: { data: unknown; error: unknown }) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }) as unknown as SupabaseClient;
    expect(await loadDefaultDriver(admin({ data: { default_driver_description: 'une conductrice en tailleur bleu' }, error: null }), 'b1')).toEqual({ description: 'une conductrice en tailleur bleu' });
    expect(await loadDefaultDriver(admin({ data: null, error: { message: 'column does not exist' } }), 'b1')).toEqual({ description: FALLBACK_DRIVER_DESCRIPTION });
  });
});
