import { z } from 'zod';

/**
 * What a place photo really shows (25/10/2026). The director never sees the photo: without this, it asked a car
 * to cross the frame on a road that runs to the horizon, or to drive at road level in an aerial view, and the image
 * model invented a road (and a city) to obey. Curated places carry it in code, uploaded places in `assets.place_*`.
 */
export const placeViewpoints = ['ground', 'elevated', 'distant', 'interior'] as const;
/** Road as seen in the photo: `depth` runs from the camera to the horizon, `lateral` crosses the frame. */
export const placeRoadAxes = ['depth', 'lateral', 'diagonal', 'bend_left', 'bend_right', 'crossroads', 'none'] as const;
export const placeRoadTypes = ['urban', 'open', 'unpaved'] as const;
export const placeTimesOfDay = ['day', 'golden', 'night', 'interior'] as const;

export type PlaceViewpoint = (typeof placeViewpoints)[number];
export type PlaceRoadAxis = (typeof placeRoadAxes)[number];
export type PlaceRoadType = (typeof placeRoadTypes)[number];
export type PlaceTimeOfDay = (typeof placeTimesOfDay)[number];

/** Max length of the visible-elements text sent to the models (the prompts are capped). */
export const PLACE_LANDMARKS_MAX_CHARS = 160;

export const placeGeometrySchema = z.object({
  viewpoint: z.enum(placeViewpoints),
  roadAxis: z.enum(placeRoadAxes),
  roadType: z.enum(placeRoadTypes).nullable(),
  timeOfDay: z.enum(placeTimesOfDay),
  /** Short list of what is really visible (English or French); the only elements a prompt may name. */
  landmarks: z.string().trim().min(3).max(PLACE_LANDMARKS_MAX_CHARS).transform((value) => value.replace(/[<>{}]/g, ' ').replace(/\s+/g, ' ').trim()),
}).superRefine((place, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if ((place.viewpoint === 'interior') !== (place.timeOfDay === 'interior')) issue('Un lieu intérieur a le point de vue et le moment « Intérieur », et seulement lui.');
  if (place.viewpoint === 'interior' && place.roadAxis !== 'none') issue('Un lieu intérieur n’a pas de route.');
  if (place.viewpoint === 'distant' && place.roadAxis === 'none') issue('Une vue lointaine doit montrer une route où la voiture peut rouler.');
  if (place.roadAxis !== 'none' && !place.roadType) issue('Indiquez le type de route.');
});
export type PlaceGeometry = z.infer<typeof placeGeometrySchema>;

/** French labels of the media library form. */
export const placeViewpointLabels: Record<PlaceViewpoint, string> = {
  ground: 'Au niveau de la route',
  elevated: 'En hauteur (balcon, toit, talus)',
  distant: 'Vue lointaine ou aérienne',
  interior: 'Intérieur',
};
export const placeRoadAxisLabels: Record<PlaceRoadAxis, string> = {
  depth: 'Route qui file vers l’horizon',
  lateral: 'Route qui traverse l’image',
  diagonal: 'Route en diagonale',
  bend_left: 'Route qui tourne vers la gauche',
  bend_right: 'Route qui tourne vers la droite',
  crossroads: 'Carrefour',
  none: 'Aucune route visible',
};
export const placeRoadTypeLabels: Record<PlaceRoadType, string> = {
  urban: 'En ville',
  open: 'Route dégagée hors ville',
  unpaved: 'Piste non goudronnée',
};
export const placeTimeOfDayLabels: Record<PlaceTimeOfDay, string> = {
  day: 'Journée',
  golden: 'Lever ou coucher du soleil',
  night: 'Nuit',
  interior: 'Intérieur',
};

/** Columns of `assets` holding the geometry of an uploaded place (migration 0032). */
export const PLACE_GEOMETRY_COLUMNS = 'place_viewpoint,place_road_axis,place_road_type,place_time_of_day,place_landmarks';
export type PlaceGeometryRow = {
  place_viewpoint?: string | null;
  place_road_axis?: string | null;
  place_road_type?: string | null;
  place_time_of_day?: string | null;
  place_landmarks?: string | null;
};

/** Geometry of an uploaded place; null while an admin has not described it. */
export function placeGeometryFromRow(row: PlaceGeometryRow): PlaceGeometry | null {
  const parsed = placeGeometrySchema.safeParse({
    viewpoint: row.place_viewpoint, roadAxis: row.place_road_axis, roadType: row.place_road_type ?? null,
    timeOfDay: row.place_time_of_day, landmarks: row.place_landmarks,
  });
  return parsed.success ? parsed.data : null;
}

export function placeGeometryToRow(place: PlaceGeometry): Required<PlaceGeometryRow> {
  return {
    place_viewpoint: place.viewpoint, place_road_axis: place.roadAxis, place_road_type: place.roadAxis === 'none' ? null : place.roadType,
    place_time_of_day: place.timeOfDay, place_landmarks: place.landmarks,
  };
}
