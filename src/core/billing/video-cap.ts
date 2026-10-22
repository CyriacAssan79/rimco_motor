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

export function checkVideoCostCap(breakdown: VideoCostBreakdown, capUsd: number): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error('Le plafond de coût par vidéo doit être positif.');
  if (breakdown.totalUsd <= capUsd) return { ok: true };
  return {
    ok: false,
    message: `Cette configuration dépasse le plafond de coût par vidéo (${breakdown.totalUsd.toFixed(2)} $ estimés pour ${capUsd.toFixed(2)} $ autorisés). Réduisez la durée ou choisissez un autre niveau.`,
  };
}
