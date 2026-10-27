import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Actor } from '@/core/auth/guards';
vi.mock('./pipeline', () => ({ assembleShotMontage: vi.fn() }));
import { assembleShotMontage } from './pipeline';
import { retryFailedMontage } from './retry-montage';

const actor: Actor = { id: 'admin-1', role: 'admin', department: '', brandId: 'b1' };
const approval = { stage: 'video', by: 'human', decision: 'human_approve' };
function database() {
  const version = { id: 'v1', status: 'failed', final_path: null, updated_at: '2026-10-27T10:00:00Z', brief_json: { multiClipMode: true, lastMontageError: 'Durée incorrecte', montageAttempts: 3, clipApproval: { required: true, approvedAt: '2026-10-27' } } } as Record<string, unknown>;
  const shots = [{ shot_number: 1, duration_seconds: 4, status: 'ready', raw_path: 'paid/clip-1.mp4', verification_history: [approval] }];
  const tables: string[] = [];
  const db = { from(table: string) {
    tables.push(table);
    if (!['video_versions', 'video_shots'].includes(table)) throw new Error(`Accès interdit au test : ${table}`);
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | undefined;
    const execute = () => {
      if (table === 'video_shots') return { data: structuredClone(shots), error: null };
      if (patch) {
        if (filters.some(([key, value]) => version[key] !== value)) return { data: null, error: null };
        Object.assign(version, patch);
      }
      return { data: structuredClone(version), error: null };
    };
    const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; }, order: () => q,
      update: (value: Record<string, unknown>) => { patch = value; return q; }, maybeSingle: async () => execute(),
      then: (resolve: (value: unknown) => void) => resolve(execute()),
    }; return q;
  } } as unknown as SupabaseClient;
  return { db, version, shots, tables };
}
beforeEach(() => { vi.mocked(assembleShotMontage).mockReset().mockResolvedValue({ finalPath: 'saved/montage.mp4' }); });

describe('reprise du montage conservé', () => {
  it('réserve une seule reprise pour deux onglets et ne touche ni aux clips ni au journal', async () => {
    const fake = database();
    const outcomes = await Promise.allSettled([retryFailedMontage(fake.db, 'v1', actor), retryFailedMontage(fake.db, 'v1', actor)]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(assembleShotMontage).toHaveBeenCalledExactlyOnceWith('v1');
    expect(fake.shots[0].raw_path).toBe('paid/clip-1.mp4');
    expect(fake.tables).not.toContain('usage_ledger');
  });
  it('refuse un collaborateur avant tout accès aux données', async () => {
    const fake = database();
    await expect(retryFailedMontage(fake.db, 'v1', { ...actor, role: 'collaborateur' })).rejects.toMatchObject({ status: 403 });
    expect(fake.tables).toEqual([]);
    expect(assembleShotMontage).not.toHaveBeenCalled();
  });
  it('refuse un échec de génération, même si le statut est failed', async () => {
    const fake = database(); fake.version.brief_json = { multiClipMode: true };
    await expect(retryFailedMontage(fake.db, 'v1', actor)).rejects.toMatchObject({ status: 409 });
    expect(assembleShotMontage).not.toHaveBeenCalled();
  });
  it('refuse un clip manquant ou non validé', async () => {
    for (const issue of ['missing', 'unapproved']) {
      const fake = database();
      if (issue === 'missing') fake.shots[0].raw_path = ''; else fake.shots[0].verification_history = [];
      await expect(retryFailedMontage(fake.db, 'v1', actor)).rejects.toMatchObject({ status: 409 });
      expect(fake.version.status).toBe('failed');
    }
    expect(assembleShotMontage).not.toHaveBeenCalled();
  });
  it('conserve les clips et un état relançable si FFmpeg échoue encore', async () => {
    const fake = database(); vi.mocked(assembleShotMontage).mockRejectedValue(new Error('FFmpeg indisponible'));
    await expect(retryFailedMontage(fake.db, 'v1', actor)).rejects.toMatchObject({ status: 502 });
    expect(fake.version.status).toBe('failed');
    expect(fake.version.brief_json).toMatchObject({ montageAttempts: 4, lastMontageError: 'FFmpeg indisponible', montageRetry: { requestedBy: actor.id } });
    expect(fake.shots[0].raw_path).toBe('paid/clip-1.mp4');
  });
});
