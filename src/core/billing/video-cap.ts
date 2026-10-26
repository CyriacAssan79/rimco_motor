/**
 * Garde-fou de coût par vidéo (règle d'architecture : 15 $ maximum pour une vidéo de 30 s).
 *
 * Étape 1 (ce module) : avant toute réservation ou appel payant, le coût NOMINAL de la vidéo
 * (une tentative par image-clé, par contrôle et par clip, plus le storyboard déjà payé) doit
 * tenir sous le plafond. Les relances restent réservées à part par le pipeline existant.
 * Étape 2 (à construire avec la file de jobs) : vérifier aussi le cumul réel avant chaque relance.
 *
 * Les tarifs viennent du catalogue `ai_models` et des constantes image-clé : ce sont des
 * hypothèses à confirmer par le protocole de test.
 */
import { MAX_CLIP_RETRIES, MAX_KEYFRAME_CORRECTIONS } from '@/core/verification/loop';
import { SHOT_REVISION_RESERVE_USD } from '@/core/providers/fal-shot-revision';

export type VideoCostInput = {
  generatedSeconds: number;
  videoPriceUsdPerSecond: number;
  shotCount: number;
  keyframeImageCostUsd: number;
  keyframeQualityCostUsd: number;
  videoQualityCostUsd: number;
  storyboardCostUsd: number;
  /** Optional closing frames of rolling shots (image + quality check each). */
  endFrameCount?: number;
  endFrameCostUsd?: number;
};

export type VideoCostBreakdown = {
  videoUsd: number;
  keyframesUsd: number;
  qualityUsd: number;
  storyboardUsd: number;
  totalUsd: number;
};

const round = (value: number) => Math.round(value * 10_000) / 10_000;

export function nominalVideoCostUsd(input: VideoCostInput): VideoCostBreakdown {
  const endFrameCount = input.endFrameCount ?? 0;
  const endFrameCostUsd = input.endFrameCostUsd ?? 0;
  const values = [input.generatedSeconds, input.videoPriceUsdPerSecond, input.shotCount, input.keyframeImageCostUsd, input.keyframeQualityCostUsd, input.videoQualityCostUsd, input.storyboardCostUsd, endFrameCount, endFrameCostUsd];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Paramètres de coût invalides.');
  const videoUsd = input.generatedSeconds * input.videoPriceUsdPerSecond;
  const keyframesUsd = input.shotCount * input.keyframeImageCostUsd + endFrameCount * endFrameCostUsd;
  const qualityUsd = input.shotCount * (input.keyframeQualityCostUsd + input.videoQualityCostUsd);
  const totalUsd = videoUsd + keyframesUsd + qualityUsd + input.storyboardCostUsd;
  return { videoUsd: round(videoUsd), keyframesUsd: round(keyframesUsd), qualityUsd: round(qualityUsd), storyboardUsd: round(input.storyboardCostUsd), totalUsd: round(totalUsd) };
}

export type WorstCaseBreakdown = VideoCostBreakdown & { revisionsUsd: number };

/**
 * 26/10 · what a video can cost at most when every automatic retry of the verification loop is used, from the same
 * constants as the reservations made at launch: per shot 1 + MAX_KEYFRAME_CORRECTIONS keyframes and their checks,
 * MAX_KEYFRAME_CORRECTIONS director corrections, 1 + MAX_CLIP_RETRIES clips and their checks; plus the end frames and
 * the storyboard. Relaunches asked by a human afterwards are not included (each is reserved when it is asked).
 */
export function worstCaseVideoCostUsd(input: VideoCostInput): WorstCaseBreakdown {
  const nominal = nominalVideoCostUsd(input);
  const keyframeAttempts = 1 + MAX_KEYFRAME_CORRECTIONS;
  const clipAttempts = 1 + MAX_CLIP_RETRIES;
  const endFrames = (input.endFrameCount ?? 0) * (input.endFrameCostUsd ?? 0);
  const videoUsd = clipAttempts * input.generatedSeconds * input.videoPriceUsdPerSecond;
  const keyframesUsd = input.shotCount * keyframeAttempts * input.keyframeImageCostUsd + endFrames;
  const qualityUsd = input.shotCount * (keyframeAttempts * input.keyframeQualityCostUsd + clipAttempts * input.videoQualityCostUsd);
  // Director corrections exist only when shots go through keyframes.
  const revisionsUsd = input.keyframeImageCostUsd > 0 ? input.shotCount * MAX_KEYFRAME_CORRECTIONS * SHOT_REVISION_RESERVE_USD : 0;
  const totalUsd = videoUsd + keyframesUsd + qualityUsd + revisionsUsd + nominal.storyboardUsd;
  return { videoUsd: round(videoUsd), keyframesUsd: round(keyframesUsd), qualityUsd: round(qualityUsd), revisionsUsd: round(revisionsUsd), storyboardUsd: nominal.storyboardUsd, totalUsd: round(totalUsd) };
}

/** Which estimate the optional cap applies to (VIDEO_COST_CAP_MODE): a team decision, `nominal` by default. */
export type VideoCostCapMode = 'nominal' | 'worst_case';

export type CostPlanUsd = { nominal: VideoCostBreakdown; worstCase: WorstCaseBreakdown; capMode: VideoCostCapMode; capUsd: number | null };

/**
 * Shape frozen in `brief_json.costPlanUsd` at launch, shown to the admin: the nominal breakdown stays flat as before
 * (versions created earlier keep it alone), with the worst case and the cap mode next to it.
 */
export type StoredCostPlanUsd = VideoCostBreakdown & { capUsd: number | null; capMode: VideoCostCapMode; worstCase: WorstCaseBreakdown };

export function costPlanForBrief(plan: CostPlanUsd): StoredCostPlanUsd {
  return { ...plan.nominal, capUsd: plan.capUsd, capMode: plan.capMode, worstCase: plan.worstCase };
}

/** Nominal and worst-case totals of a version; worstCaseUsd is null for versions created before 26/10. */
export function storedCostPlan(brief: Record<string, unknown> | null | undefined): { nominalUsd: number; worstCaseUsd: number | null } | null {
  const plan = brief?.costPlanUsd as Partial<StoredCostPlanUsd> | undefined;
  const nominal = Number(plan?.totalUsd);
  if (!Number.isFinite(nominal)) return null;
  const worstCase = Number(plan?.worstCase?.totalUsd);
  return { nominalUsd: nominal, worstCaseUsd: Number.isFinite(worstCase) ? worstCase : null };
}

export function checkVideoCostCap(breakdown: VideoCostBreakdown, capUsd: number, mode: VideoCostCapMode = 'nominal'): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error('Le plafond de coût par vidéo doit être positif.');
  if (breakdown.totalUsd <= capUsd) return { ok: true };
  const estimate = mode === 'worst_case' ? `${breakdown.totalUsd.toFixed(2)} $ au maximum, toutes les relances automatiques comprises,` : `${breakdown.totalUsd.toFixed(2)} $ estimés`;
  return {
    ok: false,
    message: `Cette configuration dépasse le plafond de coût par vidéo (${estimate} pour ${capUsd.toFixed(2)} $ autorisés). Réduisez la durée ou choisissez un autre niveau.`,
  };
}

/** Cap decision of a launch: the estimate selected by the mode, or no cap at all when none is set. */
export function videoCostCapCheck(plan: { nominal: VideoCostBreakdown; worstCase: WorstCaseBreakdown }, capUsd: number | undefined, mode: VideoCostCapMode): { ok: true } | { ok: false; message: string } {
  if (capUsd === undefined) return { ok: true };
  return checkVideoCostCap(mode === 'worst_case' ? plan.worstCase : plan.nominal, capUsd, mode);
}
