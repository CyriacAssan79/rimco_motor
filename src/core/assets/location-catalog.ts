import type { PlaceGeometry, PlaceTimeOfDay } from '@/core/assets/place-geometry';
export type { PlaceTimeOfDay } from '@/core/assets/place-geometry';

export type CuratedLocation = {
  id: string;
  title: string;
  category: string;
  path: string;
  location: string;
  setting: string;
  /** What the photo really shows (viewpoint, road, light, visible elements), read by the director and the prompts. */
  geometry: PlaceGeometry;
  /** Kept for the history of earlier videos, never offered again (25/10: « Pont HKB · approche » showed another bridge). */
  retired?: true;
};

/** Curated, rights-cleared Côte d'Ivoire location references bundled with the Studio. */
export const locationCatalog: readonly CuratedLocation[] = [
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d201', title: 'Pont HKB · journée', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-jour.png', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Pont à haubans blanc, lagune Ébrié et skyline d’Abidjan en plein jour',
    geometry: { viewpoint: 'distant', roadAxis: 'diagonal', roadType: 'urban', timeOfDay: 'day', landmarks: 'aerial view of the white single-pylon cable-stayed bridge over the Ebrie lagoon, Plateau towers behind' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d202', title: 'Route rouge · végétation tropicale', category: 'Côte d’Ivoire · route en terre', path: '/places/cote-ivoire-route-rouge-foret.jpg', location: 'Côte d’Ivoire, route latéritique en zone végétalisée', setting: 'Piste rouge bordée d’une végétation tropicale dense',
    geometry: { viewpoint: 'ground', roadAxis: 'depth', roadType: 'unpaved', timeOfDay: 'day', landmarks: 'straight red laterite road, dense tropical vegetation on both sides, forested hills in the distance' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d203', title: 'Plateau et lagune · nuit', category: 'Abidjan · vue aérienne nocturne', path: '/places/abidjan-lagune-plateau-nuit.jpg', location: 'Abidjan, Plateau et lagune Ébrié', setting: 'Vue aérienne nocturne du front lagunaire et des lumières du Plateau',
    geometry: { viewpoint: 'distant', roadAxis: 'diagonal', roadType: 'urban', timeOfDay: 'night', landmarks: 'aerial night view of a lit boulevard curving along the lagoon, Plateau towers and city lights' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d204', title: 'Boulevard lagunaire · nuit', category: 'Abidjan · boulevard nocturne', path: '/places/abidjan-boulevard-lagunaire-nuit.jpeg', location: 'Abidjan, boulevard du front lagunaire', setting: 'Boulevard éclairé longeant la lagune avec immeubles en arrière-plan, de nuit',
    geometry: { viewpoint: 'elevated', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'night', landmarks: 'lit dual carriageway along the lagoon seen from a high building, hotel towers on the right, street lights' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d205', title: 'Plateau et bord de mer · journée', category: 'Abidjan · architecture et littoral', path: '/places/abidjan-plateau-front-de-mer-jour.jpeg', location: 'Abidjan, Plateau et front de mer', setting: 'Tours du Plateau, boulevard côtier et lagune sous une lumière de jour',
    geometry: { viewpoint: 'elevated', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'day', landmarks: 'coastal dual carriageway seen from above, dark-red round tower and Plateau towers, sandy shore and water on the right' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d206', title: 'Front lagunaire · nuit, vue aérienne', category: 'Abidjan · vue aérienne nocturne', path: '/places/abidjan-boulevard-lagunaire-vue-aerienne-nuit.jpeg', location: 'Abidjan, boulevard et front lagunaire', setting: 'Vue aérienne nocturne d’un boulevard éclairé au bord de la lagune',
    geometry: { viewpoint: 'elevated', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'night', landmarks: 'lit lagoon-side boulevard seen from a high building, towers on the right, dark lagoon on the left' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d207', title: 'La Pyramide · Plateau, journée', category: 'Abidjan · architecture du Plateau', path: '/places/abidjan-pyramide-plateau-jour.webp', location: 'Abidjan, Le Plateau, immeuble La Pyramide', setting: 'Architecture pyramidale reconnaissable, rue urbaine et végétation du Plateau en journée',
    geometry: { viewpoint: 'ground', roadAxis: 'crossroads', roadType: 'urban', timeOfDay: 'day', landmarks: 'wide crossroads with zebra crossings, La Pyramide terraced green building, glass tower on the left, large trees' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d208', title: 'Rue urbaine d’Abidjan · journée', category: 'Abidjan · rue urbaine', path: '/places/abidjan-rue-urbaine-jour.webp', location: 'Abidjan, rue urbaine', setting: 'Rue bordée d’immeubles résidentiels et de commerces, sous une lumière naturelle de journée',
    geometry: { viewpoint: 'ground', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'day', landmarks: 'sloping street between apartment blocks and small shops, street lamps, palm trees, lagoon far ahead' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d209', title: 'Boulevard lagunaire · journée', category: 'Abidjan · boulevard et lagune', path: '/places/abidjan-boulevard-lagunaire-jour.webp', location: 'Abidjan, boulevard du front lagunaire', setting: 'Boulevard dégagé au bord de la lagune avec la ville visible à l’horizon',
    geometry: { viewpoint: 'ground', roadAxis: 'depth', roadType: 'open', timeOfDay: 'day', landmarks: 'straight dual carriageway with a grass median along the lagoon, street lamps, Plateau skyline ahead' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d210', title: 'Pont HKB · approche, journée', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-approche-jour.webp', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Vue routière d’un pont à haubans blanc dans la lumière du jour',
    geometry: { viewpoint: 'ground', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'day', landmarks: 'bridge deck with a white pylon and cables ahead' },
    retired: true,
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d211', title: 'Showroom contemporain · intérieur', category: 'Décor intérieur · showroom', path: '/places/showroom-contemporain-interieur.webp', location: 'Décor générique de showroom contemporain', setting: 'Espace intérieur lumineux, sol clair, grandes baies vitrées et lignes architecturales sobres',
    geometry: { viewpoint: 'interior', roadAxis: 'none', roadType: null, timeOfDay: 'interior', landmarks: 'bright empty showroom, glossy light floor, tall glass walls, clean architectural lines' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d212', title: 'Pont HKB · sur le tablier, journée', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-tablier-jour.webp', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Tablier du pont à haubans blanc, pylône et câbles devant, skyline du Plateau en journée',
    geometry: { viewpoint: 'ground', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'day', landmarks: 'bridge deck with white railings, the white single-blade pylon and its cables ahead, Plateau skyline' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d213', title: 'Pont HKB · sur le tablier, coucher de soleil', category: 'Abidjan · pont et lagune', path: '/places/abidjan-pont-hkb-tablier-coucher.webp', location: 'Abidjan, pont Henri-Konan-Bédié', setting: 'Tablier du pont à haubans blanc au coucher du soleil, lagune et skyline',
    geometry: { viewpoint: 'ground', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'golden', landmarks: 'bridge deck with white railings, the white single-blade pylon and its cables, low sun over the lagoon, Plateau skyline' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d214', title: 'Route rouge · virage', category: 'Côte d’Ivoire · route en terre', path: '/places/cote-ivoire-route-rouge-virage.webp', location: 'Côte d’Ivoire, route latéritique en zone végétalisée', setting: 'Piste rouge qui tourne vers la gauche dans une végétation tropicale dense',
    geometry: { viewpoint: 'ground', roadAxis: 'bend_left', roadType: 'unpaved', timeOfDay: 'day', landmarks: 'red laterite road curving to the left through dense tropical vegetation, forested hills in the distance' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d215', title: 'Route rouge · coucher de soleil', category: 'Côte d’Ivoire · route en terre', path: '/places/cote-ivoire-route-rouge-coucher.webp', location: 'Côte d’Ivoire, route latéritique en zone végétalisée', setting: 'Piste rouge au coucher du soleil, végétation tropicale et collines',
    geometry: { viewpoint: 'ground', roadAxis: 'depth', roadType: 'unpaved', timeOfDay: 'golden', landmarks: 'wide red laterite road between tropical bushes and trees, low sun over forested hills' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d216', title: 'La Pyramide · Plateau, coucher de soleil', category: 'Abidjan · architecture du Plateau', path: '/places/abidjan-pyramide-plateau-coucher.webp', location: 'Abidjan, Le Plateau, immeuble La Pyramide', setting: 'Carrefour devant La Pyramide au coucher du soleil',
    geometry: { viewpoint: 'ground', roadAxis: 'crossroads', roadType: 'urban', timeOfDay: 'golden', landmarks: 'wide crossroads with zebra crossings, La Pyramide terraced green building, glass tower on the left, large trees, low sun' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d217', title: 'La Pyramide · Plateau, nuit', category: 'Abidjan · architecture du Plateau', path: '/places/abidjan-pyramide-plateau-nuit.webp', location: 'Abidjan, Le Plateau, immeuble La Pyramide', setting: 'Carrefour éclairé devant La Pyramide à la tombée de la nuit',
    geometry: { viewpoint: 'ground', roadAxis: 'crossroads', roadType: 'urban', timeOfDay: 'night', landmarks: 'lit crossroads with zebra crossings and traffic lights, La Pyramide terraced green building, glass tower on the left, street lamps' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d218', title: 'Boulevard côtier · journée', category: 'Abidjan · architecture et littoral', path: '/places/abidjan-boulevard-cotier-jour.webp', location: 'Abidjan, Plateau et front de mer', setting: 'Boulevard côtier bordé de palmiers, tours du Plateau et plage en journée',
    geometry: { viewpoint: 'ground', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'day', landmarks: 'straight coastal dual carriageway with palm trees, dark-red round tower on the left, beach and water on the right' },
  },
  {
    id: 'd55c82b1-95d3-4d2e-a2d2-25068739d219', title: 'Rue urbaine d’Abidjan · coucher de soleil', category: 'Abidjan · rue urbaine', path: '/places/abidjan-rue-urbaine-coucher.webp', location: 'Abidjan, rue urbaine', setting: 'Rue en pente entre immeubles au lever ou coucher du soleil, lagune au loin',
    geometry: { viewpoint: 'ground', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'golden', landmarks: 'sloping street between apartment blocks and small shops, street lamps, palm trees, lagoon far ahead, low sun' },
  },
];

/** Every curated place, retired ones included: earlier versions keep resolving their place. */
export function findCuratedLocation(id: string): CuratedLocation | undefined {
  return locationCatalog.find((location) => location.id === id);
}

/** Curated places a new storyboard may use. */
export const selectableLocations = locationCatalog.filter((location) => !location.retired);

export function curatedLocationAsset(location: CuratedLocation) {
  return { id: location.id, kind: 'place' as const, title: location.title, category: location.category, path: location.path, status: 'validée' as const, previewUrl: location.path, isCurated: true as const, placeGeometry: location.geometry };
}

/** Max length of a place description sent to the models (the prompts are capped). */
export const PLACE_DESCRIPTION_MAX_CHARS = 220;

/**
 * Short description of a selected place, sent to the director and the video models so that everything they add
 * stays in that place (24/10: European-looking streets, a bridge « closed » behind the car). It names only what the
 * photo shows: its visible elements, never an invented landmark.
 */
export function placeDescription(place: { id: string; title?: string | null; category?: string | null; geometry?: PlaceGeometry | null }): string {
  const curated = findCuratedLocation(place.id);
  const geometry = curated?.geometry ?? place.geometry;
  const name = curated ? curated.location : [place.title, place.category].filter(Boolean).join(' · ');
  const text = geometry ? `${name}. Visible: ${geometry.landmarks}` : name;
  const clean = text.replace(/[<>{}]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > PLACE_DESCRIPTION_MAX_CHARS ? `${clean.slice(0, PLACE_DESCRIPTION_MAX_CHARS - 1).replace(/[ ,;:.]+[^ ]*$/, '')}.` : clean;
}

/**
 * Lighting sent to the image and video models for one shot: the place photo wins over the
 * Studio lighting chip, so a night location is never described as « lumière du matin ».
 */
export function resolveShotLighting(briefLighting: string, timeOfDay: PlaceTimeOfDay | null): string {
  const lighting = briefLighting.trim();
  const saysNight = /\b(?:nuit|nocturne|night|soir|soiree|soirée)\b/i.test(lighting);
  if (timeOfDay === 'night' && !saysNight) return 'Night, lit by the real street and city lights visible in the selected location photo';
  if (timeOfDay === 'golden') return 'Low, warm sun of early morning or late afternoon, as in the selected location photo';
  if (timeOfDay === 'day' && saysNight) return 'Natural daylight, as in the selected location photo';
  if (timeOfDay === 'interior') return lighting && /int[eé]rieur|interior|showroom/i.test(lighting) ? lighting : 'Soft, even interior light, as in the selected location photo';
  return lighting || 'Natural light matching the selected location photo';
}
