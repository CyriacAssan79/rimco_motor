import type { Verdict } from './loop';

/**
 * 28/10 · contrôles fixes d'un clip, avant le juge IA (architecture : « contrôles fixes, puis juge IA »). Ils sont
 * mesurés par FFmpeg en même temps que l'extraction des images du juge (aucun appel payant, environ une seconde).
 * Un clip qui échoue ici est repris directement, sans attendre ni payer le juge ; un clip qui passe va au juge
 * comme avant. Seuls des défauts francs sont retenus, pour ne jamais ajouter de reprise inutile.
 */
export type ClipInspection = {
  /** Duration read from the file, in seconds (null when FFmpeg did not print it). */
  durationS: number | null;
  /** Total duration of the black segments (blackdetect, ≥ 0,5 s each). */
  blackSeconds: number;
  /** Longest frozen segment (freezedetect, ≥ 1,5 s). */
  longestFreezeSeconds: number;
};

/** FFmpeg filters of the inspection (stderr is parsed by parseClipInspection). */
export const CLIP_INSPECTION_FILTER = 'blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=1.5';

export function parseClipInspection(stderr: string): ClipInspection {
  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const durationS = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null;
  const blackSeconds = [...stderr.matchAll(/black_duration:\s*([\d.]+)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
  const freezes = [...stderr.matchAll(/freeze_duration:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  // A freeze still running at the end of the clip has a start and no duration: measured up to the end of the file.
  const starts = [...stderr.matchAll(/freeze_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  if (starts.length > freezes.length && durationS !== null) freezes.push(Math.max(0, durationS - starts[starts.length - 1]));
  return { durationS, blackSeconds: Math.round(blackSeconds * 100) / 100, longestFreezeSeconds: freezes.length ? Math.max(...freezes) : 0 };
}

/**
 * Verdict of the fixed checks, or null when the clip passes (the judge then decides as before).
 * `moving`: the car is planned to move in this shot; an image frozen most of the clip is then a defect.
 */
export function fixedClipVerdict(inspection: ClipInspection, input: { expectedSeconds: number; moving: boolean }): Verdict | null {
  const issues: string[] = [];
  const codes: string[] = [];
  if (inspection.durationS !== null && inspection.durationS < input.expectedSeconds - 1) {
    issues.push(`blocking: clip lasts ${inspection.durationS.toFixed(1)} s instead of ${input.expectedSeconds} s`);
    codes.push('duration');
  }
  if (inspection.blackSeconds >= 0.5) {
    issues.push(`blocking: ${inspection.blackSeconds.toFixed(1)} s of black frames`);
    codes.push('black_frames');
  }
  const reference = inspection.durationS ?? input.expectedSeconds;
  if (input.moving && reference > 0 && inspection.longestFreezeSeconds >= Math.max(2, reference * 0.6)) {
    issues.push(`blocking: image frozen for ${inspection.longestFreezeSeconds.toFixed(1)} s while the car should move`);
    codes.push('frozen');
  }
  return issues.length ? { approved: false, issues, codes, reason: 'Contrôle fixe du fichier' } : null;
}

/** Endpoint marker of a verdict given by the fixed checks (no fal request behind it). */
export const FIXED_CHECK_ENDPOINT = 'rimco/fixed-checks';
