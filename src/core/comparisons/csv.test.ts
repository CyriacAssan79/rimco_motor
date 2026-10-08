import { describe, expect, it } from 'vitest';
import { buildComparisonCsv } from './csv';

describe('buildComparisonCsv', () => {
  it('exports model ratings, cost, elapsed time and escapes spreadsheet formulas', () => {
    const csv = buildComparisonCsv([{
      comparisonId: 'cmp-1', createdAt: '2026-10-08', brief: '=HYPERLINK("bad")', format: '16:9', model: 'Kling', status: 'ready',
      fidelity: 5, realism: 4, brandFit: 3, comment: 'Très bon; à revoir', elapsedSeconds: 42, costUsd: 0.35, costEur: 0.32,
      costRealFcfa: 210, priceFcfa: 2300,
    }]);
    expect(csv).toContain("'=HYPERLINK(\"\"bad\"\")");
    expect(csv).toContain('"5";"4";"3";"Très bon; à revoir";"42";"0.35"');
  });

  it('keeps the header when no result is ready yet', () => {
    expect(buildComparisonCsv([]).split('\r\n')).toHaveLength(1);
  });
});
