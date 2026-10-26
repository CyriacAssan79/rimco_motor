import { describe, expect, it } from 'vitest';
import { relaunchCostText } from '@/components/shot-review-panel';
import { JUDGE_SYSTEM_PROMPT, parseKeyframeQuality, VISION_MAX_OUTPUT_TOKENS } from '@/core/providers/fal-keyframes';
import { relaunchCost } from '@/core/versions/review-details';
import { DEFECT_CODES, DEFECT_LABELS_FR, describeDefects, normalizeDefectCode } from './defects';
import { storedVerdict, UNREADABLE_VERDICT } from './loop';

describe('defects in French for the user', () => {
  it('has a French sentence for every code, without English', () => {
    for (const code of DEFECT_CODES) {
      const label = DEFECT_LABELS_FR[code];
      expect(label.length).toBeGreaterThan(10);
      expect(label).not.toMatch(/\b(?:the|car|wheel|blocking|minor|floats?)\b/i);
    }
    expect(new Set(Object.values(DEFECT_LABELS_FR)).size).toBe(DEFECT_CODES.length);
  });

  it('turns « t=2.5s blocking: tyre floats » into a French line, the English kept as technical detail', () => {
    expect(describeDefects(['t=2.5s blocking: tyre floats above the road', 'minor: reflection too strong'], ['floating', 'other'])).toEqual([
      { code: 'floating', label: 'La voiture flotte au-dessus du sol', severity: 'bloquant', at: 'vers 2,5 s', detail: 't=2.5s blocking: tyre floats above the road' },
      { code: 'other', label: 'Autre défaut signalé par le contrôle automatique', severity: 'mineur', at: null, detail: 'minor: reflection too strong' },
    ]);
  });

  it('still shows an old verdict without codes (« autre défaut »), and the unreadable check in French', () => {
    const old = storedVerdict({ approved: false, issues: ['car cut by the frame'], reason: 'cut' });
    expect(describeDefects(old!.issues, old!.codes)).toEqual([expect.objectContaining({ code: 'other', severity: null, detail: 'car cut by the frame' })]);
    expect(describeDefects(UNREADABLE_VERDICT.issues)[0].label).toBe('Le contrôle automatique n’a pas pu se prononcer : vérifiez ce plan à l’œil');
  });

  it('reads any unknown or missing code as « other »', () => {
    expect(normalizeDefectCode('Cut-Off')).toBe('cut_off');
    expect(normalizeDefectCode('wheels')).toBe('other');
    expect(describeDefects(['a', 'b'], ['identity'])).toMatchObject([{ code: 'identity' }, { code: 'other' }]);
  });
});

describe('judge answer with codes', () => {
  it('asks the judge for one code per issue, in English, from the closed list', () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain('"codes":[]');
    for (const code of DEFECT_CODES) expect(JUDGE_SYSTEM_PROMPT).toContain(code);
  });

  it('keeps the verdict when a code is unknown or the list is malformed', () => {
    expect(parseKeyframeQuality('{"approved":false,"issues":["blocking: car cut by the frame"],"codes":["cut_off"],"reason":"Car cut"}')).toMatchObject({ codes: ['cut_off'] });
    expect(parseKeyframeQuality('{"approved":false,"issues":["blocking: x"],"codes":"cut_off","reason":"x"}')).toMatchObject({ approved: false, issues: ['blocking: x'] });
    expect(parseKeyframeQuality('{"approved":true,"issues":[],"reason":"OK"}')).toMatchObject({ approved: true });
  });

  it('stays far below the output budget of the judge, codes included', () => {
    const worst = JSON.stringify({ approved: false, issues: Array(5).fill('x'.repeat(160)), codes: Array(5).fill('foreign_setting'), reason: 'y'.repeat(240), readableText: true });
    // About 3 characters per token for this text: the final JSON uses well under 10 % of the budget, reasoning aside.
    expect(worst.length / 3).toBeLessThan(VISION_MAX_OUTPUT_TOKENS * 0.15);
    // The codes themselves: about 35 tokens at worst (5 of the longest code), under 1 % of the budget.
    expect(JSON.stringify({ codes: Array(5).fill('foreign_setting') }).length / 3).toBeLessThan(VISION_MAX_OUTPUT_TOKENS * 0.01);
  });
});

describe('cost of a relaunch shown in the decision panel', () => {
  const rates = { usdToEur: 0.92, eurToFcfa: 655.957 };

  it('is in FCFA for a collaborator, with the application markup, and never in dollars', () => {
    const cost = relaunchCost({ brief: {}, role: 'collaborateur', ...rates });
    // 0,05 $ correction + 0,08 $ image 1K + 0,10 $ check = 0,23 $ → × 603,48 FCFA × 1,30 = 181 FCFA.
    expect(cost).toEqual({ fcfa: 181, minutes: 2 });
    expect(relaunchCostText(cost)).toBe('environ 181 FCFA, environ 2 min');
    expect(relaunchCostText(cost)).not.toContain('$');
  });

  it('adds the dollars for an administrator only', () => {
    const cost = relaunchCost({ brief: { renderSettings: { keyframeResolution: '2K' } }, role: 'admin', ...rates });
    expect(cost.usd).toBeGreaterThan(0);
    expect(relaunchCostText(cost)).toMatch(/^environ \d[\d\s]* FCFA \(0,\d\d \$\), environ 2 min$/);
  });
});
