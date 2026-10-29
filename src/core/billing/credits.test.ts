import { describe, expect, it } from 'vitest';
import { insufficientCreditAmount, insufficientCreditMessage, InsufficientCreditError, assertCreditsCover, holdCredits } from './credits';
import { buildHistory, historyCsv, perPersonSummary, type HoldRow, type MovementRow } from './credit-history';
import { DEFAULT_BILLING_SETTINGS, frozenRevisionLimits, revisionPriceFcfa, settingsFromRow } from './settings';
import { changedFields } from './change-log';
import { humanRevisionLimit } from '@/core/verification/loop';
import type { Actor } from '@/core/auth/guards';

const collaborator: Actor = { id: 'u1', role: 'collaborateur', department: '', brandId: 'b1', clientId: 'c1' };
const enforced = { clientId: 'c1', settings: { ...DEFAULT_BILLING_SETTINGS, creditsEnforced: true }, internal: false };

function rpcClient(answers: Record<string, { data: unknown; error: unknown }>) {
  const calls: Array<{ name: string; args: unknown }> = [];
  return { calls, client: { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return answers[name] ?? { data: null, error: { message: 'absent' } }; } } as never };
}

describe('crédits : refus de solde insuffisant', () => {
  it('lit le montant manquant renvoyé par la base, arrondi au FCFA supérieur', () => {
    expect(insufficientCreditAmount({ message: 'CREDIT_INSUFFICIENT:2000' })).toBe(2000);
    expect(insufficientCreditAmount({ message: 'CREDIT_INSUFFICIENT:12.4' })).toBe(13);
    expect(insufficientCreditAmount({ message: 'autre erreur' })).toBeNull();
    expect(insufficientCreditAmount(null)).toBeNull();
  });

  it('dit qui contacter : le Manager pour un contributeur, KÔMIAN pour le Manager', () => {
    expect(insufficientCreditMessage(2000, { role: 'collaborateur' })).toBe('Solde insuffisant : il manque 2 000 FCFA pour lancer cette vidéo. Contactez votre Manager RIMCO Studio.');
    expect(insufficientCreditMessage(2000, { role: 'admin' })).toContain('Contactez KÔMIAN');
    expect(new InsufficientCreditError(5, { role: 'admin' }).status).toBe(402);
  });

  it('refuse avant toute écriture quand le solde ne couvre pas le prix ; ne bloque rien si les crédits ne sont pas appliqués', async () => {
    const { client } = rpcClient({ credit_available: { data: 12000, error: null } });
    await expect(assertCreditsCover(client, collaborator, enforced, 14000)).rejects.toMatchObject({ status: 402, missingFcfa: 2000 });
    await expect(assertCreditsCover(client, collaborator, enforced, 12000)).resolves.toBeUndefined();
    await expect(assertCreditsCover(client, collaborator, { ...enforced, settings: DEFAULT_BILLING_SETTINGS }, 99999)).resolves.toBeUndefined();
    await expect(assertCreditsCover(client, collaborator, { ...enforced, internal: true }, 99999)).resolves.toBeUndefined();
  });

  it('bloque avec une clé idempotente, et ne bloque jamais pour une vidéo interne KÔMIAN', async () => {
    const { client, calls } = rpcClient({ credit_hold: { data: 'hold-1', error: null }, credit_available: { data: 900000, error: null } });
    expect(await holdCredits(client, collaborator, enforced, { videoId: 'v', versionId: 'r', kind: 'video', amountFcfa: 9199.2, key: 'video:r' })).toBe('hold-1');
    expect(calls[0]).toEqual({ name: 'credit_hold', args: { p_client: 'c1', p_user: 'u1', p_video: 'v', p_version: 'r', p_kind: 'video', p_amount: 9200, p_key: 'video:r' } });
    expect(await holdCredits(client, collaborator, { ...enforced, internal: true }, { videoId: 'v', versionId: 'r', kind: 'video', amountFcfa: 9200, key: 'k' })).toBeNull();
  });

  it('transforme le refus SQL en 402, et tolère une base sans migration tant que les crédits ne sont pas appliqués', async () => {
    const refused = rpcClient({ credit_hold: { data: null, error: { message: 'CREDIT_INSUFFICIENT:500' } } });
    await expect(holdCredits(refused.client, collaborator, enforced, { videoId: 'v', versionId: 'r', kind: 'video', amountFcfa: 9200, key: 'k' })).rejects.toMatchObject({ status: 402 });
    const missing = rpcClient({});
    expect(await holdCredits(missing.client, collaborator, { ...enforced, settings: DEFAULT_BILLING_SETTINGS }, { videoId: 'v', versionId: 'r', kind: 'video', amountFcfa: 9200, key: 'k' })).toBeNull();
    await expect(holdCredits(missing.client, collaborator, enforced, { videoId: 'v', versionId: 'r', kind: 'video', amountFcfa: 9200, key: 'k' })).rejects.toMatchObject({ status: 503 });
  });
});

describe('historique lisible des crédits', () => {
  const at = (minute: number) => `2026-10-27T10:${String(minute).padStart(2, '0')}:00Z`;
  const movements: MovementRow[] = [
    { id: 1, type: 'topup', amount_fcfa: 30000, available_after_fcfa: 30000, created_at: at(0), created_by: 'op', note: 'Facture 12' },
    { id: 2, type: 'hold', amount_fcfa: -14000, available_after_fcfa: 16000, created_at: at(1), hold_id: 'h1', user_id: 'u1', video_id: 'v1' },
    { id: 3, type: 'capture', amount_fcfa: 0, available_after_fcfa: 16000, created_at: at(9), hold_id: 'h1', user_id: 'u1', video_id: 'v1' },
    { id: 4, type: 'hold', amount_fcfa: -9200, available_after_fcfa: 6800, created_at: at(2), hold_id: 'h2', user_id: 'u2', video_id: 'v2' },
    { id: 5, type: 'release', amount_fcfa: 9200, available_after_fcfa: 16000, created_at: at(8), hold_id: 'h2', user_id: 'u2', video_id: 'v2' },
    { id: 6, type: 'hold', amount_fcfa: -5000, available_after_fcfa: 11000, created_at: at(10), hold_id: 'h3', user_id: 'u1', video_id: 'v3' },
  ];
  const holds: HoldRow[] = [
    { id: 'h1', status: 'captured', kind: 'video', amount_fcfa: 14000, enforced: true, user_id: 'u1', video_id: 'v1', created_at: at(1) },
    { id: 'h2', status: 'released', kind: 'video', amount_fcfa: 9200, enforced: true, user_id: 'u2', video_id: 'v2', created_at: at(2) },
    { id: 'h3', status: 'held', kind: 'video', amount_fcfa: 5000, enforced: true, user_id: 'u1', video_id: 'v3', created_at: at(10) },
  ];

  it('montre une seule ligne par vidéo : débitée, non facturée ou en cours', () => {
    const lines = buildHistory(movements, holds);
    expect(lines.map((line) => [line.label, line.amountFcfa])).toEqual([
      ['Vidéo en cours (réservé)', -5000],
      ['Vidéo non facturée', 0],
      ['Vidéo débitée', -14000],
      ['Recharge', 30000],
    ]);
    expect(lines.find((line) => line.videoId === 'v2')?.note).toContain('rien n’est débité');
  });

  it('récapitule par personne les vidéos débitées', () => {
    expect(perPersonSummary(buildHistory(movements, holds))).toEqual([{ userId: 'u1', videos: 1, debitedFcfa: 14000 }]);
  });

  it('exporte un CSV en français, séparé par des points-virgules', () => {
    const csv = historyCsv(buildHistory(movements, holds), new Map([['u1', 'Awa']]), new Map([['v1', 'Tank 300 · Assinie']]));
    expect(csv.startsWith('﻿Date;Opération;Personne;Vidéo;Montant (FCFA);Solde après (FCFA);Note')).toBe(true);
    expect(csv).toContain('Vidéo débitée;Awa;Tank 300 · Assinie;-14000;16000;');
  });

  it('indique une vidéo tracée sans débit pendant la mise en service', () => {
    const [line] = buildHistory([{ id: 9, type: 'hold', amount_fcfa: 0, available_after_fcfa: 0, created_at: at(0), hold_id: 'h9', user_id: 'u1' }], [{ id: 'h9', status: 'held', kind: 'video', amount_fcfa: 9200, enforced: false, user_id: 'u1', created_at: at(0) }]);
    expect(line.amountFcfa).toBe(0);
    expect(line.note).toContain('Tracé sans débit');
  });
});

describe('réglages de facturation de l’opérateur', () => {
  it('garde les valeurs par défaut validées le 27/10 quand la migration manque', () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_BILLING_SETTINGS);
    expect(DEFAULT_BILLING_SETTINGS).toMatchObject({ creditsEnforced: false, lowBalanceThresholdFcfa: 50000, purchaseValidityMonths: 12, giftValidityMonths: 3, expiryWarningDays: 30, revisionPriceFcfa: 0 });
    expect(settingsFromRow({ credits_enforced: true, revision_price_fcfa: '2500.00', human_revisions_per_shot: 2 })).toMatchObject({ creditsEnforced: true, revisionPriceFcfa: 2500, humanRevisionsPerShot: 2 });
  });

  it('fige le nombre et le prix des modifications dans la vidéo au lancement', () => {
    const brief = { humanRevisionLimits: frozenRevisionLimits({ ...DEFAULT_BILLING_SETTINGS, humanRevisionsPerShot: 3, humanClipRevisionsPerShot: 0, revisionPriceFcfa: 1500 }) };
    expect(humanRevisionLimit(brief, 'keyframe')).toBe(3);
    expect(humanRevisionLimit(brief, 'video')).toBe(0);
    expect(revisionPriceFcfa(brief)).toBe(1500);
    expect(humanRevisionLimit({}, 'keyframe')).toBe(1);
    expect(revisionPriceFcfa({})).toBe(0);
  });

  it('ne journalise que les valeurs réellement changées', () => {
    expect(changedFields({ grid_fcfa_per_second_pro: '700.00', grid_fcfa_per_second_premium: 950 }, { grid_fcfa_per_second_pro: 700, grid_fcfa_per_second_premium: 1000 }, { grid_fcfa_per_second_pro: 'Pro', grid_fcfa_per_second_premium: 'Premium' }))
      .toEqual([{ field: 'Premium', oldValue: 950, newValue: 1000 }]);
  });
});
