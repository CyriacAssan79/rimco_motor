import { describe, expect, it } from 'vitest';
import { processingDurations } from './processing-metrics';

describe('processingDurations', () => {
  it('measures Fal billing from its own start rather than overlapping file transfer', () => {
    const started = Date.parse('2026-10-18T10:00:00.000Z');
    const durations = processingDurations({
      providerCompletedAt: '2026-10-18T09:58:00.000Z',
      rawStoredAt: '2026-10-18T10:00:20.000Z',
      costsSettlementStartedAt: '2026-10-18T10:00:00.000Z',
      costsSettledAt: '2026-10-18T10:00:07.000Z',
    }, 'postprocessing', started + 7_000);
    expect(durations.transferSeconds).toBe(140);
    expect(durations.billingSeconds).toBe(7);
  });

  it('keeps an active stage duration measurable before its completion timestamp exists', () => {
    const started = Date.parse('2026-10-18T10:00:00.000Z');
    const durations = processingDurations({ costsSettlementStartedAt: '2026-10-18T10:00:00.000Z' }, 'generating', started + 9_000);
    expect(durations.billingSeconds).toBe(9);
  });
});
