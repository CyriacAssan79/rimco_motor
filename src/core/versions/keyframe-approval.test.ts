import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { approvalBoxState, resolveKeyframeApproval } from './keyframe-approval';
import { keyframeApprovalGate, type GateShot } from './keyframe-gate';
import { buildProgress, describeProgress } from './progress';

type Row = Record<string, unknown>;

/** In-memory Supabase for the gate: records the writes, notifications unique on their dedupe key. */
function fakeAdmin() {
  const writes: Array<{ table: string; values: Row }> = [];
  const notifications: Row[] = [];
  const admin = {
    from(table: string) {
      let operation = 'select';
      let payload: unknown;
      const query = {
        select: () => query, eq: () => query, is: () => query, in: () => query,
        update: (values: Row) => { operation = 'update'; payload = values; return query; },
        upsert: (rows: Row[]) => { operation = 'upsert'; payload = rows; return query; },
        maybeSingle: async () => ({ data: table === 'videos' ? { title: 'Haval H6' } : null, error: null }),
        then: (resolve: (value: unknown) => void) => {
          if (operation === 'update') writes.push({ table, values: payload as Row });
          if (operation === 'upsert') for (const row of payload as Row[]) if (!notifications.some((item) => item.dedupe_key === row.dedupe_key)) notifications.push(row);
          resolve({ data: null, error: null });
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { admin, writes, notifications };
}

const T0 = Date.parse('2026-10-27T10:00:00Z');
const hours = (value: number) => T0 + value * 3_600_000;
const approve = (at: string) => ({ stage: 'keyframe', attempt: 0, at, approved: true, issues: [], reason: '', decision: 'human_approve', by: 'human' });
const verifierAccept = (at: string) => ({ stage: 'keyframe', attempt: 1, at, approved: true, issues: [], reason: 'OK', decision: 'accept', by: 'verifier' });
const revise = (at: string) => ({ stage: 'keyframe', attempt: 0, at, approved: true, issues: [], reason: '', decision: 'human_revise', by: 'human', feedback: 'plus large', reasons: ['framing'] });

function gate(brief: Row, shots: GateShot[], now: number) {
  const fake = fakeAdmin();
  const run = () => keyframeApprovalGate({ admin: fake.admin, version: { id: 'v1', video_id: 'video1' }, video: { user_id: 'u1' }, brief, shots, keyframes: shots.map((shot) => ({ number: shot.shot_number, url: `/k${shot.shot_number}.png` })), draftFor: () => ({ title: 'Plan', scene: 's', framing: 'f', location: 'l', action: 'a', camera: 'c', durationSeconds: 5, vehiclePhotoId: 'p', shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'cruise' }), now });
  return { ...fake, run };
}
const readyShot = (number: number, history: unknown[] = []): GateShot => ({ shot_number: number, title: `Plan ${number}`, keyframe_status: 'ready', keyframe_retry_count: 0, verification_history: history });

describe('keyframe board before the paid animation', () => {
  it('ne fait pas expirer un retour à l’image clé après des clips déjà payés', async () => {
    const brief: Row = { keyframeApproval: { required: true, requestedAt: new Date(T0).toISOString(), shotNumbers: [2] }, clipApproval: { required: true, requestedAt: new Date(T0).toISOString() } };
    const run = gate(brief, [readyShot(1, [approve(new Date(T0).toISOString())]), readyShot(2)], hours(49));
    expect(await run.run()).toMatchObject({ status: 'generating', processingStage: 'keyframe_approval' });
    expect(run.writes.some((write) => write.values.status === 'cancelled')).toBe(false);
  });
  it('retour depuis un clip : montre seulement l’image clé du plan repris', async () => {
    const brief: Row = { keyframeApproval: { required: true, requestedAt: new Date(T0).toISOString(), shotNumbers: [2] }, clipApproval: { required: true, requestedAt: new Date(T0).toISOString() } };
    const result = await gate(brief, [readyShot(1, [approve(new Date(T0).toISOString())]), readyShot(2)], T0).run();
    expect(result).toMatchObject({ keyframeApproval: { shots: [{ shotNumber: 2 }] } });
    expect(result && 'keyframeApproval' in result && result.keyframeApproval?.shots).toHaveLength(1);
  });
  it('does not let the animation start before the validation, and notifies once', async () => {
    const brief: Row = { keyframeApproval: { required: true } };
    const first = gate(brief, [readyShot(1), readyShot(2)], T0);
    const result = await first.run();
    expect(result).toMatchObject({ status: 'generating', processingStage: 'keyframe_approval', keyframeApproval: { shots: [{ shotNumber: 1, state: 'to_approve', canRevise: true, action: 'Voiture qui roule · de gauche à droite · à vitesse normale · 5 s' }, { shotNumber: 2 }] } });
    expect(brief.keyframeApproval).toMatchObject({ required: true, requestedAt: new Date(T0).toISOString() });
    expect(first.notifications).toEqual([expect.objectContaining({ type: 'action_required', message: '« Haval H6 » · 2 images clés à valider avant la vidéo : l’animation attend votre validation.' })]);
    // Next refresh, one minute later: still waiting, no second notification.
    const second = gate(brief, [readyShot(1), readyShot(2)], T0 + 60_000);
    expect(await second.run()).toMatchObject({ processingStage: 'keyframe_approval' });
    expect(second.notifications).toHaveLength(0);
  });

  it('keeps waiting after a partial validation', async () => {
    const brief: Row = { keyframeApproval: { required: true, requestedAt: new Date(T0).toISOString() } };
    const result = await gate(brief, [readyShot(1, [approve(new Date(hours(1)).toISOString())]), readyShot(2)], hours(2)).run();
    expect(result).toMatchObject({ processingStage: 'keyframe_approval', keyframeApproval: { shots: [{ state: 'approved' }, { state: 'to_approve' }] } });
  });

  it('lets the animation start when every shot is validated, and records the measures', async () => {
    const requested = new Date(T0).toISOString();
    const brief: Row = { keyframeApproval: { required: true, requestedAt: requested } };
    // Shot 2 modified on the board, its new image accepted by the verifier, then validated.
    const shots = [readyShot(1, [approve(new Date(hours(0.2)).toISOString())]), readyShot(2, [revise(new Date(hours(0.1)).toISOString()), verifierAccept(new Date(hours(0.15)).toISOString()), approve(new Date(hours(0.25)).toISOString())])];
    const run = gate(brief, shots, hours(0.25));
    expect(await run.run()).toBeNull();
    expect(brief.keyframeApproval).toMatchObject({ approvedAt: new Date(hours(0.25)).toISOString(), waitSeconds: 900, modifiedShots: 1 });
  });

  it('a modified shot must be validated again', async () => {
    const brief: Row = { keyframeApproval: { required: true, requestedAt: new Date(T0).toISOString() } };
    const shots = [readyShot(1, [approve(new Date(hours(0.1)).toISOString()), revise(new Date(hours(0.2)).toISOString()), verifierAccept(new Date(hours(0.3)).toISOString())])];
    expect(await gate(brief, shots, hours(0.4)).run()).toMatchObject({ keyframeApproval: { shots: [{ state: 'to_approve', revisionsLeft: 0 }] } });
  });

  it('keeps the previous behaviour when the validation is off', async () => {
    const brief: Row = { keyframeApproval: { required: false } };
    const run = gate(brief, [readyShot(1)], T0);
    expect(await run.run()).toBeNull();
    expect(run.writes).toHaveLength(0);
    expect(await gate({}, [readyShot(1)], T0).run()).toBeNull(); // videos launched before 27/10
  });

  it('reminds after 24 h and expires after 48 h, releasing the reservations and keeping the keyframes', async () => {
    const brief: Row = { keyframeApproval: { required: true, requestedAt: new Date(T0).toISOString() } };
    const reminder = gate(brief, [readyShot(1)], hours(25));
    expect(await reminder.run()).toMatchObject({ processingStage: 'keyframe_approval' });
    expect(reminder.notifications).toEqual([expect.objectContaining({ type: 'action_required', message: expect.stringContaining('Rappel : validez les images clés avant le') })]);
    const expiry = gate(brief, [readyShot(1)], hours(48.5));
    expect(await expiry.run()).toMatchObject({ status: 'cancelled', error: expect.stringContaining('Images clés non validées sous 48 h') });
    expect(expiry.writes).toEqual(expect.arrayContaining([
      { table: 'usage_ledger', values: { status: 'released' } },
      expect.objectContaining({ table: 'video_versions', values: expect.objectContaining({ status: 'cancelled' }) }),
    ]));
    expect(expiry.writes.some((write) => write.table === 'video_shots')).toBe(false); // keyframes kept
    expect(expiry.notifications).toEqual([expect.objectContaining({ type: 'expired' })]);
  });
});

describe('setting of the brand', () => {
  it('« always » forces the validation, « off » removes it, otherwise the Studio box decides', () => {
    expect(resolveKeyframeApproval('always', false, 'standard')).toBe(true);
    expect(resolveKeyframeApproval('off', true, 'premium')).toBe(false);
    expect(resolveKeyframeApproval('optional', undefined, 'premium')).toBe(false);
    expect(resolveKeyframeApproval('premium_default', undefined, 'premium')).toBe(true);
    expect(resolveKeyframeApproval('premium_default', false, 'premium')).toBe(false);
    expect(approvalBoxState('always', 'standard')).toEqual({ visible: true, checked: true, locked: true });
    expect(approvalBoxState('off', 'premium').visible).toBe(false);
  });
});

describe('progress while the board waits', () => {
  it('shows « Votre validation » and stops the counter', () => {
    const progress = buildProgress({
      status: 'generating', metrics: { requestedAt: new Date(T0).toISOString(), keyframingStartedAt: new Date(T0 + 20_000).toISOString() },
      hasKeyframes: true, hasQuality: true, shots: [], estimate: null, now: T0 + 600_000,
      approval: { required: true, requestedAt: new Date(T0 + 120_000).toISOString() },
    });
    const view = describeProgress(progress, T0 + 600_000, T0 + 600_000);
    expect(view.items.map((item) => item.label)).toEqual(['Préparation', 'Images clés', 'Votre validation', 'Vidéo des plans', 'Contrôle qualité', 'Montage']);
    expect(view.stepLabel).toBe('Votre validation');
    expect(view.totalSeconds).toBe(120);
    expect(describeProgress(progress, T0 + 900_000, T0 + 600_000).totalSeconds).toBe(120);
  });
});
