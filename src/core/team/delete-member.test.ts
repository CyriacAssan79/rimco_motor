import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@/core/auth/guards';
import { deleteMember } from './delete-member';

type State = {
  target: Record<string, unknown> | null;
  targetError: boolean;
  activeAdmins: number;
  history: Record<string, number>;
  deleteError: boolean;
  authUpdateError: boolean;
  calls: string[];
  profileUpdates: Array<Record<string, unknown>>;
};
let state: State;

function fakeAdmin() {
  return {
    from(table: string) {
      let filters: Record<string, unknown> = {};
      let mode = 'select';
      let patch: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters = { ...filters, [column]: value }; return query; },
        update: (values: Record<string, unknown>) => { mode = 'update'; patch = values; return query; },
        maybeSingle: async () => state.targetError ? { data: null, error: { message: 'column profiles.deleted_at does not exist' } } : { data: state.target, error: null },
        then: (resolve: (value: unknown) => void) => {
          if (mode === 'update') { state.calls.push('profile_update'); state.profileUpdates.push(patch); return resolve({ error: null }); }
          if (table === 'profiles') return resolve({ count: state.activeAdmins, error: null });
          const key = `${table}.${Object.keys(filters)[0]}`;
          resolve({ count: state.history[key] ?? 0, error: null });
        },
      };
      return query;
    },
    auth: { admin: {
      deleteUser: async () => { state.calls.push('delete_user'); return { error: state.deleteError ? { message: 'violates foreign key constraint' } : null }; },
      updateUserById: async (_id: string, attributes: Record<string, unknown>) => { state.calls.push(`auth_update:${String(attributes.ban_duration)}:${String(attributes.email)}`); return { error: state.authUpdateError ? { message: 'down' } : null }; },
    } },
  } as unknown as SupabaseClient;
}

const admin: Actor = { id: 'admin-1', role: 'admin', department: 'Direction', brandId: 'b1' };
const member = 'member-1';

beforeEach(() => {
  state = { target: { id: member, role: 'collaborateur', is_active: true, deleted_at: null }, targetError: false, activeAdmins: 2, history: {}, deleteError: false, authUpdateError: false, calls: [], profileUpdates: [] };
});

describe('« Supprimer un membre » (admin)', () => {
  it('deletes a member who has no video, cost or validation', async () => {
    expect(await deleteMember(fakeAdmin(), admin, member)).toEqual({ id: member, mode: 'deleted' });
    expect(state.calls).toEqual(['delete_user']);
  });

  it('archives a member with videos and costs: login blocked, e-mail freed, removed from the team, history kept', async () => {
    state.history = { 'videos.user_id': 3, 'usage_ledger.user_id': 7 };
    expect(await deleteMember(fakeAdmin(), admin, member)).toEqual({ id: member, mode: 'archived' });
    expect(state.calls).toEqual([`auth_update:876000h:supprime-${member}@membre.invalid`, 'profile_update']);
    expect(state.profileUpdates[0]).toMatchObject({ is_active: false, deleted_at: expect.any(String) });
  });

  it('archives instead when an unknown link still holds the profile', async () => {
    state.deleteError = true;
    expect(await deleteMember(fakeAdmin(), admin, member)).toMatchObject({ mode: 'archived' });
  });

  it('keeps the member in the team when the login cannot be blocked, so the admin can retry', async () => {
    state.history = { 'videos.user_id': 1 };
    state.authUpdateError = true;
    await expect(deleteMember(fakeAdmin(), admin, member)).rejects.toMatchObject({ status: 503 });
    expect(state.profileUpdates).toHaveLength(0);
  });

  it('never deletes the admin’s own account, nor the last active KÔMIAN operator', async () => {
    await expect(deleteMember(fakeAdmin(), admin, admin.id)).rejects.toMatchObject({ status: 409 });
    state.target = { id: member, role: 'operateur', is_active: true, deleted_at: null };
    state.activeAdmins = 1;
    await expect(deleteMember(fakeAdmin(), admin, member)).rejects.toMatchObject({ status: 409 });
    expect(state.calls).toHaveLength(0);
  });

  it('changes nothing before migration 0040, and says what to apply', async () => {
    state.targetError = true;
    await expect(deleteMember(fakeAdmin(), admin, member)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('0040') });
    expect(state.calls).toHaveLength(0);
  });

  it('answers « introuvable » for a member already deleted', async () => {
    state.target = { id: member, role: 'collaborateur', is_active: false, deleted_at: '2026-10-27T10:00:00Z' };
    await expect(deleteMember(fakeAdmin(), admin, member)).rejects.toMatchObject({ status: 404 });
  });
});
