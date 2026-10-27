"use client";

import { mixedPlaceMessage, mixedPlaceTimes, TIME_LABELS, type TimedPlace } from '@/core/brief/film-lighting';

export function PlaceTimeChoice({ places, transition, onKeep, onTransition }: { places: TimedPlace[]; transition: boolean; onKeep: (ids: string[]) => void; onTransition: () => void }) {
  const times = mixedPlaceTimes(places);
  if (times.length < 2) return null;
  return <div className="mt-3 rounded-md border border-[#e7d7b9] bg-[#fbf6ed] p-3 text-xs text-[#765d39]">
    <p role="status">{mixedPlaceMessage(times)}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {times.map((time) => <button type="button" key={time} onClick={() => onKeep(places.filter((place) => !place.timeOfDay || place.timeOfDay === 'interior' || place.timeOfDay === time).map((place) => place.id))} className="min-h-11 rounded-full border border-[#d8d4cd] bg-white px-3 font-semibold">{time === 'golden' ? 'Garder les lieux au coucher du soleil' : `Garder les lieux de ${TIME_LABELS[time]}`}</button>)}
      <button type="button" aria-pressed={transition} onClick={onTransition} className="min-h-11 rounded-full border border-[#d8d4cd] bg-white px-3 font-semibold">{times.length === 2 ? 'Garder les deux (transition voulue)' : 'Garder tous les lieux (transition voulue)'}</button>
    </div>
    {transition && <p className="mt-2">Transition voulue : les plans suivront l’ordre jour → coucher de soleil → nuit, selon les lieux disponibles.</p>}
  </div>;
}
