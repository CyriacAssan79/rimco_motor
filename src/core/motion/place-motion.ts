import { z } from 'zod';
import { parseVehicleView, type NoseSide, type VehicleView } from '@/core/assets/vehicle-views';
import type { ShotType, StoryboardShot, TravelDirection, TravelSpeed } from '@/core/storyboard';

/**
 * Place sheet (« fiche de lieu », 26/10): one schema for the curated catalogue and the uploaded places, read by the
 * director, the prompts and the judges. The keyframe re-stages the car from the shot's viewpoint, so a place is
 * described by its road, never by the axes of its photo: `along` = the car follows the road towards or away from the
 * camera, `across` = the camera stands at the roadside and the car crosses the frame. Travel directions are not
 * stored: they come from the road axes crossed with the vehicle photo (its nose side).
 */
const SHOT_TYPES = ['establishing', 'rolling', 'detail', 'hero'] as const satisfies readonly ShotType[];
const SPEEDS = ['slow', 'cruise', 'dynamic'] as const satisfies readonly TravelSpeed[];
const SPEED_RANK: Record<TravelSpeed, number> = { slow: 0, cruise: 1, dynamic: 2 };
export const PLACE_TIMES_OF_DAY = ['day', 'golden', 'night', 'interior'] as const;
export const PLACE_VIEWS = ['road', 'elevated', 'aerial'] as const;
export const ROAD_AXES = ['along', 'across'] as const;
export type PlaceTimeOfDay = (typeof PLACE_TIMES_OF_DAY)[number];

/** Short English description sent to the models; the time of day lives in `timeOfDay` only. */
export const PROMPT_EN_MAX_CHARS = 140;
const TIME_WORDS = /\b(?:day(?:light|time)?|night\w*|morning|evening|sunset|sunrise|dusk|dawn|golden|noon|midday|afternoon|twilight|low sun)\b/i;
const cleanText = (value: string) => value.replace(/[<>{}[\]`"\\]/g, ' ').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const promptEnSchema = z.string().max(400).transform(cleanText)
  .refine((value) => value.length <= PROMPT_EN_MAX_CHARS, `La description anglaise fait au plus ${PROMPT_EN_MAX_CHARS} caractères.`)
  .refine((value) => !TIME_WORDS.test(value), 'La description anglaise ne donne pas de moment de la journée : il est réglé à part.');

const unique = <T>(values: T[]) => [...new Set(values)];

export const placeProfileSchema = z.object({
  timeOfDay: z.enum(PLACE_TIMES_OF_DAY),
  /** `road` = photo at road level; `elevated` = from a balcony or a roof; `aerial` = seen from the sky. */
  view: z.enum(PLACE_VIEWS),
  roadAxes: z.array(z.enum(ROAD_AXES)).max(2).transform(unique),
  shotTypes: z.array(z.enum(SHOT_TYPES)).min(1).max(4).transform(unique),
  dust: z.boolean(),
  maxSpeed: z.enum(SPEEDS),
  promptEn: promptEnSchema.default(''),
  /** Readable signs in the photo: the first cause of text copied into the images (warning shown to the admin). */
  hasReadableText: z.boolean().default(false),
}).strict().superRefine((profile, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if (profile.timeOfDay === 'interior') {
    if (profile.roadAxes.length) issue('Dans un lieu intérieur, la voiture reste immobile : aucun sens de marche.');
    if (profile.shotTypes.some((type) => type !== 'hero' && type !== 'detail')) issue('Un lieu intérieur ne permet que les plans héros et détails.');
    if (profile.dust) issue('Pas de poussière dans un lieu intérieur.');
  } else if (!profile.roadAxes.length) issue('Indiquez au moins un sens de marche pour un lieu extérieur.');
  if (profile.view === 'aerial' && profile.shotTypes.some((type) => type !== 'establishing')) issue('Une vue aérienne ne permet que le plan d’ensemble.');
  if (profile.view === 'elevated' && profile.shotTypes.some((type) => type === 'hero' || type === 'detail')) issue('Une vue en hauteur ne permet ni plan héros ni plan détail.');
});
export type PlaceProfile = z.infer<typeof placeProfileSchema>;

const plain = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const placeText = (place: { title?: string | null; category?: string | null; path?: string | null }) => plain([place.title, place.category, place.path].filter(Boolean).join(' '));

/** True when the title, category or file name says the place is indoors (checked before any time of day). */
export function isInteriorPlaceText(place: { title?: string | null; category?: string | null; path?: string | null }): boolean {
  return /\b(?:interieur|interior|showroom|indoor)\b/.test(placeText(place));
}

/**
 * Time of day guessed from a title, category or file name; only for a place without a sheet.
 * Indoors is tested first (26/10: « Showroom · nuit » was read as a night street). null = nothing stated.
 */
export function guessTimeOfDay(place: { title?: string | null; category?: string | null; path?: string | null }): PlaceTimeOfDay | null {
  if (isInteriorPlaceText(place)) return 'interior';
  const text = placeText(place);
  if (/\b(?:nuit|nocturne|night|soir|soiree)\b/.test(text)) return 'night';
  if (/\b(?:coucher|lever|sunset|sunrise|golden|crepuscule)\b/.test(text)) return 'golden';
  if (/\b(?:jour|journee|day|matin|midi)\b/.test(text)) return 'day';
  return null;
}

/**
 * Prudent profile of a place without a validated sheet (validated before 26/10, or never described): hero and
 * detail shots only, a slow arrival along the road at most, no dust; indoors (showroom) when its name says so.
 */
export function defaultPlaceProfile(place: { title?: string | null; category?: string | null; path?: string | null }): PlaceProfile {
  const timeOfDay = guessTimeOfDay(place) ?? 'day';
  return timeOfDay === 'interior'
    ? { timeOfDay, view: 'road', roadAxes: [], shotTypes: ['hero', 'detail'], dust: false, maxSpeed: 'slow', promptEn: '', hasReadableText: false }
    : { timeOfDay, view: 'road', roadAxes: ['along'], shotTypes: ['hero', 'detail'], dust: false, maxSpeed: 'slow', promptEn: '', hasReadableText: false };
}

/** Validated sheet of an uploaded place (`assets.place_profile`), or the prudent default (`described: false`). */
export function resolvePlaceProfile(place: { title?: string | null; category?: string | null; path?: string | null; place_profile?: unknown }): { profile: PlaceProfile; described: boolean } {
  const parsed = placeProfileSchema.safeParse(place.place_profile);
  return parsed.success ? { profile: parsed.data, described: true } : { profile: defaultPlaceProfile(place), described: false };
}

/** A place is validated together with its sheet: without a valid sheet it cannot be validated. */
export function placeValidationIssue(input: { kind: string; status: string; placeProfile?: unknown }): string | null {
  if (input.kind !== 'place' || input.status !== 'validée') return null;
  return placeProfileSchema.safeParse(input.placeProfile).success ? null : 'Vérifiez et complétez la fiche du lieu avant de le valider.';
}

/**
 * Sheet proposed by the vision model, brought back to a coherent sheet before the admin sees it (model output:
 * enums only, the English description cleaned, its time-of-day words removed). null = unusable answer.
 */
export function normalizePlaceProposal(raw: unknown): PlaceProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const timeOfDay = z.enum(PLACE_TIMES_OF_DAY).safeParse(value.timeOfDay);
  if (!timeOfDay.success) return null;
  const listOf = <T extends string>(options: readonly T[], input: unknown) => unique((Array.isArray(input) ? input : []).filter((entry): entry is T => options.includes(entry as T)));
  const view = z.enum(PLACE_VIEWS).catch('road').parse(value.view);
  let roadAxes = listOf(ROAD_AXES, value.roadAxes);
  let shotTypes = listOf(SHOT_TYPES, value.shotTypes);
  let dust = value.dust === true;
  if (timeOfDay.data === 'interior') {
    roadAxes = [];
    shotTypes = shotTypes.filter((type) => type === 'hero' || type === 'detail');
    if (!shotTypes.length) shotTypes = ['hero', 'detail'];
    dust = false;
  } else if (!roadAxes.length) roadAxes = ['along'];
  if (view === 'aerial') shotTypes = ['establishing'];
  if (view === 'elevated') shotTypes = shotTypes.filter((type) => type === 'establishing' || type === 'rolling');
  if (!shotTypes.length) shotTypes = view === 'elevated' ? ['establishing', 'rolling'] : ['hero', 'detail'];
  const description = cleanText(typeof value.promptEn === 'string' ? value.promptEn.slice(0, 400) : '').replace(new RegExp(TIME_WORDS.source, 'gi'), ' ').replace(/\s+([,.;])/g, '$1').replace(/\s+/g, ' ').trim();
  const promptEn = description.length > PROMPT_EN_MAX_CHARS ? `${description.slice(0, PROMPT_EN_MAX_CHARS - 1).replace(/[ ,;:.]+[^ ]*$/, '')}.` : description;
  const parsed = placeProfileSchema.safeParse({
    timeOfDay: timeOfDay.data, view: timeOfDay.data === 'interior' ? 'road' : view, roadAxes, shotTypes, dust,
    maxSpeed: z.enum(SPEEDS).catch('slow').parse(value.maxSpeed), promptEn,
    // Unknown = assume readable text (the prudent side: the admin sees the warning).
    hasReadableText: typeof value.hasReadableText === 'boolean' ? value.hasReadableText : true,
  });
  return parsed.success ? parsed.data : null;
}

/** View of a vehicle photo: its angle text, or its role when the photo is an interior or detail view. */
export function vehicleViewOf(photo: { angle?: string | null; title?: string | null; photo_role?: string | null }): VehicleView {
  if (photo.photo_role === 'interior') return { angle: 'interior' };
  if (photo.photo_role === 'detail') return { angle: 'detail' };
  return parseVehicleView(photo.angle ?? photo.title);
}

const lateral = (nose: NoseSide): TravelDirection => nose === 'left' ? 'right_to_left' : 'left_to_right';

/**
 * Directions a photo allows: the car shows the side seen on its photo (front when it comes towards the camera, rear
 * when it drives away, the nose side when it crosses the frame). `null` = unknown view: no constraint (as before).
 */
export function photoDirections(view: VehicleView): TravelDirection[] | null {
  const nose = view.nose ? [lateral(view.nose)] : [];
  switch (view.angle) {
    case 'front_three_quarter': return ['static', 'towards_camera', ...nose];
    case 'front': return ['static', 'towards_camera'];
    case 'profile': return ['static', ...(view.nose ? nose : ['left_to_right', 'right_to_left'] as TravelDirection[])];
    case 'rear_three_quarter': return ['static', 'away_from_camera', ...nose];
    case 'rear': return ['static', 'away_from_camera'];
    case 'interior':
    case 'detail': return ['static'];
    default: return null;
  }
}

const ALL_DIRECTIONS: TravelDirection[] = ['static', 'towards_camera', 'away_from_camera', 'left_to_right', 'right_to_left'];

function placeAllows(profile: PlaceProfile, shotType: ShotType, direction: TravelDirection): boolean {
  if (!profile.shotTypes.includes(shotType)) return false;
  // A stopped car is a hero or a detail shot; rolling and establishing shots always drive.
  if (direction === 'static') return shotType === 'hero' || shotType === 'detail';
  const axis = direction === 'towards_camera' || direction === 'away_from_camera' ? 'along' : 'across';
  return profile.roadAxes.includes(axis);
}

/** Allowed directions per shot type for one place and one photo (shot types with none are left out). */
export function allowedCombinations(profile: PlaceProfile, view: VehicleView): Partial<Record<ShotType, TravelDirection[]>> {
  const fromPhoto = photoDirections(view) ?? ALL_DIRECTIONS;
  return Object.fromEntries(SHOT_TYPES
    .map((type) => [type, fromPhoto.filter((direction) => placeAllows(profile, type, direction))] as const)
    .filter(([, directions]) => directions.length > 0));
}

/**
 * Matrix frozen in `brief_json.motionMatrix` at creation: the sheet of each place, the view of each photo and the
 * places without a validated sheet (prudent default). Editing a place never changes a video already launched.
 */
export const motionMatrixSchema = z.object({
  places: z.record(z.string(), placeProfileSchema),
  photos: z.record(z.string(), z.object({ angle: z.enum(['front_three_quarter', 'front', 'profile', 'rear_three_quarter', 'rear', 'interior', 'detail']).optional(), nose: z.enum(['left', 'right']).optional() })),
  undescribed: z.array(z.string()).default([]),
});
export type MotionMatrix = z.infer<typeof motionMatrixSchema>;

/** Matrix of a version; undefined for versions created before 26/10, which keep their behaviour. */
export function storedMotionMatrix(brief: Record<string, unknown>): MotionMatrix | undefined {
  const parsed = motionMatrixSchema.safeParse(brief.motionMatrix);
  return parsed.success ? parsed.data : undefined;
}

/** Speed actually asked from the engines (travelSentence: a hero arrival is slow, no speed = cruise). */
function effectiveSpeed(shot: Pick<StoryboardShot, 'shotType' | 'travelSpeed'>): TravelSpeed {
  return shot.shotType === 'hero' ? 'slow' : shot.travelSpeed ?? 'cruise';
}

const DUST_TEXT = /\b(?:dust\w*|poussi\w*)\b/i;

/** Issues of one shot against the matrix (French: shown to the director as the reason of its corrected retry). */
export function shotMotionIssues(shot: StoryboardShot, matrix: MotionMatrix): string[] {
  const profile = shot.locationPhotoId ? matrix.places[shot.locationPhotoId] : undefined;
  if (!profile) return [];
  const label = `« ${shot.title} »`;
  const combos = allowedCombinations(profile, matrix.photos[shot.vehiclePhotoId] ?? {});
  const list = Object.entries(combos).map(([type, directions]) => `${type} (${directions!.join(', ')})`).join(', ') || 'aucune';
  const type = shot.shotType ?? 'rolling';
  const issues: string[] = [];
  const directions = combos[type];
  if (!directions) issues.push(`${label} : shotType ${type} impossible avec cette photo dans ce lieu. Combinaisons possibles : ${list}.`);
  else if (!shot.travelDirection || !directions.includes(shot.travelDirection)) issues.push(`${label} : travelDirection ${shot.travelDirection ?? 'absent'} impossible pour ${type} avec cette photo dans ce lieu (possibles : ${directions.join(', ')}).`);
  if (shot.travelDirection && shot.travelDirection !== 'static' && SPEED_RANK[effectiveSpeed(shot)] > SPEED_RANK[profile.maxSpeed]) issues.push(`${label} : vitesse maximale dans ce lieu : ${profile.maxSpeed}.`);
  if (!profile.dust && [shot.scene, shot.framing, shot.location, shot.action, shot.camera].some((text) => DUST_TEXT.test(text))) issues.push(`${label} : pas de poussière dans ce lieu.`);
  return issues;
}

/** Same mechanism as interiorShotIssue: an answer outside the matrix is invalid and triggers the corrected retry. */
export function motionMatrixIssue(shots: StoryboardShot[], matrix: MotionMatrix): string | null {
  const issues = shots.flatMap((shot) => shotMotionIssues(shot, matrix));
  return issues.length ? issues.join(' ') : null;
}

/**
 * A director correction never leaves the matrix: when it does, the shot keeps its approved motion (shot type,
 * direction, speed) and only the wording changes; if the wording itself breaks it (dust), the approved shot is kept.
 */
export function keepWithinMatrix(original: StoryboardShot, revised: StoryboardShot, matrix: MotionMatrix | undefined): StoryboardShot {
  if (!matrix || !shotMotionIssues(revised, matrix).length) return revised;
  const motion = { ...revised, shotType: original.shotType, travelDirection: original.travelDirection, travelSpeed: original.travelSpeed };
  return shotMotionIssues(motion, matrix).length ? original : motion;
}

const SHOT_PREFERENCE: ShotType[] = ['rolling', 'establishing', 'hero', 'detail'];

/**
 * Server-side guard at creation, like holdStillInInterior: a storyboard edited in the Studio (or a simulated one)
 * is brought back into the matrix, keeping its shot type and direction when they are allowed. The director's own
 * answer is never rewritten this way: it is refused and corrected (motionMatrixIssue).
 */
export function fitShotToMatrix(shot: StoryboardShot, matrix: MotionMatrix): StoryboardShot {
  const profile = shot.locationPhotoId ? matrix.places[shot.locationPhotoId] : undefined;
  if (!profile || !shotMotionIssues(shot, matrix).length) return shot;
  const combos = allowedCombinations(profile, matrix.photos[shot.vehiclePhotoId] ?? {});
  const type = combos[shot.shotType ?? 'rolling'] ? shot.shotType ?? 'rolling' : SHOT_PREFERENCE.find((candidate) => combos[candidate]);
  if (!type) return shot;
  const directions = combos[type]!;
  const travelDirection = shot.travelDirection && directions.includes(shot.travelDirection) ? shot.travelDirection : directions.find((direction) => direction !== 'static') ?? directions[0];
  const moving = travelDirection !== 'static';
  const travelSpeed = !moving ? undefined : SPEED_RANK[shot.travelSpeed ?? 'cruise'] > SPEED_RANK[profile.maxSpeed] ? profile.maxSpeed : shot.travelSpeed ?? (profile.maxSpeed === 'slow' ? 'slow' : 'cruise');
  return { ...shot, shotType: type, travelDirection, travelSpeed };
}

/** Matrix of a storyboard: the resolved sheet of each selected place and the view of each selected photo. */
export function buildMotionMatrix(places: Array<{ id: string; profile: PlaceProfile; described?: boolean }>, photos: Array<{ id: string; angle?: string | null; title?: string | null; photo_role?: string | null }>): MotionMatrix {
  return {
    places: Object.fromEntries(places.map((place) => [place.id, place.profile])),
    photos: Object.fromEntries(photos.map((photo) => [photo.id, vehicleViewOf(photo)])),
    undescribed: places.filter((place) => place.described === false).map((place) => place.id),
  };
}

/** Columns read for {@link loadPlaceProfiles}. */
export const PLACE_PROFILE_COLUMNS = 'id,place_profile';

/**
 * Sheets of uploaded places (`assets.place_profile`). Before migration 0034 the column does not exist: every
 * uploaded place then gets the prudent default instead of the Studio failing.
 */
export async function loadPlaceProfiles(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Record<string, unknown>> {
  const { data, error } = await query;
  if (error) {
    console.warn('place_profiles_unavailable', error.message);
    return {};
  }
  return Object.fromEntries((Array.isArray(data) ? data as Array<{ id?: unknown; place_profile?: unknown }> : [])
    .filter((row) => typeof row.id === 'string').map((row) => [row.id as string, row.place_profile]));
}

/** What a director correction may still choose for one shot (given to it as data in its instruction). */
export function shotMotionAllowance(shot: StoryboardShot, matrix: MotionMatrix): string | undefined {
  const profile = shot.locationPhotoId ? matrix.places[shot.locationPhotoId] : undefined;
  if (!profile) return undefined;
  return JSON.stringify({ allowed: allowedCombinations(profile, matrix.photos[shot.vehiclePhotoId] ?? {}), maxSpeed: profile.maxSpeed, dust: profile.dust });
}

/** Short refs of the places (L1, L2…) and photos (P1, P2…) used in the director's table, explained once in its lists. */
export type MotionRefs = { places: Record<string, string>; photos: Record<string, string> };

export function motionRefs(placeIds: readonly string[], photoIds: readonly string[]): MotionRefs {
  return {
    places: Object.fromEntries(placeIds.map((id, index) => [id, `L${index + 1}`])),
    photos: Object.fromEntries(photoIds.map((id, index) => [id, `P${index + 1}`])),
  };
}

/**
 * Compact table given to the director: per place, the accepted shotType → travelDirection of each photo.
 * 26/10 (vérification « preambule »): refs instead of the ids repeated for every place (12 places × 6 photos made a
 * 9 700-character table), photos with the same combinations grouped. What the code checks is unchanged (ids).
 */
export function directorMotionTable(matrix: MotionMatrix, refs: MotionRefs = motionRefs(Object.keys(matrix.places), Object.keys(matrix.photos))): string {
  return Object.entries(matrix.places).map(([placeId, profile]) => {
    const groups = new Map<string, string[]>();
    for (const [photoId, view] of Object.entries(matrix.photos)) {
      const combos = Object.entries(allowedCombinations(profile, view)).map(([type, directions]) => `${type} ${directions!.join('/')}`).join(', ') || 'none';
      groups.set(combos, [...groups.get(combos) ?? [], refs.photos[photoId] ?? photoId]);
    }
    const head = `${refs.places[placeId] ?? placeId}${matrix.undescribed.includes(placeId) ? ' (default)' : ''}: maxSpeed ${profile.maxSpeed}${profile.dust ? ', dust' : ''}`;
    return `${head}; ${[...groups].map(([combos, photos]) => `${photos.join(',')} ${combos}`).join('; ')}`;
  }).join(' | ');
}
