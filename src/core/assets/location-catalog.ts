/** Curated, rights-cleared Côte d'Ivoire location references bundled with the Studio. */
export const locationCatalog = [
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d201', title: 'Pont HKB · journée', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-jour.png', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Pont à haubans blanc, lagune Ébrié et skyline d’Abidjan en plein jour' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d202', title: 'Route rouge · végétation tropicale', category: 'Côte d’Ivoire · route en terre', path: '/places/cote-ivoire-route-rouge-foret.jpg', location: 'Côte d’Ivoire, route latéritique en zone végétalisée', setting: 'Piste rouge bordée d’une végétation tropicale dense' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d203', title: 'Plateau et lagune · nuit', category: 'Abidjan · vue aérienne nocturne', path: '/places/abidjan-lagune-plateau-nuit.jpg', location: 'Abidjan, Plateau et lagune Ébrié', setting: 'Vue aérienne nocturne du front lagunaire et des lumières du Plateau' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d204', title: 'Boulevard lagunaire · nuit', category: 'Abidjan · boulevard nocturne', path: '/places/abidjan-boulevard-lagunaire-nuit.jpeg', location: 'Abidjan, boulevard du front lagunaire', setting: 'Boulevard éclairé longeant la lagune avec immeubles en arrière-plan, de nuit' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d205', title: 'Plateau et bord de mer · journée', category: 'Abidjan · architecture et littoral', path: '/places/abidjan-plateau-front-de-mer-jour.jpeg', location: 'Abidjan, Plateau et front de mer', setting: 'Tours du Plateau, boulevard côtier et lagune sous une lumière de jour' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d206', title: 'Front lagunaire · nuit, vue aérienne', category: 'Abidjan · vue aérienne nocturne', path: '/places/abidjan-boulevard-lagunaire-vue-aerienne-nuit.jpeg', location: 'Abidjan, boulevard et front lagunaire', setting: 'Vue aérienne nocturne d’un boulevard éclairé au bord de la lagune' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d207', title: 'La Pyramide · Plateau, journée', category: 'Abidjan · architecture du Plateau', path: '/places/abidjan-pyramide-plateau-jour.webp', location: 'Abidjan, Le Plateau, immeuble La Pyramide', setting: 'Architecture pyramidale reconnaissable, rue urbaine et végétation du Plateau en journée' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d208', title: 'Rue urbaine d’Abidjan · journée', category: 'Abidjan · rue urbaine', path: '/places/abidjan-rue-urbaine-jour.webp', location: 'Abidjan, rue urbaine', setting: 'Rue bordée d’immeubles résidentiels et de commerces, sous une lumière naturelle de journée' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d209', title: 'Boulevard lagunaire · journée', category: 'Abidjan · boulevard et lagune', path: '/places/abidjan-boulevard-lagunaire-jour.webp', location: 'Abidjan, boulevard du front lagunaire', setting: 'Boulevard dégagé au bord de la lagune avec la ville visible à l’horizon' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d210', title: 'Pont HKB · approche, journée', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-approche-jour.webp', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Vue routière d’un pont à haubans blanc dans la lumière du jour' },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d211', title: 'Showroom contemporain · intérieur', category: 'Décor intérieur · showroom', path: '/places/showroom-contemporain-interieur.webp', location: 'Décor générique de showroom contemporain', setting: 'Espace intérieur lumineux, sol clair, grandes baies vitrées et lignes architecturales sobres' },
] as const;

export type CuratedLocation = (typeof locationCatalog)[number];

export function findCuratedLocation(id: string): CuratedLocation | undefined {
  return locationCatalog.find((location) => location.id === id);
}

export function curatedLocationAsset(location: CuratedLocation) {
  return { id: location.id, kind: 'place' as const, title: location.title, category: location.category, path: location.path, status: 'validée' as const, previewUrl: location.path, isCurated: true as const };
}

/** Max length of a place description sent to the models (the prompts are capped). */
export const PLACE_DESCRIPTION_MAX_CHARS = 160;

/**
 * Short English-or-French description of a selected place, sent to the director and the video models so that
 * everything they add stays in that place (24/10: European-looking streets, a bridge « closed » behind the car).
 */
export function placeDescription(place: { id: string; title?: string | null; category?: string | null }): string {
  const curated = findCuratedLocation(place.id);
  const text = curated ? `${curated.location}. ${curated.setting}` : [place.title, place.category].filter(Boolean).join(' · ');
  const clean = text.replace(/[<>{}]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > PLACE_DESCRIPTION_MAX_CHARS ? `${clean.slice(0, PLACE_DESCRIPTION_MAX_CHARS - 1).replace(/[ ,;:.]+[^ ]*$/, '')}.` : clean;
}

export type PlaceTimeOfDay = 'day' | 'night' | 'interior';

/**
 * Time of day read from a place's title, category or file name (« nuit », « journée », « intérieur »).
 * Returns null when nothing is stated: the brief's lighting then applies unchanged.
 */
export function placeTimeOfDay(place: { title?: string | null; category?: string | null; path?: string | null }): PlaceTimeOfDay | null {
  const text = [place.title, place.category, place.path].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(?:nuit|nocturne|night|soir|soiree)\b/.test(text)) return 'night';
  if (/\b(?:interieur|interior|showroom)\b/.test(text)) return 'interior';
  if (/\b(?:jour|journee|day|matin|midi)\b/.test(text)) return 'day';
  return null;
}

/**
 * Lighting sent to the image and video models for one shot: the place photo wins over the
 * Studio lighting chip, so a night location is never described as « lumière du matin ».
 */
export function resolveShotLighting(briefLighting: string, timeOfDay: PlaceTimeOfDay | null): string {
  const lighting = briefLighting.trim();
  const saysNight = /\b(?:nuit|nocturne|night|soir|soiree|soirée)\b/i.test(lighting);
  if (timeOfDay === 'night' && !saysNight) return 'Night, lit by the real street and city lights visible in the selected location photo';
  if (timeOfDay === 'day' && saysNight) return 'Natural daylight, as in the selected location photo';
  if (timeOfDay === 'interior') return lighting && /int[eé]rieur|interior|showroom/i.test(lighting) ? lighting : 'Soft, even interior light, as in the selected location photo';
  return lighting || 'Natural light matching the selected location photo';
}
