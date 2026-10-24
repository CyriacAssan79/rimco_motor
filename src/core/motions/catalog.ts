import { z } from 'zod';
import type { ShotType, TravelDirection, TravelSpeed } from '@/core/storyboard';
import type { PlaceGeometry, PlaceRoadAxis, PlaceViewpoint } from '@/core/assets/place-geometry';
import type { NoseSide, PhotoAngle, VehicleView } from '@/core/assets/vehicle-views';

/**
 * Closed catalogue of vehicle motions (étape 1 du catalogue de mouvements, 23/10/2026).
 * The director picks one id per shot instead of describing the motion freely; every prompt
 * (keyframe, animation, end frame, judge) then reads the same tested wording from here.
 * 25/10: the catalogue also owns the camera of each motion and the combinations a photo and a place allow,
 * used both to brief the director and to check its answer (one rule, one place).
 * Texts are English: the image and video models follow English best.
 */
export const motionIds = [
  'establishing_drive',
  'pass_by',
  'approach',
  'drive_away',
  'follow_behind',
  'side_tracking',
  'turn_left',
  'turn_right',
  'pull_away',
  'arrive_and_stop',
  'hero_still',
  'detail_glide',
] as const;
export const motionIdSchema = z.enum(motionIds);
export type MotionId = z.infer<typeof motionIdSchema>;

/** How the vehicle may drive in this motion; replaces CALM_DRIVING when set. */
export type DrivingRule = 'calm' | 'turn' | 'pull_away' | 'stop' | 'none';

export type MotionPreset = {
  id: MotionId;
  /** French label shown to the team. */
  label: string;
  shotType: ShotType;
  directions: readonly TravelDirection[];
  speeds: readonly TravelSpeed[];
  /** Photo angles the shot can start from; empty = any angle. */
  photoAngles: readonly PhotoAngle[];
  /** One line for the director's menu. */
  menu: string;
  /** The only camera of this motion (25/10: a free « camera » text contradicted the motion). */
  camera: string;
  /** Instant shown by the start keyframe. */
  keyframe: string;
  /** Motion of the car asked from the video engine. */
  animation: string;
  /** Where the car is on the closing frame; null = no end frame for this motion. */
  endFrame: string | null;
  /**
   * Étape 2: the end frame is sent by default when the arrival point is the point of the shot (turns, approach,
   * departure, start, stop). The others (pass-by, tracking, follow, establishing) use it only with
   * KEYFRAME_END_FRAME_ROLLING, until a test shows it does not cause a treadmill effect.
   */
  endFrameByDefault: boolean;
  /** Motion check given to the vision judge. */
  judge: string;
  driving: DrivingRule;
};

const MOVING_DIRECTIONS = ['left_to_right', 'right_to_left', 'towards_camera', 'away_from_camera'] as const;
const EXTERIOR_ANGLES = ['front_three_quarter', 'front', 'profile', 'rear_three_quarter', 'rear'] as const;
const TREADMILL_CHECK = 'Across the frames the vehicle must visibly change position relative to fixed elements of the scene (road markings, kerbs, posts, buildings, trees): a vehicle that stays at the same spot on the road while only the background slides (treadmill effect) is blocking.';

export const motionCatalog: Record<MotionId, MotionPreset> = {
  establishing_drive: {
    id: 'establishing_drive', label: 'Plan d’ensemble en mouvement', shotType: 'establishing',
    directions: MOVING_DIRECTIONS, speeds: ['slow', 'cruise'], photoAngles: [],
    menu: 'wide view, the car small, driving through',
    camera: 'One slow, steady move over the wide view, from the viewpoint of the place photo',
    keyframe: 'Wide view of the real place; the car is small in frame, already driving along its road.',
    animation: 'The car drives along the road through the wide scene, staying small in the frame.',
    endFrame: 'further along the road through the place, still small in frame',
    judge: 'The vehicle must visibly travel through the scene across the frames.',
    endFrameByDefault: false,
    driving: 'calm',
  },
  pass_by: {
    id: 'pass_by', label: 'Passage devant la caméra', shotType: 'rolling',
    directions: ['left_to_right', 'right_to_left'], speeds: ['slow', 'cruise', 'dynamic'], photoAngles: ['profile', 'front_three_quarter', 'rear_three_quarter'],
    menu: 'crosses the frame, static or panning camera',
    camera: 'Camera fixed at the roadside, still or panning to follow',
    keyframe: 'Captured mid-drive as it enters the frame: rims slightly motion-blurred, body sharp, the road ahead of it open.',
    animation: 'The car crosses the frame along its road and passes the fixed elements of the place, which stay in place.',
    endFrame: 'across the frame, further along the road in its direction of travel',
    judge: `${TREADMILL_CHECK} The car must cross the frame in its direction of travel.`,
    endFrameByDefault: false,
    driving: 'calm',
  },
  approach: {
    id: 'approach', label: 'Approche vers la caméra', shotType: 'rolling',
    directions: ['towards_camera'], speeds: ['slow', 'cruise'], photoAngles: ['front_three_quarter', 'front'],
    menu: 'drives towards the camera',
    camera: 'Static camera ahead of the car, beside its lane',
    keyframe: 'Captured mid-drive at a distance, coming along its lane, open road between the car and the lens.',
    animation: 'The car drives towards the camera along its lane and grows steadily in the frame; the roadside stays in place.',
    endFrame: 'much closer to the camera along its lane, clearly larger in the frame',
    judge: `${TREADMILL_CHECK} The car must grow in the frame as it approaches.`,
    endFrameByDefault: true,
    driving: 'calm',
  },
  drive_away: {
    id: 'drive_away', label: 'Départ, la voiture s’éloigne', shotType: 'rolling',
    directions: ['away_from_camera'], speeds: ['slow', 'cruise'], photoAngles: ['rear_three_quarter', 'rear'],
    menu: 'drives away from a static camera',
    camera: 'Static camera behind the car, beside its lane',
    keyframe: 'Captured mid-drive close to the camera, driving away along its lane.',
    animation: 'The car drives away along its lane and gets steadily smaller; the roadside stays in place.',
    endFrame: 'much further down the road, clearly smaller in the frame',
    judge: `${TREADMILL_CHECK} The car must get smaller in the frame as it drives away.`,
    endFrameByDefault: true,
    driving: 'calm',
  },
  follow_behind: {
    id: 'follow_behind', label: 'Suivi par l’arrière', shotType: 'rolling',
    directions: ['away_from_camera'], speeds: ['cruise', 'dynamic'], photoAngles: ['rear_three_quarter', 'rear'],
    menu: 'camera follows behind at its speed',
    camera: 'Camera following behind the car at its speed, slightly above',
    keyframe: 'Seen from behind and slightly above while driving, lane markings ahead.',
    animation: 'The car drives on along its lane; the lane markings and roadside elements pass under and beside it.',
    endFrame: 'at the same size in the frame, the road markings and roadside objects having moved past it',
    judge: 'Lane markings and roadside objects must pass under and beside the vehicle across the frames; a road that does not move is blocking.',
    endFrameByDefault: false,
    driving: 'calm',
  },
  side_tracking: {
    id: 'side_tracking', label: 'Travelling latéral', shotType: 'rolling',
    directions: ['left_to_right', 'right_to_left'], speeds: ['cruise'], photoAngles: ['profile'],
    menu: 'camera tracks alongside at its speed',
    camera: 'Camera tracking alongside the car at its height and speed',
    keyframe: 'Profile view while driving, camera alongside at the car’s height, rims motion-blurred, the roadside sharp behind it.',
    animation: 'The car stays in frame while the roadside elements pass behind it and the wheels turn.',
    endFrame: 'at the same place in the frame, the roadside behind it having moved past',
    judge: 'Roadside objects must pass behind the vehicle and its wheels must turn; still wheels on a sliding background (treadmill effect) are blocking.',
    endFrameByDefault: false,
    driving: 'calm',
  },
  turn_left: {
    id: 'turn_left', label: 'Virage à gauche', shotType: 'rolling',
    directions: ['towards_camera', 'away_from_camera'], speeds: ['slow'], photoAngles: ['front_three_quarter', 'rear_three_quarter'],
    menu: 'gentle bend to the car’s own left',
    camera: 'Static camera at the bend, panning gently to follow',
    keyframe: 'Captured mid-drive where the road starts to bend to the car’s left, still pointing along its lane.',
    animation: 'The car follows the road as it bends to the car’s own left: the front wheels steer into the turn and the car gradually changes heading along the curve.',
    endFrame: 'through the bend, now heading along the road after turning to its own left',
    judge: 'The vehicle must follow the curve of the road and change heading to its own left; turning the other way, sliding sideways or pivoting on the spot is blocking.',
    endFrameByDefault: true,
    driving: 'turn',
  },
  turn_right: {
    id: 'turn_right', label: 'Virage à droite', shotType: 'rolling',
    directions: ['towards_camera', 'away_from_camera'], speeds: ['slow'], photoAngles: ['front_three_quarter', 'rear_three_quarter'],
    menu: 'gentle bend to the car’s own right',
    camera: 'Static camera at the bend, panning gently to follow',
    keyframe: 'Captured mid-drive where the road starts to bend to the car’s right, still pointing along its lane.',
    animation: 'The car follows the road as it bends to the car’s own right: the front wheels steer into the turn and the car gradually changes heading along the curve.',
    endFrame: 'through the bend, now heading along the road after turning to its own right',
    judge: 'The vehicle must follow the curve of the road and change heading to its own right; turning the other way, sliding sideways or pivoting on the spot is blocking.',
    endFrameByDefault: true,
    driving: 'turn',
  },
  pull_away: {
    id: 'pull_away', label: 'Démarrage et accélération', shotType: 'rolling',
    directions: ['left_to_right', 'right_to_left', 'away_from_camera'], speeds: ['slow', 'cruise'], photoAngles: ['profile', 'rear_three_quarter', 'front_three_quarter', 'rear'],
    menu: 'starts from a standstill, accelerates smoothly',
    camera: 'Static camera beside the road',
    keyframe: 'The car is stopped in its lane, wheels straight, ready to drive off along the open road.',
    animation: 'The car starts from a standstill, then accelerates smoothly and progressively along its lane; the wheels start turning as it moves off.',
    endFrame: 'further along its lane after a smooth start, now driving',
    judge: 'The vehicle must start still and then move along its lane with wheels starting to turn; a jump, slide or wheels turning before it moves are blocking.',
    endFrameByDefault: true,
    driving: 'pull_away',
  },
  arrive_and_stop: {
    id: 'arrive_and_stop', label: 'Arrivée et arrêt', shotType: 'hero',
    directions: ['left_to_right', 'right_to_left', 'towards_camera'], speeds: ['slow'], photoAngles: ['front_three_quarter', 'profile', 'front'],
    menu: 'rolls in slowly and stops gently',
    camera: 'Static camera at the stopping point, panning slightly to follow',
    keyframe: 'The car rolls in slowly towards its final spot in a clean composition, wheels straight.',
    animation: 'The car rolls in slowly and comes to a smooth, gentle stop; the wheels stop turning when it stops.',
    endFrame: 'stopped at its final spot in a clean composition, wheels straight',
    judge: 'The vehicle must slow down and stop smoothly; wheels must stop turning once it is still, and it must not slide after stopping.',
    endFrameByDefault: true,
    driving: 'stop',
  },
  hero_still: {
    id: 'hero_still', label: 'Plan héros à l’arrêt', shotType: 'hero',
    directions: ['static'], speeds: ['slow'], photoAngles: EXTERIOR_ANGLES,
    menu: 'parked car, slow camera arc or push-in',
    camera: 'Slow camera arc or push-in around the parked car',
    keyframe: 'The car is stopped in a clean composition, wheels straight, the place reflected in the paint.',
    animation: 'The car holds still, wheels not turning.',
    endFrame: null,
    judge: 'Wheels must stay round and still, and the vehicle must not slide.',
    endFrameByDefault: false,
    driving: 'none',
  },
  detail_glide: {
    id: 'detail_glide', label: 'Détail en gros plan', shotType: 'detail',
    directions: ['static'], speeds: ['slow'], photoAngles: [],
    menu: 'close-up of a photographed detail',
    camera: 'One slow camera glide over the detail',
    keyframe: 'Close-up of a detail visible in the reference photos; shallow depth of field.',
    animation: 'Light moves across the surface; the car does not move.',
    endFrame: null,
    judge: '',
    endFrameByDefault: false,
    driving: 'none',
  },
};

export function getMotion(id: MotionId | undefined | null): MotionPreset | undefined {
  return id ? motionCatalog[id] : undefined;
}

const MOTION_ALIASES: Record<string, MotionId> = {
  ...Object.fromEntries(motionIds.map((id) => [id.replace(/_/g, ''), id])),
  establishing: 'establishing_drive', passby: 'pass_by', passing: 'pass_by', approaching: 'approach', driveaway: 'drive_away', departure: 'drive_away',
  followbehind: 'follow_behind', follow: 'follow_behind', sidetracking: 'side_tracking', tracking: 'side_tracking', turnleft: 'turn_left', leftturn: 'turn_left',
  turnright: 'turn_right', rightturn: 'turn_right', pullaway: 'pull_away', acceleration: 'pull_away', accelerate: 'pull_away', arrivestop: 'arrive_and_stop',
  arrival: 'arrive_and_stop', braking: 'arrive_and_stop', herostill: 'hero_still', hero: 'hero_still', detail: 'detail_glide', detailglide: 'detail_glide',
};

/** Tolerant reading: an unexpected word from the director becomes undefined, never a failed storyboard. */
export function normalizeMotion(value: unknown): MotionId | undefined {
  if (typeof value !== 'string') return undefined;
  return MOTION_ALIASES[value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')];
}

// ——— What a photo and a place allow (25/10) ———

/** Travel directions a road allows, as seen in the place photo. */
const ROAD_DIRECTIONS: Record<PlaceRoadAxis, readonly TravelDirection[]> = {
  depth: ['towards_camera', 'away_from_camera'],
  bend_left: ['towards_camera', 'away_from_camera'],
  bend_right: ['towards_camera', 'away_from_camera'],
  lateral: ['left_to_right', 'right_to_left'],
  diagonal: MOVING_DIRECTIONS,
  crossroads: MOVING_DIRECTIONS,
  none: [],
};

/**
 * Motions a viewpoint allows. A distant (aerial) photo keeps its viewpoint, so the car stays small; a high viewpoint
 * forbids road-level shots (tracking, hero, detail), which would make the image model invent a street.
 */
const VIEWPOINT_MOTIONS: Record<PlaceViewpoint, readonly MotionId[]> = {
  ground: motionIds,
  elevated: ['establishing_drive', 'pass_by', 'approach', 'drive_away', 'follow_behind', 'turn_left', 'turn_right', 'pull_away', 'arrive_and_stop'],
  distant: ['establishing_drive'],
  interior: ['hero_still', 'detail_glide'],
};

/** Side of the car a direction shows: front when it comes towards the camera, rear when it drives away, nose side otherwise. */
function viewAllowsDirection(view: VehicleView, direction: TravelDirection): boolean {
  if (direction === 'static') return true;
  if (direction === 'towards_camera') return view.angle === 'front' || view.angle === 'front_three_quarter';
  if (direction === 'away_from_camera') return view.angle === 'rear' || view.angle === 'rear_three_quarter';
  const lateral = view.angle === 'profile' || view.angle === 'front_three_quarter' || view.angle === 'rear_three_quarter';
  return lateral && view.nose === (direction === 'left_to_right' ? 'right' : 'left');
}

function placeAllowsMotion(motion: MotionPreset, place: PlaceGeometry): boolean {
  if (!VIEWPOINT_MOTIONS[place.viewpoint].includes(motion.id)) return false;
  if (motion.driving === 'none') return true;
  if (place.roadAxis === 'none') return false;
  if (motion.id === 'turn_left') return place.roadAxis === 'bend_left' || place.roadAxis === 'crossroads';
  if (motion.id === 'turn_right') return place.roadAxis === 'bend_right' || place.roadAxis === 'crossroads';
  return true;
}

/** Directions allowed for this motion from this photo in this place; [] = the motion is impossible there. */
export function allowedDirections(motionId: MotionId, view: VehicleView, place: PlaceGeometry | null | undefined): TravelDirection[] {
  const motion = motionCatalog[motionId];
  if (!place || !placeAllowsMotion(motion, place)) return [];
  if (motion.photoAngles.length && !(view.angle && motion.photoAngles.includes(view.angle))) return [];
  if (motion.driving === 'none') return ['static'];
  // A road that bends away from the camera: a turn is only seen from behind (a car coming out of the bend points elsewhere).
  const bendTurn = motion.driving === 'turn' && place.roadAxis.startsWith('bend');
  return motion.directions.filter((direction) => ROAD_DIRECTIONS[place.roadAxis].includes(direction)
    && (!bendTurn || direction === 'away_from_camera') && viewAllowsDirection(view, direction));
}

/** Speeds allowed for this motion in this place: brisk driving only on an open road. */
export function allowedSpeeds(motionId: MotionId, place: PlaceGeometry | null | undefined): TravelSpeed[] {
  return motionCatalog[motionId].speeds.filter((speed) => speed !== 'dynamic' || place?.roadType === 'open');
}

/** Every motion this photo allows in this place, with its directions (the menu the director picks from). */
export function allowedMoves(view: VehicleView, place: PlaceGeometry | null | undefined): Partial<Record<MotionId, TravelDirection[]>> {
  return Object.fromEntries(motionIds.map((id) => [id, allowedDirections(id, view, place)]).filter(([, directions]) => directions.length > 0));
}

function movesHint(view: VehicleView, place: PlaceGeometry | null | undefined): string {
  const moves = Object.entries(allowedMoves(view, place)).map(([id, directions]) => `${id} (${directions.join('/')})`);
  return moves.length ? `Possibles avec cette photo dans ce lieu : ${moves.join(', ')}.` : 'Aucun mouvement possible avec cette photo dans ce lieu : choisis une autre photo ou un autre lieu.';
}

// ——— Screen direction across the film ———

const NOSE: Record<'left_to_right' | 'right_to_left' | 'towards_camera' | 'away_from_camera', string> = {
  left_to_right: 'to the right side of the frame',
  right_to_left: 'to the left side of the frame',
  towards_camera: 'towards the camera (its front is seen)',
  away_from_camera: 'away from the camera (its rear is seen)',
};

/** Screen side a turn leads to: a car facing the camera that turns to its own right goes to the frame's left. */
export function turnScreenSide(motion: MotionId | undefined, direction: TravelDirection | undefined): 'left' | 'right' | null {
  if ((motion !== 'turn_left' && motion !== 'turn_right') || (direction !== 'towards_camera' && direction !== 'away_from_camera')) return null;
  const ownRight = motion === 'turn_right';
  return direction === 'towards_camera' ? (ownRight ? 'left' : 'right') : (ownRight ? 'right' : 'left');
}

/**
 * Screen side the car travels towards at the start of a moving shot: the direction itself when it crosses the frame,
 * the photo's nose side when a three-quarter view comes towards or goes away from the camera; null = no side.
 */
export function startScreenSide(direction: TravelDirection | undefined, view: VehicleView): NoseSide | null {
  if (direction === 'left_to_right') return 'right';
  if (direction === 'right_to_left') return 'left';
  if ((direction === 'towards_camera' || direction === 'away_from_camera') && (view.angle === 'front_three_quarter' || view.angle === 'rear_three_quarter')) return view.nose ?? null;
  return null;
}

type HeadingShot = { motion?: MotionId; travelDirection?: TravelDirection; vehicleNose?: NoseSide };

/** Where the car's nose points at the start of a moving shot, in screen terms (essai B, 24/10), from its own photo. */
export function headingAtStart(shot: HeadingShot): string | null {
  const direction = shot.travelDirection;
  if (!direction || direction === 'static' || getMotion(shot.motion)?.driving === 'none') return null;
  if ((direction === 'towards_camera' || direction === 'away_from_camera') && shot.vehicleNose) {
    return `Its nose points ${direction === 'towards_camera' ? 'towards the camera' : 'away from the camera'}, angled to the frame's ${shot.vehicleNose}, as in its photo.`;
  }
  return `The car’s nose points ${NOSE[direction]}.`;
}

/** Where the car's nose points on the closing frame: unchanged, or towards the turn's screen side. */
export function headingAtEnd(shot: HeadingShot): string | null {
  const side = turnScreenSide(shot.motion, shot.travelDirection);
  if (side) return `After turning to its own ${shot.motion === 'turn_right' ? 'right' : 'left'}, the car’s nose points towards the ${side} side of the frame.`;
  const start = headingAtStart(shot);
  return start ? `${start.slice(0, -1)}, exactly as at the start.` : null;
}

// ——— Coherence of the director's answer ———

export type CoherenceShot = {
  title?: string; motion?: MotionId; travelDirection?: TravelDirection; travelSpeed?: TravelSpeed;
  vehiclePhotoId?: string; locationPhotoId?: string | null; action?: string;
};
/** Views of the selected photos and geometry of the selected places, by id. */
export type CoherenceContext = { photos: Record<string, VehicleView>; places: Record<string, PlaceGeometry | null> };

/** The car's movement belongs to « motion », never to the free « action » text (22/10: a « hero » shot whose action said « arrives then stops »). */
const CAR_MOTION_IN_ACTION = /\b(?:turns?|turning|reverses?|reversing|backs? up|u-turns?|drifts?|drifting|skids?|skidding|spins?|spinning|accelerat\w*|speeds? up|brakes?|braking|stops?|stopping|halts?|overtak\w*)\b/i;

/**
 * Coherence of one shot with its motion, its photo and its place. The director's answer is checked, never silently
 * rewritten: an issue makes the answer invalid, which triggers the automatic corrected retry.
 */
export function shotCoherenceIssues(shot: CoherenceShot, context: CoherenceContext): string[] {
  const label = shot.title ? `Plan « ${shot.title} »` : 'Un plan';
  const motion = getMotion(shot.motion);
  if (!motion) return [`${label} : mouvement absent ou inconnu (motion doit être l’un de : ${motionIds.join(', ')}).`];
  const view = context.photos[shot.vehiclePhotoId ?? ''] ?? {};
  const place = shot.locationPhotoId ? context.places[shot.locationPhotoId] : undefined;
  if (!place) return [`${label} : lieu absent ou non décrit.`];
  const issues: string[] = [];
  const directions = allowedDirections(motion.id, view, place);
  if (!directions.length) issues.push(`${label} : ${motion.id} est impossible avec cette photo dans ce lieu. ${movesHint(view, place)}`);
  else if (motion.driving === 'none') {
    if (shot.travelDirection && shot.travelDirection !== 'static') issues.push(`${label} : ${motion.id} est un plan à l’arrêt, travelDirection vaut static.`);
  } else {
    if (!shot.travelDirection || !directions.includes(shot.travelDirection)) issues.push(`${label} : avec cette photo dans ce lieu, ${motion.id} accepte travelDirection ${directions.join(' ou ')}.`);
    const speeds = allowedSpeeds(motion.id, place);
    if (!shot.travelSpeed || !speeds.includes(shot.travelSpeed)) issues.push(`${label} : dans ce lieu, ${motion.id} accepte travelSpeed ${speeds.join(' ou ')}.`);
  }
  if (shot.action && CAR_MOTION_IN_ACTION.test(shot.action)) issues.push(`${label} : « action » ne décrit jamais le mouvement de la voiture (virage, arrêt, accélération…) : il vient de motion.`);
  return issues;
}

/** True when some selected photo can drive in some selected place. */
function drivingPossible(context: CoherenceContext): boolean {
  const views = Object.values(context.photos);
  return Object.values(context.places).some((place) => views.some((view) => motionIds.some((id) => motionCatalog[id].driving !== 'none' && allowedDirections(id, view, place).length > 0)));
}

/** All coherence issues of a storyboard, shot by shot and for the whole film; null when coherent. */
export function storyboardCoherenceIssue(shots: CoherenceShot[], context: CoherenceContext): string | null {
  const issues = shots.flatMap((shot) => shotCoherenceIssues(shot, context));
  if (shots.filter((shot) => shot.motion === 'side_tracking').length > 1) issues.push('Un seul travelling latéral (side_tracking) par film.');
  const times = new Set(shots.map((shot) => shot.locationPhotoId ? context.places[shot.locationPhotoId]?.timeOfDay : undefined).filter((time) => time && time !== 'interior'));
  if (times.size > 1) issues.push(`Un seul moment de la journée par film : n’utilise que des lieux de même timeOfDay (ici ${[...times].join(', ')}).`);
  // One screen direction for the whole film; after a turn, the next shots continue towards the turn's exit side.
  let side: NoseSide | null = null;
  shots.forEach((shot) => {
    const motion = getMotion(shot.motion);
    if (!motion || motion.driving === 'none') return;
    const view = context.photos[shot.vehiclePhotoId ?? ''] ?? {};
    const start = startScreenSide(shot.travelDirection, view);
    if (start && side && start !== side) issues.push(`Plan « ${shot.title ?? ''} » : le film va vers la ${side === 'left' ? 'gauche' : 'droite'} de l’image ; ce plan part vers la ${start === 'left' ? 'gauche' : 'droite'}.`);
    side = turnScreenSide(shot.motion, shot.travelDirection) ?? start ?? side;
  });
  if (shots.length >= 2 && drivingPossible(context)) {
    const moving = shots.filter((shot) => (getMotion(shot.motion)?.driving ?? 'none') !== 'none').length;
    if (moving < Math.ceil(shots.length / 2)) issues.push(`Au moins la moitié des plans roulent (${moving} sur ${shots.length}).`);
  }
  return issues.length ? issues.join(' ') : null;
}

/** The director's motion menu: one compact entry per motion with its speeds (the combinations are listed per photo and place). */
export function directorMotionMenu(): string {
  return motionIds.map((id) => `${id} = ${motionCatalog[id].menu} [${motionCatalog[id].speeds.join('|')}]`).join('; ');
}
