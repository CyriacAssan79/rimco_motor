import type { PlaceTimeOfDay } from '@/core/motion/place-motion';
import type { StoryboardShot } from '@/core/storyboard';

export const FILM_TIMES = ['day', 'golden', 'night'] as const;
export type FilmTime = typeof FILM_TIMES[number];
export const TIME_LABELS: Record<FilmTime, string> = { day: 'jour', golden: 'coucher de soleil', night: 'nuit' };
export type TimedPlace = { id: string; timeOfDay?: PlaceTimeOfDay | null };
export type FilmLighting = { moment: FilmTime; transition: boolean };
const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Explicit narrative transition, never a mere mention of two places. */
export function requestsTimeTransition(brief: string): boolean {
  return /\b(?:du jour (?:a|jusqu['’]?a) la nuit|day to night|from day(?:light)? to (?:night|sunset)|jusqu['’]?(?:au|a la) (?:coucher du soleil|nuit)|la nuit (?:tombe|s['’]installe)|du jour au coucher (?:du )?soleil|du coucher (?:du )?soleil a la nuit|de l['’]aube (?:au|a la)|transition (?:du jour|jour|vers la nuit))\b/.test(plain(brief));
}

/** Stable default: first selected outdoor place. Indoors is neutral and never sets the film's time. */
export function resolveFilmLighting(places: TimedPlace[], brief = '', transitionWanted = false): FilmLighting {
  const moment = places.find((place) => place.timeOfDay && place.timeOfDay !== 'interior')?.timeOfDay;
  return { moment: FILM_TIMES.includes(moment as FilmTime) ? moment as FilmTime : 'day', transition: transitionWanted || requestsTimeTransition(brief) };
}

export function placesForFilm<T extends TimedPlace>(places: T[], policy: FilmLighting): T[] {
  const allowed = places.filter((place) => policy.transition || !place.timeOfDay || place.timeOfDay === 'interior' || place.timeOfDay === policy.moment);
  return policy.transition ? [...allowed].sort((a, b) => timeRank(a.timeOfDay) - timeRank(b.timeOfDay)) : allowed;
}
const timeRank = (time: PlaceTimeOfDay | null | undefined) => FILM_TIMES.indexOf(time as FilmTime);

/** Makes the LLM answer invalid, so its existing single corrected retry applies. No silent re-lighting. */
export function filmLightingIssue(shots: Pick<StoryboardShot, 'locationPhotoId'>[], places: TimedPlace[], policy: FilmLighting): string | null {
  let last = -1;
  for (const shot of shots) {
    const time = places.find((place) => place.id === shot.locationPhotoId)?.timeOfDay;
    if (!time || time === 'interior') continue;
    if (!policy.transition && time !== policy.moment) return `ONE time of day for the whole film: ${policy.moment}. Use only its listed places or interior places; never mix times of day without an explicit transition.`;
    const rank = timeRank(time);
    if (policy.transition && rank < last) return 'Time transition must follow day → golden → night, never backwards. Reorder the shots and their places.';
    last = rank;
  }
  return null;
}

export function mixedPlaceTimes(places: TimedPlace[]): FilmTime[] {
  return FILM_TIMES.filter((time) => places.some((place) => place.timeOfDay === time));
}

export function mixedPlaceMessage(times: FilmTime[]): string {
  return `Vos lieux mélangent ${times.map((time) => TIME_LABELS[time]).join(' et ')} : la lumière changera d’un plan à l’autre.`;
}

export function lightingJudgeRule(time?: PlaceTimeOfDay | null): string {
  return time && time !== 'interior' ? ` The light must be ${time} like the place (sun height, colour, shadows). A different time of day is blocking.` : '';
}
