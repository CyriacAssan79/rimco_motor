import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlaceTimeChoice } from '@/components/place-time-choice';
import { buildDirectorInstruction, shotDraftSchema } from '@/core/storyboard';
import { buildKeyframeQualityPrompt, buildVideoQualityPrompt } from '@/core/providers/fal-keyframes';
import { detectBriefConflicts } from './conflicts';
import { filmLightingIssue, placesForFilm, requestsTimeTransition, resolveFilmLighting, type TimedPlace } from './film-lighting';

const places: TimedPlace[] = [{ id: 'day', timeOfDay: 'day' }, { id: 'golden', timeOfDay: 'golden' }, { id: 'inside', timeOfDay: 'interior' }];
const shot = (id: string) => ({ locationPhotoId: id });
const director = (direction: string) => buildDirectorInstruction({ durationSeconds: 20, mode: 'premium', direction, vehicle: 'Haval H6 blue', vehiclePhotos: [{ id: 'car', role: 'exterior', title: 'Front' }], places: places.map((place) => ({ ...place, title: place.id })) });

describe('un moment de la journée par film', () => {
  it('filtre les lieux incompatibles, garde les intérieurs et refuse le mélange', () => {
    const policy = resolveFilmLighting(places);
    expect(policy).toEqual({ moment: 'day', transition: false });
    expect(placesForFilm(places, policy).map((place) => place.id)).toEqual(['day', 'inside']);
    expect(filmLightingIssue([shot('day'), shot('inside')], places, policy)).toBeNull();
    expect(filmLightingIssue([shot('day'), shot('golden')], places, policy)).toContain('ONE time of day');
    expect(director('Une voiture sur le pont')).toContain('ONE time of day for the whole film: day');
    expect(director('Une voiture sur le pont')).not.toContain('"id":"golden"');
  });

  it.each(['du jour à la nuit', 'jusqu’au coucher du soleil', 'la nuit tombe', 'du jour au coucher du soleil'])('reconnaît la transition explicite « %s »', (text) => {
    expect(requestsTimeTransition(text)).toBe(true);
    const policy = resolveFilmLighting(places, text);
    expect(placesForFilm(places, policy)).toHaveLength(3);
    expect(filmLightingIssue([shot('day'), shot('inside'), shot('golden')], places, policy)).toBeNull();
    expect(filmLightingIssue([shot('golden'), shot('inside'), shot('day')], places, policy)).toContain('never backwards');
    expect(director(text)).toContain('Order outdoor shots day → golden → night');
  });

  it('accepte le choix explicite du Studio, sans deviner une transition depuis les noms des lieux', () => {
    expect(resolveFilmLighting(places, 'Un lieu de jour et un coucher de soleil').transition).toBe(false);
    expect(resolveFilmLighting(places, '', true).transition).toBe(true);
    expect(resolveFilmLighting([{ id: 'i', timeOfDay: 'interior' }, { id: 'n', timeOfDay: 'night' }]).moment).toBe('night');
  });

  it('signale le mélange sans transition et une transition impossible vers la nuit', () => {
    const context = { placeTimes: places.map((place) => place.timeOfDay ?? null), hasInteriorPhoto: false };
    expect(detectBriefConflicts('', context)).toContainEqual(expect.objectContaining({ id: 'mixed_times', message: expect.stringContaining('la vidéo garde la lumière de jour') }));
    expect(detectBriefConflicts('du jour à la nuit', context)).not.toContainEqual(expect.objectContaining({ id: 'mixed_times' }));
    expect(detectBriefConflicts('du jour à la nuit', context)).toContainEqual(expect.objectContaining({ id: 'transition' }));
  });

  it('affiche les choix sous les lieux, avec une option par moment et une transition explicite', () => {
    const html = renderToStaticMarkup(<PlaceTimeChoice places={places} transition={false} onKeep={() => {}} onTransition={() => {}} />);
    expect(html).toContain('Vos lieux mélangent jour et coucher de soleil');
    expect(html).toContain('Garder les lieux de jour');
    expect(html).toContain('Garder les lieux au coucher du soleil');
    expect(html).toContain('Garder les deux (transition voulue)');
  });

  it('donne aux juges la lumière bloquante et l’alignement contre la route', () => {
    const plan = shotDraftSchema.parse({ title: 'Pont', scene: 'SUV on bridge', action: 'Car drives past posts', camera: 'Static', framing: 'Wide', location: 'Bridge', durationSeconds: 5, vehiclePhotoId: 'car', locationPhotoId: 'day' });
    const input = { vehicleReferenceCount: 1, hasLocationReference: true, timeOfDay: 'day' as const, excludePeople: true, onRoad: true, plan };
    expect(buildKeyframeQualityPrompt(input)).toContain('The light must be day like the place (sun height, colour, shadows). A different time of day is blocking.');
    expect(buildKeyframeQualityPrompt(input)).toContain('parallel to the lane markings and the kerb');
    expect(buildVideoQualityPrompt(input)).toContain('The light must not change time of day during the clip; a change is blocking.');
  });
});
