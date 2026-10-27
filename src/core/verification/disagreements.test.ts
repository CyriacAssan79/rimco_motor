import { describe, expect, it } from 'vitest';
import { disagreementReport, disagreementsCsv, recordDisagreement } from './disagreements';
const context = { versionId: 'v', videoId: 'film', shotNumber: 1, stage: 'keyframe' as const, brief: { generationTier: 'premium', storyboard: [{ locationPhotoId: 'day', shotType: 'rolling' }] }, verdict: { approved: true, issues: [], reason: 'OK' }, at: '2026-10-27T10:00:00Z', attempt: 0, reasons: ['framing', 'light'], feedback: '<script>{x} La voiture est coupée' };

describe('désaccords avec le vérificateur', () => {
  it('enregistre le verdict vert ou orange avec son contexte et le commentaire nettoyé', () => {
    for (const issues of [[], ['minor: reflection']]) {
      const entry = recordDisagreement([], { ...context, verdict: { ...context.verdict, issues } })[0];
      expect(entry).toMatchObject({ decision: 'human_disagree', by: 'human', reasons: ['framing', 'light'], disagreement: { videoId: 'film', tier: 'premium', placeId: 'day', shotType: 'rolling', judge: { approved: true, issues } } });
      expect(entry.feedback).not.toMatch(/[<>{}]/);
    }
  });
  it('ne crée aucun désaccord pour un plan rouge', () => {
    expect(recordDisagreement([], { ...context, verdict: { ...context.verdict, approved: false } })).toEqual([]);
  });
  it('regroupe par motif et étape ; le taux compte les plans uniques acceptés par le juge', () => {
    const history = recordDisagreement([], context);
    const report = disagreementReport([{ version_id: 'v', shot_number: 1, verification_history: [...history, ...history] }, { version_id: 'v', shot_number: 2, keyframe_quality: { approved: true } }]);
    expect(report.stages[0]).toEqual({ stage: 'keyframe', accepted: 2, disagreed: 1, rate: 0.5 });
    expect(report.groups).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'framing', count: 1, rate: 0.5 }), expect.objectContaining({ reason: 'light', count: 1, rate: 0.5 })]));
  });
  it('exporte le contexte et protège les cellules CSV des formules', () => {
    const report = disagreementReport([{ version_id: 'v', shot_number: 1, verification_history: recordDisagreement([], { ...context, feedback: '=HYPERLINK("x")' }) }]);
    const csv = disagreementsCsv(report.events);
    expect(csv).toContain('Image clé'); expect(csv).toContain('premium'); expect(csv).toContain('framing | light'); expect(csv).toContain("'=HYPERLINK");
  });
});
