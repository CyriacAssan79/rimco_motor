/**
 * Patch v3.2 · generation rules written once and shared by every prompt (principle « une règle, un seul endroit »),
 * plus the length guard that keeps each prompt under its engine's limit.
 *
 * Measured limit: Kling O3 Pro rejects prompts over 2 500 characters (fal 422 « String should have at most
 * 2500 characters », 2026-10-22). Other engines do not document one on their fal pages, so every video prompt
 * is capped at 2 000 characters and every image prompt at 2 200, with margin.
 */
export const VIDEO_PROMPT_MAX_CHARS = 2_000;
export const IMAGE_PROMPT_MAX_CHARS = 2_200;

// ——— Shared rules (English: the image and video models follow English best) ———

/** Vehicle identity kept by the animation (layer 1, locked). */
export const KEEP_IDENTITY = 'Keep the exact car (shape, paint, wheels, badges), place and light.';

/** Tyre-road contact: the defect the client sees first. */
export const GROUND_CONTACT = 'Every visible tyre touches the road with a contact shadow; the car never floats.';

/** Positive wheel physics, sent to the video engine for moving shots only. */
export const WHEEL_PHYSICS = 'Tyres roll on the road without slipping, turning at the car’s speed; contact shadows stay under them; the body has weight and the suspension moves slightly.';

/** Zero generated text (signs copied from a place photo included). */
export const NO_TEXT_IMAGE = 'One full-frame photo, never a collage or split-screen. No text, logo, watermark or readable plate; every sign in the place is blank. No CGI look, no extra vehicle.';
export const NO_TEXT_VIDEO = 'One continuous full-frame shot, no cuts, never a split-screen. No text or logo appears; signs stay blank.';

/** Normal road driving (22/10: a car drifted on a city street at the start of a clip). */
export const CALM_DRIVING = 'Calm, normal driving: the car stays in its lane and follows the road at a constant speed; no drift, skid, spin, sharp turn or sudden acceleration.';

/**
 * 26/10 · one driving instruction per case, so that it never contradicts the travel sentence: an arrival slows
 * down (no « constant speed »), a brisk shot is controlled (no « calm »). Cruise keeps CALM_DRIVING.
 */
export type DrivingKind = 'cruise' | 'arrival' | 'dynamic';
export const DRIVING_RULES: Record<DrivingKind, string> = {
  cruise: CALM_DRIVING,
  arrival: 'Calm arrival: the car stays in its lane and follows the road, slowing down gently and evenly; no drift, skid, spin, sharp turn or sudden braking.',
  dynamic: 'Brisk, controlled driving: the car stays in its lane and follows the road at a steady speed; no drift, skid, spin, sharp turn or sudden acceleration.',
};

/** 24/10: the video engine invented streets of another country as the camera moved. */
export function placeRule(place: string, market?: string): string {
  return `Place: ${place}${market ? ` (${market})` : ''}. Everything the camera reveals belongs to this same place: same road layout, buildings and vegetation; nothing from another city or country.`;
}

/** A car shown at an angle to its lane forces the video model to rotate it, which reads as a drift. */
export const HEADING_ALIGNED = 'The car points along its lane, in its direction of travel.';

/**
 * 26/10 motion matrix: the car's orientation is given against the road of the place, never against the frame
 * (replaces HEADING_ALIGNED on versions that carry a matrix).
 */
export const ROAD_ALIGNED = 'The car keeps to its lane along the road of the place (a bridge: its deck), never across, against or off the road.';

/** 22/10: a character walked beside the moving car. 24/10: the driver looked backwards while driving. */
export const PEOPLE_IN_MOVING_CAR = 'seated inside the car (the driver at the wheel, facing forward, eyes on the road ahead), seen through the windows; nobody walks or stands outside the moving car';

/** 24/10 (Pro, « Entrée dans le showroom »): the car drove into a showroom and floated over a podium. Indoors it never moves. */
export const INTERIOR_STILL = 'Indoor showroom: the car stands still on the showroom floor, all four tyres on the floor; it never drives in or out and never floats; only the camera moves.';

/**
 * 24/10: the steering wheel switched sides between shots. Side read from `brands.steering_side`.
 * 26/10: also for an empty car, whose wheel shows through the windscreen.
 */
export function steeringRule(side: 'left' | 'right', occupied = true): string {
  const capitalized = side === 'left' ? 'Left' : 'Right';
  return occupied
    ? `${capitalized}-hand drive: the steering wheel and the driver are on the car’s ${side} side.`
    : `${capitalized}-hand drive: the steering wheel, visible through the windscreen, is on the car’s ${side} side.`;
}

/**
 * 26/10: side of the road the cars drive on, read from `brands.traffic_side`. Written from the car's own direction:
 * a car driving towards the camera in right-hand traffic shows on the left of the image, which is correct.
 */
export function trafficRule(side: 'left' | 'right'): string {
  const capitalized = side === 'left' ? 'Left' : 'Right';
  const other = side === 'left' ? 'right' : 'left';
  return `${capitalized}-hand traffic: the car keeps to the ${side}-hand lane of its own direction (its ${side}, not the image’s); oncoming cars pass on its ${other}.`;
}

/**
 * 26/10 · brand image, every tier: only a detail shot may crop the car. The tier is a cost ceiling, not a level of
 * demand, so neither this rule nor its check depends on it. `crossing`: a pass-by shot, where the car enters or
 * leaves the frame (video only).
 */
export function framingRule(shotType: 'establishing' | 'rolling' | 'detail' | 'hero', crossing = false): string {
  if (shotType === 'detail') return 'The requested detail is sharp and whole; the car may be cropped.';
  return `Whole car in frame, with space around it, never cut by an edge${crossing ? ' except while it enters or leaves the frame' : ''}.`;
}

/** Badge, grille and maker logo: one wording for the keyframe judge and the clip judge (every tier). */
export const IDENTITY_DEFECT = 'identity change, including a badge, grille, maker logo, light or wheel deformed, misspelt or whose design or colour differs from the references';

/** The requested framing is a criterion of both judges, never mere information (model output: quoted and bounded). */
export function framingCheck(input: { shotType: 'establishing' | 'rolling' | 'detail' | 'hero'; framing: string; crossing?: boolean }): string {
  const framing = input.framing.replace(/[<>{}[\]`"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  const crop = input.shotType === 'detail'
    ? 'Detail shot: the requested detail must be sharp and whole; a cropped car is normal here.'
    : `The whole car must stay inside the frame${input.crossing ? ', except while it enters or leaves it in this crossing shot' : ''}: a car cut by a frame edge is blocking.`;
  return `Requested framing (a criterion): "${framing}". ${crop} A framing clearly different from it (for example a close-up when a wide shot was asked) is blocking; slightly tighter, looser or off-centre is a minor defect.`;
}

/**
 * 26/10 · the generators are told « the car is lit like the place » and « no extra vehicle »: both judges check it.
 * Pasted-on look: first check asked by the verifier architecture.
 */
export const INTEGRATION_CHECK = 'The car must belong to the scene, not look pasted on: perspective and scale fit the road, its shadow falls like the other shadows, its paint reflects the place; a pasted-on car is blocking.';
export const NO_EXTRA_VEHICLE_CHECK = 'Only the car of the references appears: another vehicle clearly visible (car, truck, motorbike, even parked) is blocking; a tiny one far away is minor.';

/** People never touch the bodywork: frequent physical artefact of video models. */
export const NO_BODYWORK_CONTACT = 'nobody leans on the car';

// ——— Length guard ———

/**
 * One block of a prompt. Blocks keep their order. `drop` (lower first) marks optional blocks removed when the
 * prompt is too long; `shrinkTo` marks blocks that may be shortened down to that many characters first.
 * Blocks with neither (identity, zero text, people) are never touched.
 */
export type PromptBlock = { text: string; drop?: number; shrinkTo?: number };

export class PromptTooLongError extends Error {
  constructor(readonly length: number, readonly max: number) {
    super(`Le prompt dépasse la limite du moteur (${length} caractères pour ${max} autorisés) même après raccourcissement.`);
  }
}

const join = (blocks: PromptBlock[]) => blocks.map((block) => block.text.trim()).filter(Boolean).join(' ');

/** Cuts at a word boundary and closes the sentence. */
export function shortenText(text: string, max: number): string {
  const value = text.trim();
  if (value.length <= max) return value;
  if (max < 2) return '';
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '')}.`;
}

/** Assembles the blocks under `max` characters: first shrink, then drop, then refuse. Never cuts a locked block. */
export function fitPrompt(input: PromptBlock[], max: number): string {
  const blocks = input.map((block) => ({ ...block }));
  let text = join(blocks);
  if (text.length <= max) return text;
  for (const block of blocks.filter((entry) => entry.shrinkTo !== undefined)) {
    const excess = join(blocks).length - max;
    if (excess <= 0) break;
    block.text = shortenText(block.text, Math.max(block.shrinkTo!, block.text.length - excess));
  }
  for (const block of [...blocks].filter((entry) => entry.drop !== undefined).sort((a, b) => a.drop! - b.drop!)) {
    if (join(blocks).length <= max) break;
    block.text = '';
  }
  text = join(blocks);
  if (text.length > max) throw new PromptTooLongError(text.length, max);
  return text;
}
