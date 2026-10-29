import { describe, expect, it } from 'vitest';
import { handleReportSchema, nonConformityActions, reasonLabels, shotReportRow, shotReportSchema } from './shot-reports';
import { shotReviewSchema } from './shot-review';

describe('S01 · plan non conforme', () => {
  it('requires at least one ticked error for a technical report, and a comment for a creative one', () => {
    expect(shotReportSchema.safeParse({ stage: 'keyframe', kind: 'technical', reasons: [], decision: 'accept' }).success).toBe(false);
    expect(shotReportSchema.safeParse({ stage: 'keyframe', kind: 'technical', reasons: ['floating'], decision: 'accept' }).success).toBe(true);
    expect(shotReportSchema.safeParse({ stage: 'video', kind: 'creative', comment: '   ', decision: 'relaunch' }).success).toBe(false);
    expect(shotReportSchema.safeParse({ stage: 'video', kind: 'creative', comment: 'Plus de soleil couchant', decision: 'relaunch' }).success).toBe(true);
  });
  it('uses only the closed list of the 10 reasons of « Modifier ce plan »', () => {
    expect(shotReportSchema.safeParse({ stage: 'video', kind: 'technical', reasons: ['not_a_reason'], decision: 'relaunch' }).success).toBe(false);
    expect(reasonLabels(['vehicle', 'light'])).toEqual(['Véhicule déformé ou différent', 'Lumière']);
  });
  it('a creative report always relaunches; a keyframe is never rejected (rejection happens on the clip)', () => {
    expect(shotReportSchema.safeParse({ stage: 'video', kind: 'creative', comment: 'Autre angle', decision: 'accept' }).success).toBe(false);
    expect(shotReportSchema.safeParse({ stage: 'keyframe', kind: 'technical', reasons: ['place'], decision: 'reject' }).success).toBe(false);
    expect(shotReportSchema.safeParse({ stage: 'video', kind: 'technical', reasons: ['place'], decision: 'reject' }).success).toBe(true);
  });
  it('stores reasons only for a technical report, cleaned and without duplicates', () => {
    expect(shotReportRow({ stage: 'video', kind: 'technical', reasons: ['floating', 'floating'], comment: ' <b>vu</b> ', decision: 'reject' })).toEqual({ stage: 'video', kind: 'technical', decision: 'reject', reasons: ['floating'], comment: 'b vu /b' });
    expect(shotReportRow({ stage: 'keyframe', kind: 'creative', reasons: [], comment: 'Famille au premier plan', decision: 'relaunch' }).reasons).toEqual([]);
  });
  it('offers accept, relaunch and reject for a technical error on a clip; relaunch only for a creative request', () => {
    expect(nonConformityActions({ kind: 'technical', stage: 'video', canRelaunch: true, canAccept: true, canReject: true })).toEqual({ accept: true, relaunch: true, reject: true });
    expect(nonConformityActions({ kind: 'technical', stage: 'keyframe', canRelaunch: true, canAccept: true, canReject: true })).toEqual({ accept: true, relaunch: true, reject: false });
    expect(nonConformityActions({ kind: 'creative', stage: 'video', canRelaunch: true, canAccept: true, canReject: true })).toEqual({ accept: false, relaunch: true, reject: false });
    expect(nonConformityActions({ kind: 'technical', stage: 'video', canRelaunch: false, canAccept: true, canReject: false })).toEqual({ accept: true, relaunch: false, reject: false });
  });
  it('marks a technical relaunch so that it is never billed', () => {
    expect(shotReviewSchema.parse({ decision: 'revise', reasons: ['vehicle'], kind: 'technical' }).kind).toBe('technical');
    expect(shotReviewSchema.safeParse({ decision: 'revise', reasons: ['vehicle'], kind: 'other' }).success).toBe(false);
  });
});

describe('S03 simple · suivi KÔMIAN', () => {
  it('requires an amount to mark a report credited, and a note in every case', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(handleReportSchema.safeParse({ id, status: 'credited', note: 'Crédit offert du 29/10' }).success).toBe(false);
    expect(handleReportSchema.safeParse({ id, status: 'credited', creditedFcfa: 2167, note: 'Crédit offert du 29/10' }).success).toBe(true);
    expect(handleReportSchema.safeParse({ id, status: 'refused', note: 'ok' }).success).toBe(false);
    expect(handleReportSchema.safeParse({ id, status: 'refused', note: 'Plan conforme au brief' }).success).toBe(true);
  });
});
