export type Tier = 'standard'|'pro'|'premium'|'test';
export const CLIENT_MARKUP_RATE = 0.30;

function assertPositive(value:number,label:string):void {
  if(!Number.isFinite(value)||value<=0) throw new Error(`${label} doit être un nombre positif`);
}
function assertNonNegative(value:number,label:string):void {
  if(!Number.isFinite(value)||value<0) throw new Error(`${label} doit être un nombre positif ou nul`);
}

export function estimatePriceFcfa(seconds:number,tier:Tier):number {
  assertPositive(seconds,'La durée');
  const pricePerSecond=tier==='standard'?460:700;
  return Math.round(seconds*pricePerSecond);
}

export function estimateGridPriceFcfa(seconds: number, tier: Tier, grid: { standard: number; premium: number }): number {
  assertPositive(seconds, 'La durée');
  assertNonNegative(grid.standard, 'Le tarif Standard');
  assertNonNegative(grid.premium, 'Le tarif Premium');
  const pricePerSecond = tier === 'standard' ? grid.standard : grid.premium;
  return Math.round(seconds * pricePerSecond);
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
