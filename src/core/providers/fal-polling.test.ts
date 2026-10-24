import { describe, expect, it } from 'vitest';
import { isFalInputRejection, isFalPollDue, isTransientFalPollFailure, nextPollDelaySeconds, planFalPollFailure, STUDIO_POLL_INTERVAL_SECONDS } from './fal-polling';

describe('fal polling retry policy', () => {
  it.each([400, 401, 403, 404, 422])('fails immediately on provider status %s', (status) => {
    expect(isTransientFalPollFailure({ status })).toBe(false);
    expect(planFalPollFailure({ status }, 0).action).toBe('fail');
  });

  it.each([429, 500, 503])('retries provider status %s with bounded delays', (status) => {
    const plan = planFalPollFailure({ status }, 0, new Date('2026-10-19T00:00:00.000Z'));
    expect(plan).toMatchObject({ action: 'retry', failureCount: 1, nextPollAt: '2026-10-19T00:00:15.000Z', retryAfterSeconds: 15 });
  });

  it('treats network errors as transient and allows three retries before manual recovery', () => {
    expect(planFalPollFailure(new TypeError('fetch failed'), 0).action).toBe('retry');
    expect(planFalPollFailure({ status: 503 }, 1).retryAfterSeconds).toBe(60);
    expect(planFalPollFailure({ status: 503 }, 2).retryAfterSeconds).toBe(180);
    expect(planFalPollFailure({ status: 503 }, 3)).toMatchObject({ action: 'manual', failureCount: 4, nextPollAt: null });
  });

  it('polls only when the persisted next time is due', () => {
    const now = Date.parse('2026-10-19T00:00:00.000Z');
    expect(isFalPollDue('2026-10-19T00:00:15.000Z', now)).toBe(false);
    expect(isFalPollDue('2026-10-19T00:00:15.000Z', now + 15_000)).toBe(true);
    expect(isFalPollDue(null, now)).toBe(true);
  });
});

describe('rejet du contenu par fal', () => {
  it.each([400, 422])('le statut %s ne demande pas de réconciliation des coûts', (status) => {
    expect(isFalInputRejection({ status })).toBe(true);
  });

  it.each([401, 403, 404, 500, 503])('le statut %s garde la réconciliation manuelle', (status) => {
    expect(isFalInputRejection({ status })).toBe(false);
  });

  it('une erreur réseau sans statut garde la réconciliation manuelle', () => {
    expect(isFalInputRejection(new Error('fetch failed'))).toBe(false);
  });
});

describe('rythme de suivi du Studio', () => {
  const now = Date.parse('2026-10-24T10:00:00Z');
  const inSeconds = (seconds: number) => new Date(now + seconds * 1000).toISOString();

  it('suit toutes les 10 s quand aucun plan n’est en reprise', () => {
    expect(STUDIO_POLL_INTERVAL_SECONDS).toBe(10);
    expect(nextPollDelaySeconds([], now)).toBe(10);
    expect(nextPollDelaySeconds([{ provider_next_poll_at: null }, {}], now)).toBe(10);
  });

  it('ne laisse jamais un plan en reprise de 180 s bloquer le suivi des autres', () => {
    expect(nextPollDelaySeconds([{ provider_next_poll_at: inSeconds(180) }, { provider_next_poll_at: null }], now)).toBe(10);
    expect(nextPollDelaySeconds([{ provider_next_poll_at: inSeconds(180) }], now)).toBe(10);
  });

  it('revient plus tôt quand une reprise arrive à échéance avant 10 s', () => {
    expect(nextPollDelaySeconds([{ provider_next_poll_at: inSeconds(4) }], now)).toBe(4);
    expect(nextPollDelaySeconds([{ provider_next_poll_at: inSeconds(-30) }], now)).toBe(1);
  });
});
