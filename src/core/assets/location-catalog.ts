import { guessTimeOfDay, resolvePlaceProfile, type PlaceProfile, type PlaceTimeOfDay } from '@/core/motion/place-motion';
import { lightingForPrompt } from '@/core/scenes/prompt-values';
export type { PlaceTimeOfDay } from '@/core/motion/place-motion';

export type CuratedLocation = {
  id: string;
  title: string;
  category: string;
  path: string;
  /** English name of the place sent to the models (26/10: prompts entirely in English). */
  placeEn: string;
  /** French name and setting, for the team only. */
  location: string;
  setting: string;
  /** What the place allows (26/10 motion matrix): road, shot types, dust, top speed. */
  profile: PlaceProfile;
  /** Kept for the history of earlier videos, never offered again (24/10: « Pont HKB · approche » shows another bridge). */
  retired?: true;
};

type Road = Omit<PlaceProfile, 'timeOfDay' | 'promptEn' | 'hasReadableText'>;
const ALL_SHOTS: PlaceProfile['shotTypes'] = ['establishing', 'rolling', 'detail', 'hero'];
const AERIAL: Road = { view: 'aerial', roadAxes: ['along'], shotTypes: ['establishing'], dust: false, maxSpeed: 'cruise' };
const ELEVATED: Road = { view: 'elevated', roadAxes: ['along'], shotTypes: ['establishing', 'rolling'], dust: false, maxSpeed: 'cruise' };
const RED_TRACK: Road = { view: 'road', roadAxes: ['along'], shotTypes: ALL_SHOTS, dust: true, maxSpeed: 'slow' };
const BRIDGE_DECK: Road = { view: 'road', roadAxes: ['along'], shotTypes: ['establishing', 'rolling', 'hero'], dust: false, maxSpeed: 'cruise' };
const CITY_STREET: Road = { view: 'road', roadAxes: ['along', 'across'], shotTypes: ALL_SHOTS, dust: false, maxSpeed: 'cruise' };
const SHOWROOM: Road = { view: 'road', roadAxes: [], shotTypes: ['hero', 'detail'], dust: false, maxSpeed: 'slow' };
/** Sheet of a curated place (same schema as the uploaded places); English descriptions taken from the 24/10 survey. */
const sheet = (road: Road, timeOfDay: PlaceProfile['timeOfDay'], promptEn: string, hasReadableText = false): PlaceProfile => ({ ...road, timeOfDay, promptEn, hasReadableText });

/** Curated, rights-cleared Côte d'Ivoire location references bundled with the Studio. */
export const locationCatalog: readonly CuratedLocation[] = [
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d201', title: 'Pont HKB · journée', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-jour.png', placeEn: 'HKB bridge (Henri-Konan-Bédié), Abidjan', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Pont à haubans blanc, lagune Ébrié et skyline d’Abidjan en plein jour', profile: sheet(AERIAL, 'day', 'Aerial view of the white single-pylon cable-stayed HKB bridge over the Ebrie lagoon, Plateau towers behind') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d202', title: 'Route rouge · végétation tropicale', category: 'Côte d’Ivoire · route en terre', path: '/places/cote-ivoire-route-rouge-foret.jpg', placeEn: 'Laterite road, Côte d’Ivoire', location: 'Côte d’Ivoire, route latéritique en zone végétalisée', setting: 'Piste rouge bordée d’une végétation tropicale dense', profile: sheet(RED_TRACK, 'day', 'Straight red laterite road through dense tropical vegetation, forested hills in the distance') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d203', title: 'Plateau et lagune · nuit', category: 'Abidjan · vue aérienne nocturne', path: '/places/abidjan-lagune-plateau-nuit.jpg', placeEn: 'Plateau and Ebrie lagoon, Abidjan', location: 'Abidjan, Plateau et lagune Ébrié', setting: 'Vue aérienne nocturne du front lagunaire et des lumières du Plateau', profile: sheet(AERIAL, 'night', 'Aerial view of a lit boulevard curving along the lagoon, Plateau towers and city lights') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d204', title: 'Boulevard lagunaire · nuit', category: 'Abidjan · boulevard nocturne', path: '/places/abidjan-boulevard-lagunaire-nuit.jpeg', placeEn: 'Lagoon-front boulevard, Abidjan', location: 'Abidjan, boulevard du front lagunaire', setting: 'Boulevard éclairé longeant la lagune avec immeubles en arrière-plan, de nuit', profile: sheet(ELEVATED, 'night', 'Lit dual carriageway along the lagoon seen from a high building, hotel towers on the right, street lights') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d205', title: 'Plateau et bord de mer · journée', category: 'Abidjan · architecture et littoral', path: '/places/abidjan-plateau-front-de-mer-jour.jpeg', placeEn: 'Plateau and seafront, Abidjan', location: 'Abidjan, Plateau et front de mer', setting: 'Tours du Plateau, boulevard côtier et lagune sous une lumière de jour', profile: sheet(ELEVATED, 'day', 'Coastal dual carriageway seen from above, dark-red round tower and Plateau towers, sandy shore and water') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d206', title: 'Front lagunaire · nuit, vue aérienne', category: 'Abidjan · vue aérienne nocturne', path: '/places/abidjan-boulevard-lagunaire-vue-aerienne-nuit.jpeg', placeEn: 'Lagoon-front boulevard, Abidjan', location: 'Abidjan, boulevard et front lagunaire', setting: 'Vue aérienne nocturne d’un boulevard éclairé au bord de la lagune', profile: sheet(ELEVATED, 'night', 'Lit lagoon-side boulevard seen from a high building, towers on the right, dark lagoon on the left') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d207', title: 'La Pyramide · Plateau, journée', category: 'Abidjan · architecture du Plateau', path: '/places/abidjan-pyramide-plateau-jour.webp', placeEn: 'La Pyramide building, Le Plateau, Abidjan', location: 'Abidjan, Le Plateau, immeuble La Pyramide', setting: 'Architecture pyramidale reconnaissable, rue urbaine et végétation du Plateau en journée', profile: sheet(CITY_STREET, 'day', 'Wide crossroads with zebra crossings, La Pyramide terraced green building, glass tower on the left, large trees', true) },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d208', title: 'Rue urbaine d’Abidjan · journée', category: 'Abidjan · rue urbaine', path: '/places/abidjan-rue-urbaine-jour.webp', placeEn: 'City street, Abidjan', location: 'Abidjan, rue urbaine', setting: 'Rue bordée d’immeubles résidentiels et de commerces, sous une lumière naturelle de journée', profile: sheet(CITY_STREET, 'day', 'Sloping street between apartment blocks and small shops, street lamps, palm trees, lagoon far ahead', true) },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d209', title: 'Boulevard lagunaire · journée', category: 'Abidjan · boulevard et lagune', path: '/places/abidjan-boulevard-lagunaire-jour.webp', placeEn: 'Lagoon-front boulevard, Abidjan', location: 'Abidjan, boulevard du front lagunaire', setting: 'Boulevard dégagé au bord de la lagune avec la ville visible à l’horizon', profile: sheet({ ...CITY_STREET, maxSpeed: 'dynamic' }, 'day', 'Straight dual carriageway with a grass median along the lagoon, street lamps, Plateau skyline ahead') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d210', title: 'Pont HKB · approche, journée', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-approche-jour.webp', placeEn: 'HKB bridge (Henri-Konan-Bédié), Abidjan', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Vue routière d’un pont à haubans blanc dans la lumière du jour', profile: sheet(BRIDGE_DECK, 'day', 'Bridge deck with a white pylon and cables ahead'), retired: true },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d211', title: 'Showroom contemporain · intérieur', category: 'Décor intérieur · showroom', path: '/places/showroom-contemporain-interieur.webp', placeEn: 'Contemporary car showroom', location: 'Décor générique de showroom contemporain', setting: 'Espace intérieur lumineux, sol clair, grandes baies vitrées et lignes architecturales sobres', profile: sheet(SHOWROOM, 'interior', 'Bright empty showroom, glossy light floor, tall glass walls, clean architectural lines', true) },
  // 24/10 road-level places, taken back on 26/10.
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d212', title: 'Pont HKB · sur le tablier, journée', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-tablier-jour.webp', placeEn: 'HKB bridge deck, Abidjan', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Tablier du pont à haubans blanc, pylône et câbles devant, skyline du Plateau en journée', profile: sheet(BRIDGE_DECK, 'day', 'HKB bridge deck with white railings, the white single-blade pylon and its cables ahead, Plateau skyline') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d213', title: 'Pont HKB · sur le tablier, coucher de soleil', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-tablier-coucher.webp', placeEn: 'HKB bridge deck, Abidjan', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Tablier du pont à haubans blanc au coucher du soleil, lagune et skyline', profile: sheet(BRIDGE_DECK, 'golden', 'HKB bridge deck with white railings, the white single-blade pylon and its cables, lagoon and Plateau skyline') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d214', title: 'Route rouge · virage', category: 'Côte d’Ivoire · route en terre', path: '/places/cote-ivoire-route-rouge-virage.webp', placeEn: 'Laterite road, Côte d’Ivoire', location: 'Côte d’Ivoire, route latéritique en zone végétalisée', setting: 'Piste rouge sinueuse qui descend dans une végétation tropicale dense', profile: sheet(RED_TRACK, 'day', 'Red laterite road winding downhill through dense tropical vegetation, forested hills in the distance') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d215', title: 'Route rouge · coucher de soleil', category: 'Côte d’Ivoire · route en terre', path: '/places/cote-ivoire-route-rouge-coucher.webp', placeEn: 'Laterite road, Côte d’Ivoire', location: 'Côte d’Ivoire, route latéritique en zone végétalisée', setting: 'Piste rouge au coucher du soleil, végétation tropicale et collines', profile: sheet(RED_TRACK, 'golden', 'Wide red laterite road between tropical bushes and trees, forested hills in the distance') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d216', title: 'La Pyramide · Plateau, coucher de soleil', category: 'Abidjan · architecture du Plateau', path: '/places/abidjan-pyramide-plateau-coucher.webp', placeEn: 'La Pyramide building, Le Plateau, Abidjan', location: 'Abidjan, Le Plateau, immeuble La Pyramide', setting: 'Carrefour devant La Pyramide au coucher du soleil', profile: sheet(CITY_STREET, 'golden', 'Wide crossroads with zebra crossings, La Pyramide terraced green building, glass tower on the left, large trees', true) },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d217', title: 'La Pyramide · Plateau, nuit', category: 'Abidjan · architecture du Plateau', path: '/places/abidjan-pyramide-plateau-nuit.webp', placeEn: 'La Pyramide building, Le Plateau, Abidjan', location: 'Abidjan, Le Plateau, immeuble La Pyramide', setting: 'Carrefour éclairé devant La Pyramide à la tombée de la nuit', profile: sheet(CITY_STREET, 'night', 'Crossroads with zebra crossings and traffic lights, La Pyramide terraced green building, glass tower on the left', true) },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d218', title: 'Boulevard côtier · journée', category: 'Abidjan · architecture et littoral', path: '/places/abidjan-boulevard-cotier-jour.webp', placeEn: 'Coastal boulevard, Plateau, Abidjan', location: 'Abidjan, Plateau et front de mer', setting: 'Boulevard côtier bordé de palmiers, tours du Plateau et plage en journée', profile: sheet(CITY_STREET, 'day', 'Straight coastal dual carriageway with palm trees, dark-red round tower on the left, beach and water on the right') },
  { id: 'd55c82b1-95d3-4d2e-a2d2-25068739d219', title: 'Rue urbaine d’Abidjan · coucher de soleil', category: 'Abidjan · rue urbaine', path: '/places/abidjan-rue-urbaine-coucher.webp', placeEn: 'City street, Abidjan', location: 'Abidjan, rue urbaine', setting: 'Rue en pente entre immeubles au lever ou coucher du soleil, lagune au loin', profile: sheet(CITY_STREET, 'golden', 'Sloping street between apartment blocks and small shops, street lamps, palm trees, lagoon far ahead', true) },
];

/** Curated places a new storyboard may use (retired ones stay readable for earlier videos). */
export const selectableLocations = locationCatalog.filter((location) => !location.retired);

export function findCuratedLocation(id: string): CuratedLocation | undefined {
  return locationCatalog.find((location) => location.id === id);
}

/** Curated place a new storyboard may still use: retired places are refused like an unknown one. */
export function findSelectableLocation(id: string): CuratedLocation | undefined {
  const location = findCuratedLocation(id);
  return location && !location.retired ? location : undefined;
}

/** Sheet of a place: the curated one, else the validated sheet of the uploaded place or the prudent default. */
export function placeProfileFor(place: { id: string; title?: string | null; category?: string | null; path?: string | null; place_profile?: unknown }): { profile: PlaceProfile; described: boolean } {
  const curated = findCuratedLocation(place.id);
  return curated ? { profile: curated.profile, described: true } : resolvePlaceProfile(place);
}

export function curatedLocationAsset(location: CuratedLocation) {
  return { id: location.id, kind: 'place' as const, title: location.title, category: location.category, path: location.path, status: 'validée' as const, previewUrl: location.path, isCurated: true as const, placeProfile: location.profile };
}

/** Max length of a place description sent to the models (the prompts are capped). */
export const PLACE_DESCRIPTION_MAX_CHARS = 160;

/**
 * Short description of a selected place, sent to the director and the image and video models so that everything
 * they add stays in that place (24/10: European-looking streets as the camera moved). 26/10: the place name, then
 * the English description of its sheet; « title · category » for a place without one.
 */
export function placeDescription(place: { id: string; title?: string | null; category?: string | null; profile?: PlaceProfile }): string {
  const curated = findCuratedLocation(place.id);
  const promptEn = (curated?.profile ?? place.profile)?.promptEn ?? '';
  // 26/10: the English name of a curated place; the title of an uploaded place without its time-of-day words (the light
  // block alone gives the time). The French name and setting of a curated place never reach the models.
  const name = curated ? curated.placeEn : stripTimeOfDay(place.title ?? '');
  const text = promptEn ? `${name}. ${promptEn}` : curated ? curated.placeEn : stripTimeOfDay([place.title, place.category].filter(Boolean).join(' · '));
  const clean = text.replace(/[<>{}]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > PLACE_DESCRIPTION_MAX_CHARS ? `${clean.slice(0, PLACE_DESCRIPTION_MAX_CHARS - 1).replace(/[ ,;:.]+[^ ]*$/, '')}.` : clean;
}

/**
 * Time of day of a place: the one of its sheet when it is curated, else a guess from its title, category or file
 * name (indoors first). Returns null when nothing is stated: the brief's lighting then applies unchanged.
 */
export function placeTimeOfDay(place: { id?: string; title?: string | null; category?: string | null; path?: string | null }): PlaceTimeOfDay | null {
  return (place.id ? findCuratedLocation(place.id)?.profile.timeOfDay : undefined) ?? guessTimeOfDay(place);
}

/** Time-of-day words (French and English) removed from an uploaded place title before it reaches the models. */
const TIME_OF_DAY_WORDS = /(?<!\p{L})(?:en\s+)?(?:plein\s+)?(?:fin\s+de\s+journée|début\s+de\s+matinée|journée|jour|nuit|soirée|soir|matinée|matin|midi|aube|crépuscule|coucher(?:\s+du?\s+soleil)?|lever(?:\s+du\s+(?:jour|soleil))?|de\s+soleil|daytime|day|night|morning|evening|sunset|sunrise|dusk|dawn)(?!\p{L})/giu;

export function stripTimeOfDay(text: string): string {
  return text.split(/\s*[·,]\s*/)
    .map((part) => part.replace(TIME_OF_DAY_WORDS, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean).join(' · ');
}

/** Light of a place when the Studio light chip does not fit its time of day (the place photo wins). */
const PLACE_LIGHT: Record<PlaceTimeOfDay, string> = {
  day: 'Natural daylight, as in the selected location photo',
  golden: 'Low, warm sun of early morning or late afternoon, as in the selected location photo',
  night: 'Night, lit by the real street and city lights visible in the selected location photo',
  interior: 'Soft, even interior light, as in the selected location photo',
};

/**
 * One coherent English light per shot (26/10). The Studio chip is used only when its time of day is the one of the
 * place (or when the place states none); otherwise the place light wins, so a « plein jour » place is never lit
 * « fin de journée ». Anything outside the chip catalogue is ignored.
 */
export function resolveShotLighting(briefLighting: string, timeOfDay: PlaceTimeOfDay | null): string {
  const chip = lightingForPrompt(briefLighting);
  if (!timeOfDay) return chip?.text ?? 'Natural light matching the selected location photo';
  return chip && chip.timeOfDay === timeOfDay ? `${chip.text}, as in the selected location photo` : PLACE_LIGHT[timeOfDay];
}
