import type { PlaceTimeOfDay } from '@/core/motion/place-motion';
import { lightingMismatch } from '@/core/scenes/prompt-values';
import type { StoryboardShot } from '@/core/storyboard';
import { mixedPlaceTimes, resolveFilmLighting, requestsTimeTransition, TIME_LABELS } from './film-lighting';

/**
 * Brief conflicts (26/10): what the user asked that the locked rules forbid. The director lists them (French, one
 * sentence each); this closed list, checkable without AI, adds the ones it forgot and alone provides them in
 * simulation. Shown to the user before the video is paid; never sent to the generators or the judges.
 */
export const MAX_BRIEF_CONFLICTS = 5;
const CONFLICT_MAX_CHARS = 200;

const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Word match on accent-free text (« dérapage » → « derapage »). */
const word = (pattern: string) => new RegExp(`(?<![a-z])(?:${pattern})(?![a-z])`);

/** `lighting`: the Studio light chip (26/10, vérification « preambule »). */
/** `singleShot`: 28/10 · the 5 s preview films one shot only. */
type BriefContext = { placeTimes: Array<PlaceTimeOfDay | null>; hasInteriorPhoto: boolean; lighting?: string; timeTransition?: boolean; singleShot?: boolean };
type ConflictRule = { id: string; keywords: RegExp; applies?: (text: string, context: BriefContext) => boolean; message: string };

const NIGHT = word('nuit|nocturne|night|soir|soiree');
const DAY = word('plein jour|en journee|grand soleil|sunny|daylight|en matinee|le matin');
const REVERSE = word('marche arriere|demi.tour|u.?turn|revers\\w*|recul\\w*');
/** 28/10 · V1: the shots are joined by straight cuts; a day → night « transition » is a lighting order, not an effect. */
const VISUAL_TRANSITION = word('fondus?|enchaine\\w*|crossfade|fade|morph\\w*|volet|transitions? (?:fluides?|douces?|visuelles?|entre (?:les )?(?:plans|scenes))');
/** 28/10 · words that announce several scenes in one brief. */
const SEVERAL_SCENES = word('plusieurs (?:plans|scenes|lieux|sequences)|(?:plan|scene|sequence) (?:\\d|deux|trois|suivante?)|(?:\\d|deux|trois|quatre) (?:plans|scenes|sequences)|(?:deuxieme|second|deuxieme|troisieme|dernier|derniere) (?:plan|scene|sequence)|autre (?:lieu|scene|decor)|changement de (?:lieu|decor)');

export const CUTS_CONFLICT = 'Transition demandée entre les plans (fondu, enchaîné…) : en V1, les plans s’enchaînent en coupe franche ; aucun effet de transition n’est ajouté.';
export const SINGLE_SHOT_CONFLICT = 'Plusieurs scènes décrites : l’aperçu de 5 s tourne un seul plan, celui de la scène principale. Choisissez 10 s ou plus pour filmer les autres scènes.';

const RULES: ConflictRule[] = [
  { id: 'cuts', keywords: VISUAL_TRANSITION, message: CUTS_CONFLICT },
  { id: 'single_shot', keywords: SEVERAL_SCENES, applies: (_text, context) => context.singleShot === true, message: SINGLE_SHOT_CONFLICT },
  { id: 'drift', keywords: word('drift\\w*|derap\\w*|burn ?out|donut\\w*|tete.a.queue|glisse\\w*|frein a main|skid\\w*'), message: 'Drift ou dérapage demandé : remplacé par une conduite dynamique et légale qui garde l’énergie de la scène.' },
  { id: 'speed', keywords: word('course|rallye|racing|race|pleine vitesse|a fond|tres vite|exces de vitesse'), message: 'Vitesse excessive demandée : remplacée par une vitesse soutenue et légale, sur route dégagée seulement.' },
  { id: 'text', keywords: word('logo\\w*|slogan\\w*|texte\\w*|ecrit\\w*|inscription\\w*|lettrage|banniere\\w*|affiche\\w*|tag\\w*|graffiti\\w*'), message: 'Texte ou logo à l’image demandé : aucun texte n’est généré dans la scène ; le logo RIMCO est ajouté au montage.' },
  {
    id: 'night', keywords: NIGHT,
    applies: (_text, context) => context.placeTimes.length > 0 && context.placeTimes.every((time) => time === 'day' || time === 'golden' || time === 'interior'),
    message: 'Scène de nuit demandée : les lieux choisis sont de jour, la lumière suit le lieu.',
  },
  {
    id: 'day', keywords: DAY,
    applies: (text, context) => !NIGHT.test(text) && context.placeTimes.length > 0 && context.placeTimes.every((time) => time === 'night'),
    message: 'Scène de jour demandée : les lieux choisis sont de nuit, la lumière suit le lieu.',
  },
  {
    // 26/10: « la caméra recule » is a pull-back, allowed; only the car may not reverse.
    id: 'reverse', keywords: REVERSE,
    applies: (text) => REVERSE.test(text.replace(/camera\s+(?:qui\s+)?recul\w*/g, ' ')),
    message: 'Marche arrière ou demi-tour demandé : la voiture roule toujours en marche avant.',
  },
  {
    id: 'interior', keywords: word('habitacle|tableau de bord|cockpit|interieur de la voiture|interieur du vehicule|sieges?'),
    applies: (_text, context) => !context.hasInteriorPhoto,
    message: 'Plan intérieur demandé sans photo d’habitacle validée : remplacé par des plans extérieurs.',
  },
  {
    id: 'showroom', keywords: word('showroom'),
    applies: (text, context) => context.placeTimes.includes('interior') && word('roule\\w*|entre dans|entrer|rentre\\w*|arrive\\w*|sort\\w*|drive\\w*|traverse\\w*').test(text),
    message: 'Voiture en mouvement dans le showroom demandée : en showroom la voiture reste immobile, seule la caméra bouge.',
  },
];

const PLACE_TIME_FR: Record<PlaceTimeOfDay, string> = { day: 'de jour', golden: 'en lumière de début ou de fin de journée', night: 'de nuit', interior: 'en intérieur' };

/** The light chip that fits none of the chosen places: the light follows the place, the chip is not used. */
function lightingConflict(context: BriefContext): { id: string; message: string } | null {
  const chip = lightingMismatch(context.lighting, context.placeTimes);
  if (!chip) return null;
  const times = [...new Set(context.placeTimes.filter((time): time is PlaceTimeOfDay => Boolean(time)))].map((time) => PLACE_TIME_FR[time]);
  return { id: 'lighting', message: `Lumière « ${chip.label} » demandée : les lieux choisis sont ${times.join(' et ')}, la lumière suit le lieu.` };
}

/** Conflicts found by the code in the user brief (closed list) and the light chip, most specific first. */
export function detectBriefConflicts(brief: string, context: BriefContext): Array<{ id: string; message: string }> {
  const text = plain(brief);
  const found = RULES.filter((rule) => rule.keywords.test(text) && (rule.applies?.(text, context) ?? true)).map(({ id, message }) => ({ id, message }));
  const lighting = lightingConflict(context);
  const places = context.placeTimes.map((timeOfDay, index) => ({ id: String(index), timeOfDay }));
  const policy = resolveFilmLighting(places, brief, context.timeTransition);
  const times = mixedPlaceTimes(places);
  if (times.length > 1 && !policy.transition) found.unshift({ id: 'mixed_times', message: `Lieux de ${times.map((time) => TIME_LABELS[time]).join(' et de ')} : la vidéo garde la lumière de ${TIME_LABELS[policy.moment]} ; demandez une transition dans votre description si vous la voulez.` });
  if (requestsTimeTransition(brief)) {
    const requested = [
      ...(/\b(?:du jour|day|daylight|aube)\b/.test(text) ? ['day' as const] : []),
      ...(/coucher (?:du )?soleil|sunset/.test(text) ? ['golden' as const] : []),
      ...(/\b(?:nuit|night)\b/.test(text) ? ['night' as const] : []),
    ];
    const missing = requested.filter((time) => !times.includes(time));
    if (missing.length) found.unshift({ id: 'transition', message: `Transition demandée : aucun lieu de ${missing.map((time) => TIME_LABELS[time]).join(' ou de ')} sélectionné ; la transition suit seulement les moments disponibles.` });
  }
  return lighting ? [...found, lighting] : found;
}

/** Model output shown to the user: plain text, bounded. */
export function cleanConflict(value: string): string {
  const text = value.replace(/[<>{}[\]`]/g, ' ').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > CONFLICT_MAX_CHARS ? `${text.slice(0, CONFLICT_MAX_CHARS - 1).replace(/[ ,;:.]+[^ ]*$/, '')}…` : text;
}

/** Words that show the director already reported a rule (no duplicate of the code's sentence). */
const RULE_MENTIONS: Record<string, RegExp> = {
  drift: /drift|derap/, speed: /vitesse|course|rallye/, text: /texte|logo|slogan|inscription/, night: /nuit|nocturne/,
  day: /jour|soleil/, interior: /habitacle|interieur|cockpit/, showroom: /showroom/, reverse: /marche arriere|demi.tour|recul/,
  cuts: /coupe franche|fondu|enchain/, single_shot: /un seul plan|5 s/,
};

/** The director's conflicts, completed by the code's (deduplicated), at most 5. */
export function mergeBriefConflicts(director: string[], detected: Array<{ id: string; message: string }>): string[] {
  const own = director.map(cleanConflict).filter((entry) => entry.length >= 5);
  const reported = plain(own.join(' '));
  const added = detected.filter((conflict) => !RULE_MENTIONS[conflict.id]?.test(reported)).map((conflict) => conflict.message);
  return [...new Set([...own, ...added])].slice(0, MAX_BRIEF_CONFLICTS);
}

/** Forbidden manoeuvres written in a shot (English director text): a shot or a correction that contains one is refused. */
const FORBIDDEN_MOTION = word('drift\\w*|skid\\w*|burn ?outs?|donuts?|handbrake turns?|power ?slides?|racing|races?');
/**
 * 26/10: reversing and U-turns, read in the car's scene and action only: in the camera field « reverse tracking » or
 * « pulls back » is a camera move, allowed.
 */
const FORBIDDEN_CAR_MOTION = word('revers(?:es|ing)|in reverse|backs? up|backing up|u-?turns?|turns? (?:a)?round|turning (?:a)?round|three-point turns?');

export function forbiddenShotText(shot: Pick<StoryboardShot, 'scene' | 'framing' | 'location' | 'action' | 'camera'>): string | null {
  const match = plain([shot.scene, shot.framing, shot.location, shot.action, shot.camera].join(' ')).match(FORBIDDEN_MOTION)
    ?? plain([shot.scene, shot.action].join(' ')).match(FORBIDDEN_CAR_MOTION);
  return match ? match[0] : null;
}

/** Same mechanism as interiorShotIssue: the director's answer is refused and corrected. */
export function forbiddenShotsIssue(shots: StoryboardShot[]): string | null {
  const found = shots.map((shot) => ({ shot, word: forbiddenShotText(shot) })).filter((entry) => entry.word);
  return found.length ? `${found.map(({ shot, word: found }) => `« ${shot.title} » (${found})`).join(', ')} : manœuvre interdite ; garde l’énergie par une conduite dynamique et légale, et signale-le dans briefConflicts.` : null;
}
