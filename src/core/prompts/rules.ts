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
export const KEEP_IDENTITY = 'Keep the exact car (shape, paint, wheels, badges), place and light; warm light never changes the paint colour.';

/** Tyre-road contact: the defect the client sees first. */
export const GROUND_CONTACT = 'Every visible tyre touches the road with a contact shadow; the car never floats.';

/** Positive wheel physics, sent to the video engine for moving shots only. */
export const WHEEL_PHYSICS = 'Tyres roll on the road without slipping, turning at the car’s speed; contact shadows stay under them; the body has weight and the suspension moves slightly.';

/** Zero generated text (signs copied from a place photo included). */
export const NO_TEXT_IMAGE = 'One full-frame photo, never a collage or split-screen. No text, logo, watermark or readable plate; every sign in the place is blank. No CGI look, no extra vehicle.';
export const NO_TEXT_VIDEO = 'One continuous full-frame shot, no cuts, never a split-screen. No text or logo appears; signs stay blank.';

/** Normal road driving (22/10: a car drifted on a city street at the start of a clip). */
export const CALM_DRIVING = 'Calm, normal driving: the car stays in its lane and follows the road at a constant speed; no drift, skid, spin, sharp turn or sudden acceleration.';

/** 24/10: the video engine invented streets of another country as the camera moved. */
export function placeRule(place: string, market?: string): string {
  return `Place: ${place}${market ? ` (${market})` : ''}. Everything the camera reveals belongs to this same place: same road layout, buildings and vegetation; nothing from another city or country.`;
}

/** Catalogue motions that change speed or heading replace CALM_DRIVING with their own normal-driving rule. */
export const TURN_DRIVING = 'Calm, normal turn: the car follows the curve of its lane at a slow speed, front wheels steered into the turn, the body leaning slightly; no drift, skid, spin or sideways slide.';
export const PULL_AWAY_DRIVING = 'Calm, normal start: the car stays in its lane and accelerates progressively; no wheelspin, jump, drift or skid.';
export const STOP_DRIVING = 'Calm, normal stop: the car stays in its lane and slows down progressively; no skid, slide or nose dive.';

/** A car shown at an angle to its lane forces the video model to rotate it, which reads as a drift. */
export const HEADING_ALIGNED = 'The car points along its lane, in its direction of travel.';

/** 22/10: a character walked beside the moving car. 24/10: the driver looked backwards while driving. */
export const PEOPLE_IN_MOVING_CAR = 'seated inside the car (the driver at the wheel, facing forward, eyes on the road ahead), seen through the windows; nobody walks or stands outside the moving car';

/** 24/10: cars drove on the wrong side of the road. Side read from the brand settings (`brands.traffic_side`). */
export function trafficRule(side: 'right' | 'left'): string {
  return `${side === 'right' ? 'Right' : 'Left'}-hand traffic: the car drives in the ${side}-hand lane of its direction of travel, never in the oncoming lane.`;
}

/** 24/10: the steering wheel switched sides between shots. Side read from `brands.steering_side`. */
export function steeringRule(side: 'left' | 'right'): string {
  return `${side === 'left' ? 'Left' : 'Right'}-hand drive: the steering wheel and the driver are on the car’s ${side} side.`;
}

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
