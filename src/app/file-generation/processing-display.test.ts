import { describe, expect, it } from 'vitest';
import { formatElapsed, formatStageDurations } from './processing-display';

describe('generation progress display', () => {
  it('formats elapsed stage durations', () => {
    expect(formatElapsed(125)).toBe('2 min 5 s');
  });

  it('shows measured, active, and upcoming stage durations distinctly', () => {
    expect(formatStageDurations({
      processingStage: 'generating',
      processingDurations: { queueSeconds: 12, generationSeconds: 65, transferSeconds: null, billingSeconds: null, postproductionSeconds: null },
    })).toBe('Attente Fal : 12 s · Génération : 1 min 5 s · Transfert : À venir · Clôture des coûts : À venir · Post-production : À venir');
  });
});
