import { describe, expect, it } from 'vitest';
import { eurText, marginText } from '@/app/couts/CostDashboard';
import { LIBRARY_STATUS_LABELS, LIBRARY_TABS, libraryStatus } from './library-status';

describe('library statuses (audit #3)', () => {
  it('says « Prête » before approval and « Validée » only after it', () => {
    expect(LIBRARY_STATUS_LABELS[libraryStatus({ status: 'ready', validationStatus: null })]).toBe('Prête');
    expect(LIBRARY_STATUS_LABELS[libraryStatus({ status: 'ready', validationStatus: 'approved' })]).toBe('Validée');
    expect(LIBRARY_STATUS_LABELS[libraryStatus({ status: 'approved' })]).toBe('Validée');
    expect(LIBRARY_STATUS_LABELS[libraryStatus({ status: 'review', validationStatus: 'pending' })]).toBe('En validation');
    expect(LIBRARY_STATUS_LABELS[libraryStatus({ status: 'rejected' })]).toBe('Refusée');
    expect(LIBRARY_STATUS_LABELS[libraryStatus({ status: 'queued' })]).toBe('En cours');
    expect(libraryStatus({ status: 'something-new' })).toBe('draft');
  });

  it('has a « Validées » tab', () => {
    expect(LIBRARY_TABS.map(([, label]) => label)).toEqual(['Tous les statuts', 'Prêtes', 'En validation', 'Validées', 'Refusées', 'En cours']);
  });
});

describe('cost page (audit #19)', () => {
  it('shows no margin for a released line', () => {
    expect(marginText({ status: 'released', price_fcfa: 2300, cost_real_fcfa: 0 })).toBe('—');
    expect(marginText({ status: 'reserved', price_fcfa: 2300 })).toBe('En cours');
    expect(marginText({ status: 'charged', price_fcfa: 2300, cost_real_fcfa: 1508, margin_fcfa: 792 })).toMatch(/^\+?792\sFCFA$/);
  });

  it('writes euros in French', () => {
    expect(eurText(2.3)).toMatch(/^2,30\s€$/);
  });
});
