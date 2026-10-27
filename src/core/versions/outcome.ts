import { formatFcfa } from '@/core/pricing';

/**
 * What the Studio shows when a video ends (26/10): the settings to start again, the cause of a failure in French and
 * what was billed. The settings come from video_versions.brief_json; the « personnage » chip is not stored there.
 */
export type StudioSettings = {
  title: string;
  description: string;
  vehicleDossierId: string | null;
  vehiclePhotoIds: string[];
  placeIds: string[];
  castAssetIds: string[];
  tier: 'standard' | 'pro' | 'premium';
  durationS: number;
  format: '16:9' | '9:16' | '1:1';
  scenePresetId: string;
  audioAssetId: string | null;
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

export function studioSettings(brief: Record<string, unknown>, title?: string | null): StudioSettings | null {
  const vehicleDossierId = text(brief.vehicleDossierId) || null;
  if (!vehicleDossierId && !ids(brief.vehiclePhotoIds).length) return null;
  const tier = brief.storyMode === 'pro' || brief.storyMode === 'premium' ? brief.storyMode : 'standard';
  const format = brief.format === '9:16' || brief.format === '1:1' ? brief.format : '16:9';
  const duration = Number(brief.clipDurationSeconds);
  return {
    title: text(title),
    description: text(brief.user_direction),
    vehicleDossierId,
    vehiclePhotoIds: ids(brief.vehiclePhotoIds),
    placeIds: ids(brief.placeIds),
    castAssetIds: Array.isArray(brief.castAssets) ? brief.castAssets.map((member) => text((member as { id?: unknown } | null)?.id)).filter(Boolean) : [],
    tier,
    durationS: [5, 10, 15, 20].includes(duration) ? duration : 5,
    format,
    scenePresetId: text(brief.scene_preset_id),
    audioAssetId: text(brief.audioAssetId) || null,
  };
}

export type FailureExplanation = { cause: string; advice: string; detail: string | null };

const FAILURES: Array<{ test: RegExp; cause: string; advice: string }> = [
  { test: /non validées sous 48 h/i, cause: 'Les images clés n’ont pas été validées sous 48 h : la vidéo a expiré. Les images clés sont conservées.', advice: 'Relancez avec les mêmes réglages : un nouveau storyboard et de nouvelles images clés seront produits.' },
  { test: /content.?polic|safety|nsfw|flagged|moderation|filtre de (?:contenu|s[ée]curit)/i, cause: 'Le fournisseur a refusé le contenu demandé (filtre de sécurité).', advice: 'Reformulez la description ou choisissez une autre photo, puis relancez.' },
  { test: /quota|insufficient|balance|credit|billing|payment|\b402\b|\b429\b|rate.?limit/i, cause: 'Le compte du fournisseur a atteint sa limite (crédit ou quota).', advice: 'Prévenez l’administrateur avant de relancer.' },
  { test: /timed? ?out|timeout|délai|n’a pas répondu|deadline/i, cause: 'Le fournisseur n’a pas répondu à temps.', advice: 'Relancez avec les mêmes réglages ; si cela se reproduit, prévenez l’administrateur.' },
  { test: /image-cl[ée].*(?:contr[ôo]le|refus)|keyframe/i, cause: 'Une image clé n’a pas passé le contrôle automatique, aucune vidéo de plan n’a été produite.', advice: 'Relancez, ou changez de photo ou de lieu pour ce véhicule.' },
  { test: /a refusé l’animation|refused|rejected|\b4\d\d\b/i, cause: 'Le fournisseur vidéo a refusé l’animation d’un plan.', advice: 'Relancez avec les mêmes réglages ; si cela se reproduit, simplifiez la description.' },
  { test: /annul/i, cause: 'La génération a été annulée.', advice: 'Vous pouvez relancer avec les mêmes réglages.' },
];

/** The cause in French, what to do, and the original message kept as technical detail. */
export function failureExplanation(error: string | null | undefined): FailureExplanation {
  const message = text(error);
  const known = FAILURES.find((failure) => failure.test.test(message));
  if (known) return { cause: known.cause, advice: known.advice, detail: message || null };
  // A message written by the application in French is already clear.
  if (/[éèàçù]|’/.test(message)) return { cause: message, advice: 'Relancez avec les mêmes réglages.', detail: null };
  return { cause: 'La génération a échoué chez le fournisseur.', advice: 'Relancez avec les mêmes réglages ; si cela se reproduit, prévenez l’administrateur.', detail: message || null };
}

/** Client price of the video, from the cost journal: what was billed, and whether a cost is still being checked. */
export type BillingSummary = { chargedFcfa: number; pending: boolean };

export function billingSummary(rows: Array<{ kind?: string | null; status?: string | null; price_fcfa?: number | null }>): BillingSummary {
  const generation = rows.filter((row) => row.kind === 'generation');
  return {
    chargedFcfa: generation.filter((row) => row.status === 'charged').reduce((sum, row) => sum + Math.max(0, Number(row.price_fcfa ?? 0)), 0),
    pending: rows.some((row) => row.status === 'reserved'),
  };
}

/** « Rien ne vous est facturé pour cette vidéo. », or the amount billed, or the cost being checked. */
export function failureBillingText(billing: BillingSummary | null | undefined) {
  if (!billing) return 'Le montant facturé sera visible dans la Bibliothèque.';
  if (billing.pending) return 'Un coût est en cours de vérification auprès du fournisseur : il ne sera facturé que s’il a réellement été consommé.';
  if (billing.chargedFcfa > 0) return `${formatFcfa(billing.chargedFcfa)} facturés : le fournisseur a déjà produit une partie de la vidéo.`;
  return 'Rien ne vous est facturé pour cette vidéo.';
}
