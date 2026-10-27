import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ shots: [] as Array<Record<string, unknown>>, brief: {} as Record<string, unknown>, updates: [] as Array<Record<string, unknown>> }));

vi.mock('@/core/storage/supabase', () => ({
  createStorageAdminClient: () => ({
    from(table: string) {
      let operation = 'select';
      let patch: Record<string, unknown> = {};
      const query = {
        select: () => query, eq: () => query,
        update: (values: Record<string, unknown>) => { operation = 'update'; patch = values; return query; },
        maybeSingle: async () => ({ data: { id: 'v1', status: 'generating', brief_json: state.brief, video: { user_id: 'u1' } }, error: null }),
        then: (resolve: (value: unknown) => void) => {
          if (operation === 'update') state.updates.push(patch);
          resolve({ data: table === 'video_shots' ? state.shots : null, error: null });
        },
      };
      return query;
    },
  }),
}));

import { approveKeyframes } from './keyframe-approval-actions';

const actor = { id: 'u1', role: 'collaborateur' as const, department: 'Marketing', brandId: 'b1' };
const shot = (number: number, status = 'ready', history: unknown[] = []) => ({ shot_number: number, keyframe_status: status, keyframe_retry_count: 0, verification_history: history });

beforeEach(() => {
  state.updates = [];
  state.brief = { keyframeApproval: { required: true, requestedAt: '2026-10-27T10:00:00Z' } };
  state.shots = [shot(1), shot(2), shot(3, 'revising')];
});

describe('« Valider » and « Tout valider et lancer la vidéo »', () => {
  it('validates the ready shots only; the video waits for the shot being corrected', async () => {
    expect(await approveKeyframes(actor, 'v1', 'all')).toEqual({ approved: 2, allApproved: false });
    expect(state.updates).toHaveLength(2);
    expect((state.updates[0].verification_history as Array<Record<string, unknown>>).at(-1)).toMatchObject({ decision: 'human_approve', by: 'human', stage: 'keyframe' });
  });

  it('does nothing twice for a shot already validated (two tabs)', async () => {
    const approved = [{ stage: 'keyframe', attempt: 0, at: '2026-10-27T10:05:00Z', approved: true, issues: [], reason: '', decision: 'human_approve', by: 'human' }];
    state.shots = [shot(1, 'ready', approved), shot(2)];
    expect(await approveKeyframes(actor, 'v1', [1, 2])).toEqual({ approved: 1, allApproved: true });
    expect(state.updates).toHaveLength(1);
  });

  it('is refused when the board is closed (validation off, already launched or expired)', async () => {
    state.brief = { keyframeApproval: { required: false } };
    await expect(approveKeyframes(actor, 'v1', 'all')).rejects.toMatchObject({ status: 409 });
    state.brief = { keyframeApproval: { required: true, requestedAt: 'x', expiredAt: 'y' } };
    await expect(approveKeyframes(actor, 'v1', 'all')).rejects.toMatchObject({ status: 409 });
  });
});
