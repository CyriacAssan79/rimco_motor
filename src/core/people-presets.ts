/**
 * « Personnage » choices of the Studio when no casting photo is selected (restored 23/10/2026, again 25/10 without the motion catalogue).
 * A closed list: the Studio sends an id, never free text, because the direction lands in the
 * director's system prompt (locked layer). Directions are English, like the other director rules.
 */
export const peoplePresetIds = ['none', 'driver', 'driver_passenger', 'beside_car'] as const;
export type PeoplePresetId = typeof peoplePresetIds[number];

export const peoplePresets: Record<PeoplePresetId, { label: string; direction: string | null }> = {
  none: { label: 'Aucun', direction: null },
  driver: { label: 'Conducteur ou conductrice', direction: 'one natural driver at the wheel, seen through the windows' },
  driver_passenger: { label: 'Conducteur et passager', direction: 'a natural driver and one passenger, both seated inside' },
  beside_car: { label: 'Conducteur près de la voiture à l’arrêt', direction: 'the driver at the wheel while the car moves, then standing near the stopped car, never touching it, in one stopped shot' },
};
