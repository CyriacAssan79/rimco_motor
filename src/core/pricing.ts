export type Tier = 'standard'|'pro'|'premium'|'test';
export const CLIENT_MARKUP_RATE = 0.30;

function assertPositive(value:number,label:string):void {
  if(!Number.isFinite(value)||value<=0) throw new Error(`${label} doit être un nombre positif`);
}
function assertNonNegative(value:number,label:string):void {
  if(!Number.isFinite(value)||value<0) throw new Error(`${label} doit être un nombre positif ou nul`);
}

/**
 * 29/10 · O01 · forfait par vidéo : un prix par niveau, quelle que soit la durée, jusqu'à 30 s de clips (la carte de
 * logo de 2 s ne compte pas). L'aperçu de 5 s paie le même forfait (décision D-01 du 29/10). Remplace la grille à la
 * seconde (460 / 700 / 950 FCFA/s), dont les colonnes restent en base pour l'historique et le retour arrière.
 * Le journal des coûts continue de figer le prix appliqué à chaque vidéo.
 */
export type VideoPrices = { standard: number; pro: number; premium: number };
export const MAX_FLAT_PRICE_SECONDS = 30;
/** Valeurs par défaut de la migration 0044 (offre RIMCO du 28/10 ; Premium garde son prix de 20 s). */
export const DEFAULT_VIDEO_PRICES_FCFA: VideoPrices = { standard: 13_000, pro: 18_000, premium: 19_000 };
/** Colonnes de pricing_settings lues partout où un prix est calculé. */
export const VIDEO_PRICE_COLUMNS = 'video_price_fcfa_standard,video_price_fcfa_pro,video_price_fcfa_premium';

export function videoPricesFromRow(row: Record<string, unknown>): VideoPrices {
  return { standard: Number(row.video_price_fcfa_standard), pro: Number(row.video_price_fcfa_pro), premium: Number(row.video_price_fcfa_premium) };
}

export function videoPriceFcfa(seconds: number, tier: Tier, prices: VideoPrices): number {
  assertPositive(seconds, 'La durée');
  if (seconds > MAX_FLAT_PRICE_SECONDS) throw new Error(`Le forfait couvre une vidéo de ${MAX_FLAT_PRICE_SECONDS} s au maximum.`);
  assertNonNegative(prices.standard, 'Le prix Standard');
  assertNonNegative(prices.pro, 'Le prix Pro');
  assertNonNegative(prices.premium, 'Le prix Premium');
  // Le niveau Test suit Premium, comme avant.
  return Math.round(tier === 'standard' ? prices.standard : tier === 'pro' ? prices.pro : prices.premium);
}

export function estimateRealCost(seconds:number,usdPerSecond:number,usdToEur:number,eurToFcfa:number){
  assertPositive(seconds,'La durée');
  assertNonNegative(usdPerSecond,'Le tarif fournisseur');
  assertPositive(usdToEur,'Le taux USD/EUR');
  assertPositive(eurToFcfa,'Le taux EUR/FCFA');
  const costUsd=seconds*usdPerSecond;
  const costEur=costUsd*usdToEur;
  return {costUsd,costEur,costRealFcfa:costEur*eurToFcfa};
}

/** Legacy estimate for displays that have no brand pricing grid available. */
export function calculateClientPriceFcfa(costUsd:number,usdToEur:number,eurToFcfa:number):number {
  assertNonNegative(costUsd,'Le coût fournisseur');
  assertPositive(usdToEur,'Le taux USD/EUR');
  assertPositive(eurToFcfa,'Le taux EUR/FCFA');
  return Math.ceil(costUsd*usdToEur*eurToFcfa*(1+CLIENT_MARKUP_RATE));
}

/** A margin can be negative (an operation not billed to the client but paid to fal, e.g. a failed attempt's storyboard). */
export function formatSignedFcfa(amount:number):string {
  if(!Number.isFinite(amount)) throw new Error('Le montant doit être un nombre');
  const rounded=Math.round(amount);
  return rounded<0 ? `−${formatFcfa(-rounded)}` : formatFcfa(rounded);
}

export function formatFcfa(amount:number):string {
  assertNonNegative(amount,'Le montant');
  const formatted=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Math.round(amount));
  return `${formatted.replace(/[\u00a0\u202f ]/g,'\u00a0')} FCFA`;
}
