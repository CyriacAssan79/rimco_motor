import { describe, expect, it } from 'vitest';
import { clipBoardMeasures, isClipActive, isClipApproved, montageShots } from './clip-approval';
import { clipApprovalGate } from './clip-gate';
import { buildProgress, describeProgress } from './progress';
import type { SupabaseClient } from '@supabase/supabase-js';

const approved = { stage: 'video', by: 'human', decision: 'human_approve', at: '2026-10-27T10:05:00Z' };
const disable = { ...approved, decision: 'human_disable', disabled: true };
const shot = (number: number, history: unknown[] = []) => ({ shot_number: number, duration_seconds: 5, status: 'ready', raw_path: `clip-${number}.mp4`, video_quality_status: 'passed', verification_history: history });
const start = Date.parse('2026-10-27T10:00:00Z');

function fakeAdmin() {
  const writes: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const notifications: Record<string, unknown>[] = [];
  let claimed = false;
  const admin = {
    rpc: async (name: string, args: { p_action?: string }) => { if (name === 'rimco_patch_version_brief') return { data: null, error: null }; if (args.p_action === 'release_unused') { writes.push({ table: 'usage_ledger', patch: { status: 'released' } }); return { data: { changed: true }, error: null }; } const changed = !claimed; claimed = true; return { data: { changed }, error: null }; },
    from(table: string) {
      let patch: Record<string, unknown> | null = null;
      const q = { eq: () => q, in: () => q, is: () => q, select: () => q,
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        upsert: (items: Record<string, unknown>[]) => { notifications.push(...items); return q; },
        then: (resolve: (value: unknown) => void) => { if (patch) writes.push({ table, patch }); resolve({ data: null, error: null }); },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { admin, writes, notifications };
}

describe('planche des clips avant montage', () => {
  it('autorise une validation réversible et une désactivation sans perdre la validation', () => {
    expect(isClipApproved([approved])).toBe(true);
    expect(isClipApproved([approved, { ...approved, decision: 'human_unapprove' }])).toBe(false);
    expect(isClipApproved([approved, disable])).toBe(true);
    expect(isClipActive([disable])).toBe(false);
    expect(isClipActive([disable, { ...disable, disabled: false }])).toBe(true);
  });

  it('n’assemble que les plans actifs et validés dans l’ordre, même s’il en reste un', () => {
    expect(montageShots([shot(2, [approved]), shot(1, [approved, disable])], true).map((s) => s.shot_number)).toEqual([2]);
    expect(() => montageShots([shot(1, [disable])], true)).toThrow('au moins un');
    expect(() => montageShots([shot(1, [approved]), shot(2)], true)).toThrow('Validez tous');
    expect(montageShots([shot(1)], false)).toHaveLength(1);
  });

  it('arrête le montage avant toute validation, puis attend après une validation partielle', async () => {
    const fake = fakeAdmin();
    const brief = { keyframeApproval: { required: true } };
    const input = { ...fake, version: { id: 'v', video_id: 'f' }, userId: 'u', brief, shots: [shot(1), shot(2)], now: start };
    expect(await clipApprovalGate(input)).toMatchObject({ processingStage: 'clip_approval' });
    expect(fake.notifications).toHaveLength(1);
    expect(await clipApprovalGate({ ...input, shots: [shot(1, [approved]), shot(2)], now: start + 600_000 })).toMatchObject({ processingStage: 'clip_approval' });
  });

  it('tout valider déclenche un seul claim, même pour deux rafraîchissements', async () => {
    const fake = fakeAdmin();
    const brief = { keyframeApproval: { required: true }, clipApproval: { required: true, requestedAt: new Date(start).toISOString() } };
    const input = { admin: fake.admin, version: { id: 'v', video_id: 'f' }, userId: 'u', brief, shots: [shot(1, [approved]), shot(2, [approved])], now: start + 600_000 };
    expect(await clipApprovalGate(input)).toBeNull();
    expect(await clipApprovalGate(input)).toMatchObject({ status: 'postprocessing' });
  });

  it('48 h libère les seules corrections inutilisées, conserve la vidéo et permet le montage ensuite', async () => {
    const fake = fakeAdmin();
    const brief = { keyframeApproval: { required: true }, clipApproval: { required: true, requestedAt: new Date(start).toISOString() } };
    const input = { admin: fake.admin, version: { id: 'v', video_id: 'f' }, userId: 'u', brief, shots: [shot(1)], now: start + 49 * 3_600_000 };
    expect(await clipApprovalGate(input)).toMatchObject({ status: 'generating', processingStage: 'clip_approval' });
    expect(fake.writes.some((write) => write.table === 'usage_ledger' && write.patch.status === 'released')).toBe(true);
    expect(fake.writes.some((write) => write.patch.status === 'cancelled')).toBe(false);
    expect(await clipApprovalGate({ ...input, shots: [shot(1, [approved])] })).toBeNull();
  });

  it('mode off : pas de planche ni de nouvelle mutation', async () => {
    const fake = fakeAdmin();
    expect(await clipApprovalGate({ admin: fake.admin, version: { id: 'v', video_id: 'f' }, userId: 'u', brief: { keyframeApproval: { required: false } }, shots: [shot(1)], now: start })).toBeNull();
    expect(fake.writes).toEqual([]);
  });

  it('mesure les modifications et désactivations ; suspend le chrono et retire l’attente', () => {
    expect(clipBoardMeasures([shot(1, [{ ...approved, decision: 'human_revise' }]), shot(2, [disable])])).toEqual({ modifiedShots: 1, disabledShots: 1 });
    const progress = buildProgress({ status: 'generating', hasKeyframes: true, hasQuality: true, metrics: { requestedAt: new Date(start - 60_000).toISOString() }, shots: [shot(1)], estimate: null, now: start + 600_000, clipApproval: { required: true, requestedAt: new Date(start).toISOString() } });
    expect(progress.phase).toBe('clip_approval');
    expect(describeProgress(progress, start + 600_000).totalSeconds).toBe(60);
  });
});
