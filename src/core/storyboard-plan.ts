/**
 * 28/10 · shot plan constants, shared by the server (director, validation) and the Studio (help text): this module
 * holds no prompt, so it can be imported by a client component.
 */
export type StoryProvider = 'wan' | 'kling' | 'seedance';
export type StoryMode = 'standard' | 'pro' | 'premium';

export const STORYBOARD_LOGO_SECONDS = 2;
export const PREMIUM_FIXED_DURATION_SECONDS = 20;
export const PREMIUM_FIXED_SHOT_SECONDS = 5;
export const PREMIUM_FIXED_SHOT_COUNT = PREMIUM_FIXED_DURATION_SECONDS / PREMIUM_FIXED_SHOT_SECONDS;
/**
 * Shot lengths of the storyboard per engine. 26/10 · architecture: shots of 3 to 5 s, the engines hold badly beyond a
 * few seconds; Kling itself still accepts up to 15 s (its model catalogue is unchanged).
 */
export const providerLimits: Record<StoryProvider, { min: number; max: number }> = {
  wan: { min: 5, max: 5 },
  kling: { min: 3, max: 5 },
  seedance: { min: 4, max: 30 },
};

/** 28/10 · number of shots the director writes, as directorShotPlan states it (shown to the user in the Studio). */
export function shotCountRange(input: { mode: StoryMode; durationSeconds: number; single?: boolean }): { min: number; max: number } {
  if (input.single) return { min: 1, max: 1 };
  if (input.mode === 'premium') return { min: PREMIUM_FIXED_SHOT_COUNT, max: PREMIUM_FIXED_SHOT_COUNT };
  if (input.mode === 'standard') return { min: input.durationSeconds / 5, max: input.durationSeconds / 5 };
  const { min, max } = providerLimits.kling;
  return { min: Math.ceil(input.durationSeconds / max), max: Math.min(6, Math.floor(input.durationSeconds / min)) };
}

/** 28/10 · V1 · what the user gets for a duration: shots, straight cuts (no transition yet), logo end card. */
export function durationHelpText(input: { mode: StoryMode; durationSeconds: number }): string {
  const single = input.durationSeconds === 5 && input.mode !== 'premium';
  const seconds = input.mode === 'premium' ? PREMIUM_FIXED_DURATION_SECONDS : input.durationSeconds;
  const total = `${seconds} s + ${STORYBOARD_LOGO_SECONDS} s de logo = ${seconds + STORYBOARD_LOGO_SECONDS} s au total.`;
  if (single) return `Aperçu rapide · 1 seul plan, pour tester un véhicule et un lieu à moindre coût. Pour raconter plusieurs scènes, choisissez 10 s ou plus. ${total}`;
  const { min, max } = shotCountRange({ mode: input.mode, durationSeconds: seconds });
  const shots = min === max ? `${min} plans` : `${min} à ${max} plans`;
  return `${shots}, enchaînés en coupe franche (pas de transition en V1). ${total}`;
}

