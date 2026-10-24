import { z } from 'zod';
import type { ShotType, TravelDirection, TravelSpeed } from '@/core/storyboard';

/**
 * Closed catalogue of vehicle motions (étape 1 du catalogue de mouvements, 23/10/2026).
 * The director picks one id per shot instead of describing the motion freely; every prompt
 * (keyframe, animation, end frame, judge) then reads the same tested wording from here.
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

/** Vehicle photo angle, read from the free « angle » text of an approved photo. */
export type PhotoAngle = 'front_three_quarter' | 'front' | 'profile' | 'rear_three_quarter' | 'rear' | 'interior' | 'detail';

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
  /** Instant shown by the start keyframe. */
  keyframe: string;
  /** Motion asked from the video engine. */
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
const TREADMILL_CHECK = 'Across the frames the vehicle must visibly change position relative to fixed elements of the scene (road markings, kerbs, posts, buildings, trees): a vehicle that stays at the same spot on the road while only the background slides (treadmill effect) is blocking.';

export const motionCatalog: Record<MotionId, MotionPreset> = {
  establishing_drive: {
    id: 'establishing_drive', label: 'Plan d’ensemble en mouvement', shotType: 'establishing',
    directions: MOVING_DIRECTIONS, speeds: ['slow', 'cruise'], photoAngles: [],
    menu: 'wide view, the car small, driving through',
    keyframe: 'Wide view of the real place; the car is small in frame, already driving through it.',
    animation: 'The car drives through the wide scene while the camera makes one slow, steady move.',
    endFrame: 'further along the road through the place, still small in frame',
    judge: 'The vehicle must visibly travel through the scene across the frames.',
    endFrameByDefault: false,
    driving: 'calm',
  },
  pass_by: {
    id: 'pass_by', label: 'Passage devant la caméra', shotType: 'rolling',
    directions: ['left_to_right', 'right_to_left'], speeds: ['slow', 'cruise', 'dynamic'], photoAngles: ['profile', 'front_three_quarter', 'rear_three_quarter'],
    menu: 'crosses the frame, static or panning camera',
    keyframe: 'Captured mid-drive as it enters the frame: rims slightly motion-blurred, body sharp, open road ahead with posts or markings it will pass.',
    animation: 'The camera stays in place or pans to follow; the car crosses the frame and passes the fixed posts, markings and trees, which stay in place.',
    endFrame: 'across the frame, further along the road in its direction of travel',
    judge: `${TREADMILL_CHECK} The car must cross the frame in its direction of travel.`,
    endFrameByDefault: false,
    driving: 'calm',
  },
  approach: {
    id: 'approach', label: 'Approche vers la caméra', shotType: 'rolling',
    directions: ['towards_camera'], speeds: ['slow', 'cruise'], photoAngles: ['front_three_quarter', 'front'],
    menu: 'drives towards the camera',
    keyframe: 'Captured mid-drive at a distance, coming towards the camera along its lane, the road visible between the car and the lens.',
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
    keyframe: 'Captured mid-drive close to the camera, driving away along its lane, the road ahead of it open.',
    animation: 'The car drives away from the static camera along its lane and gets steadily smaller; the roadside stays in place.',
    endFrame: 'much further down the road, clearly smaller in the frame',
    judge: `${TREADMILL_CHECK} The car must get smaller in the frame as it drives away.`,
    endFrameByDefault: true,
    driving: 'calm',
  },
  follow_behind: {
    id: 'follow_behind', label: 'Suivi par l’arrière', shotType: 'rolling',
    directions: ['away_from_camera'], speeds: ['cruise', 'dynamic'], photoAngles: ['rear_three_quarter', 'rear'],
    menu: 'camera follows behind at its speed',
    keyframe: 'Seen from behind and slightly above while driving, the road unrolling ahead with lane markings.',
    animation: 'The camera follows behind the car at its speed; the lane markings and roadside objects pass under and beside the car.',
    endFrame: 'at the same size in the frame, the road markings and roadside objects having moved past it',
    judge: 'Lane markings and roadside objects must pass under and beside the vehicle across the frames; a road that does not move is blocking.',
    endFrameByDefault: false,
    driving: 'calm',
  },
  side_tracking: {
    id: 'side_tracking', label: 'Travelling latéral', shotType: 'rolling',
    directions: ['left_to_right', 'right_to_left'], speeds: ['cruise'], photoAngles: ['profile'],
    menu: 'camera tracks alongside at its speed',
    keyframe: 'Profile view while driving, camera alongside at the car’s height, rims motion-blurred, roadside posts and trees sharp behind it.',
    animation: 'The camera tracks alongside the car at its speed: the car stays in frame while the roadside posts and trees pass behind it and the wheels turn.',
    endFrame: 'at the same place in the frame, the roadside posts and trees behind it having moved past',
    judge: 'Roadside objects must pass behind the vehicle and its wheels must turn; still wheels on a sliding background (treadmill effect) are blocking.',
    endFrameByDefault: false,
    driving: 'calm',
  },
  turn_left: {
    id: 'turn_left', label: 'Virage à gauche', shotType: 'rolling',
    directions: ['towards_camera', 'away_from_camera'], speeds: ['slow'], photoAngles: ['front_three_quarter', 'rear_three_quarter'],
    menu: 'gentle bend to the car’s own left',
    keyframe: 'Captured mid-drive at the start of a road that visibly bends to the car’s left; the car still points along its lane.',
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
    keyframe: 'Captured mid-drive at the start of a road that visibly bends to the car’s right; the car still points along its lane.',
    animation: 'The car follows the road as it bends to the car’s own right: the front wheels steer into the turn and the car gradually changes heading along the curve.',
    endFrame: 'through the bend, now heading along the road after turning to its own right',
    judge: 'The vehicle must follow the curve of the road and change heading to its own right; turning the other way, sliding sideways or pivoting on the spot is blocking.',
    endFrameByDefault: true,
    driving: 'turn',
  },
  pull_away: {
    id: 'pull_away', label: 'Démarrage et accélération', shotType: 'rolling',
    directions: ['left_to_right', 'right_to_left', 'away_from_camera'], speeds: ['slow', 'cruise'], photoAngles: ['profile', 'rear_three_quarter', 'front_three_quarter'],
    menu: 'starts from a standstill, accelerates smoothly',
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
    keyframe: 'The car rolls in slowly towards its final spot in a clean composition, wheels straight.',
    animation: 'The car rolls in slowly and comes to a smooth, gentle stop; the wheels stop turning when it stops.',
    endFrame: 'stopped at its final spot in a clean composition, wheels straight',
    judge: 'The vehicle must slow down and stop smoothly; wheels must stop turning once it is still, and it must not slide after stopping.',
    endFrameByDefault: true,
    driving: 'stop',
  },
  hero_still: {
    id: 'hero_still', label: 'Plan héros à l’arrêt', shotType: 'hero',
    directions: ['static'], speeds: ['slow'], photoAngles: [],
    menu: 'parked car, slow camera arc or push-in',
    keyframe: 'The car is stopped in a clean composition, wheels straight, the place reflected in the paint.',
    animation: 'The car holds still, wheels not turning, while the camera makes a slow arc or push-in.',
    endFrame: null,
    judge: 'Wheels must stay round and still, and the vehicle must not slide.',
    endFrameByDefault: false,
    driving: 'none',
  },
  detail_glide: {
    id: 'detail_glide', label: 'Détail en gros plan', shotType: 'detail',
    directions: ['static'], speeds: ['slow'], photoAngles: [],
    menu: 'close-up of a photographed detail',
    keyframe: 'Close-up of a detail visible in the reference photos; shallow depth of field.',
    animation: 'One slow camera glide over the detail; light moves across the surface.',
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

/** Reads the free « angle » text of a photo (« Avant trois-quarts », « 3/4 avant », « Profil »…); undefined = unknown, never checked. */
export function normalizePhotoAngle(value: string | null | undefined): PhotoAngle | undefined {
  const text = (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!text.trim()) return undefined;
  if (/interieur|interior|cockpit|habitacle|tableau de bord|dashboard/.test(text)) return 'interior';
  if (/detail|gros plan|close/.test(text)) return 'detail';
  const threeQuarter = /trois.?quarts?|3\/4|three.?quarter/.test(text);
  const rear = /arriere|rear|back/.test(text);
  const front = /avant|front|face/.test(text);
  if (threeQuarter && rear) return 'rear_three_quarter';
  if (threeQuarter) return 'front_three_quarter';
  if (/profil|profile|cote|side|lateral/.test(text)) return 'profile';
  if (rear) return 'rear';
  if (front) return 'front';
  return undefined;
}

type MotionShot = { title?: string; motion?: MotionId; locationPhotoId?: string | null; travelDirection?: TravelDirection; travelSpeed?: TravelSpeed; vehiclePhotoId?: string };

/**
 * Coherence of one shot with its motion. The director's answer is checked, never silently rewritten:
 * an issue makes the answer invalid, which triggers the automatic corrected retry.
 */
export function shotMotionIssues(shot: MotionShot, photoAngles: Record<string, string | null | undefined> = {}, interiorPlaceIds: readonly string[] = []): string[] {
  const label = shot.title ? `Plan « ${shot.title} »` : 'Un plan';
  const motion = getMotion(shot.motion);
  if (!motion) return [`${label} : mouvement absent ou inconnu (motion doit être l’un de : ${motionIds.join(', ')}).`];
  const issues: string[] = [];
  if (shot.travelDirection && !motion.directions.includes(shot.travelDirection)) issues.push(`${label} : le mouvement ${motion.id} accepte travelDirection ${motion.directions.join(' ou ')}.`);
  if (shot.travelSpeed && !motion.speeds.includes(shot.travelSpeed)) issues.push(`${label} : le mouvement ${motion.id} accepte travelSpeed ${motion.speeds.join(' ou ')}.`);
  const angle = shot.vehiclePhotoId ? normalizePhotoAngle(photoAngles[shot.vehiclePhotoId]) : undefined;
  if (angle && motion.photoAngles.length && !motion.photoAngles.includes(angle)) issues.push(`${label} : le mouvement ${motion.id} ne peut pas partir d’une photo « ${photoAngles[shot.vehiclePhotoId!]} ».`);
  // 24/10 (Pro, « Entrée dans le showroom »): a car driving in a showroom floated over a podium. Indoors it never moves.
  if (shot.locationPhotoId && interiorPlaceIds.includes(shot.locationPhotoId) && motion.driving !== 'none') issues.push(`${label} : dans un lieu intérieur (showroom), le véhicule reste immobile : hero_still ou detail_glide.`);
  return issues;
}

/** All motion issues of a storyboard, plus the « at most one side-tracking shot » rule; null when coherent. */
export function storyboardMotionIssue(shots: MotionShot[], photoAngles: Record<string, string | null | undefined> = {}, interiorPlaceIds: readonly string[] = []): string | null {
  const issues = shots.flatMap((shot) => shotMotionIssues(shot, photoAngles, interiorPlaceIds));
  if (shots.filter((shot) => shot.motion === 'side_tracking').length > 1) issues.push('Un seul travelling latéral (side_tracking) par film.');
  return issues.length ? issues.join(' ') : null;
}

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

type HeadingShot = { motion?: MotionId; travelDirection?: TravelDirection };

/** Where the car's nose points at the start of a moving shot, in screen terms (essai B, 24/10). */
export function headingAtStart(shot: HeadingShot): string | null {
  const direction = shot.travelDirection;
  if (!direction || direction === 'static' || getMotion(shot.motion)?.driving === 'none') return null;
  return `The car’s nose points ${NOSE[direction]}.`;
}

/** Where the car's nose points on the closing frame: unchanged, or towards the turn's screen side. */
export function headingAtEnd(shot: HeadingShot): string | null {
  const side = turnScreenSide(shot.motion, shot.travelDirection);
  if (side) return `After turning to its own ${shot.motion === 'turn_right' ? 'right' : 'left'}, the car’s nose points towards the ${side} side of the frame.`;
  const start = headingAtStart(shot);
  return start ? `${start.slice(0, -1)}, exactly as at the start.` : null;
}

/** The director's motion menu: one compact entry per motion (directions and speeds are stated once in the MOTION rule). */
export function directorMotionMenu(): string {
  return motionIds.map((id) => {
    const motion = motionCatalog[id];
    return `${id} = ${motion.menu}`;
  }).join('; ');
}
