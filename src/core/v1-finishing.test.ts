import { describe, expect, it } from 'vitest';
import { CUTS_CONFLICT, detectBriefConflicts, mergeBriefConflicts, SINGLE_SHOT_CONFLICT } from '@/core/brief/conflicts';
import { durationHelpText, shotCountRange } from '@/core/storyboard-plan';
import { directorShotPlan } from '@/core/storyboard';

const day = { placeTimes: ['day' as const], hasInteriorPhoto: false };
const ids = (brief: string, context: Parameters<typeof detectBriefConflicts>[1] = day) => detectBriefConflicts(brief, context).map((conflict) => conflict.id);

describe('28/10 · V1 · durée et nombre de plans affichés dans le Studio', () => {
  it('présente 5 s comme un aperçu à un seul plan', () => {
    expect(durationHelpText({ mode: 'standard', durationSeconds: 5 })).toMatch(/^Aperçu rapide · 1 seul plan/);
    expect(durationHelpText({ mode: 'pro', durationSeconds: 5 })).toContain('7 s au total');
  });

  it('annonce le nombre de plans et l’absence de transition au-delà de 5 s', () => {
    expect(durationHelpText({ mode: 'standard', durationSeconds: 15 })).toBe('3 plans, enchaînés en coupe franche (pas de transition en V1). 15 s + 2 s de logo = 17 s au total.');
    expect(durationHelpText({ mode: 'pro', durationSeconds: 15 })).toMatch(/^3 à 5 plans/);
    expect(durationHelpText({ mode: 'premium', durationSeconds: 20 })).toMatch(/^4 plans.*22 s au total/);
  });

  it('suit exactement la consigne donnée au réalisateur', () => {
    for (const durationSeconds of [10, 15, 20] as const) {
      const { min, max } = shotCountRange({ mode: 'pro', durationSeconds });
      expect(directorShotPlan({ mode: 'pro', durationSeconds })).toContain(`${min} to ${max} shots`);
      expect(directorShotPlan({ mode: 'standard', durationSeconds })).toContain(`Exactly ${shotCountRange({ mode: 'standard', durationSeconds }).min} shots`);
    }
  });
});

describe('28/10 · V1 · l’utilisateur est prévenu de ce qui diffère de sa demande', () => {
  it('signale une transition visuelle demandée (coupes franches en V1)', () => {
    expect(ids('Un fondu enchaîné entre le pont et la corniche')).toContain('cuts');
    expect(ids('Des transitions fluides entre les plans')).toContain('cuts');
    expect(detectBriefConflicts('crossfade entre les scènes', day).find((conflict) => conflict.id === 'cuts')?.message).toBe(CUTS_CONFLICT);
  });

  it('ne confond pas une transition jour → nuit (ordre de lumière) avec un effet', () => {
    expect(ids('Transition du jour à la nuit sur le boulevard')).not.toContain('cuts');
  });

  it('prévient qu’un aperçu de 5 s ne filme qu’une scène', () => {
    const brief = 'Plan 1 sur le pont, puis une autre scène au showroom';
    expect(ids(brief, { ...day, singleShot: true })).toContain('single_shot');
    expect(ids(brief, day)).not.toContain('single_shot');
    expect(ids('La voiture arrive puis ralentit devant la mer', { ...day, singleShot: true })).not.toContain('single_shot');
    expect(ids('Le SUV au premier plan, la lagune derrière', { ...day, singleShot: true })).not.toContain('single_shot');
  });

  it('n’ajoute pas la phrase du code quand le réalisateur l’a déjà dite', () => {
    const merged = mergeBriefConflicts(['Fondu demandé : les plans s’enchaînent en coupe franche.'], [{ id: 'cuts', message: CUTS_CONFLICT }, { id: 'single_shot', message: SINGLE_SHOT_CONFLICT }]);
    expect(merged).toEqual(['Fondu demandé : les plans s’enchaînent en coupe franche.', SINGLE_SHOT_CONFLICT]);
  });
});

describe('28/10 · V1 · rappel des adaptations dans la Bibliothèque', () => {
  it('affiche les adaptations gardées au lancement, rien sinon', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { AdaptationsNote } = await import('@/app/bibliotheque/VideoLibrary');
    const inputs = { description: null, vehicle: null, places: [], cast: [], lighting: null, mood: null, music: null };
    const html = renderToStaticMarkup(createElement(AdaptationsNote, { video: { id: 'v', status: 'ready', inputs: { ...inputs, adaptations: [CUTS_CONFLICT] } } }));
    expect(html).toContain('Votre demande a été adaptée');
    expect(html).toContain('coupe franche');
    expect(renderToStaticMarkup(createElement(AdaptationsNote, { video: { id: 'v', status: 'ready', inputs: { ...inputs, adaptations: [] } } }))).toBe('');
  });
});
