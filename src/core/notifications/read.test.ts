import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readNotifications } from './read';

const row = { id: 'n1', type: 'ready', message: 'Prête', version_id: 'v1', read_at: null, created_at: '2026-10-27' };
function client(results: unknown[]) {
  const selections: string[] = [];
  const users: unknown[] = [];
  const db = { from: () => { const q = {
    select: (fields: string) => { selections.push(fields); return q; },
    eq: (field: string, value: unknown) => { expect(field).toBe('user_id'); users.push(value); return q; },
    order: () => q, limit: () => Promise.resolve(results.shift()),
  }; return q; } } as unknown as SupabaseClient;
  return { db, selections, users };
}
describe('lecture des notifications pendant une migration', () => {
  it('conserve les notifications et leur filtrage utilisateur si dedupe_key est absent', async () => {
    const fake = client([{ data: null, error: { code: '42703', message: 'column notifications.dedupe_key does not exist' } }, { data: [row], error: null }]);
    expect(await readNotifications(fake.db, 'user-1')).toEqual({ notifications: [row], unread: 1, migrationRequired: true });
    expect(fake.selections[0]).toContain('dedupe_key');
    expect(fake.selections[1]).not.toContain('dedupe_key');
    expect(fake.users).toEqual(['user-1', 'user-1']);
  });
  it('lit le schéma actuel en une requête sans alerte', async () => {
    const fake = client([{ data: [{ ...row, dedupe_key: 'ready', read_at: '2026-10-27' }], error: null }]);
    expect(await readNotifications(fake.db, 'user-1')).toMatchObject({ unread: 0, migrationRequired: false });
    expect(fake.selections).toHaveLength(1);
  });
  it('ne masque pas une erreur de droits ou une autre colonne manquante', async () => {
    for (const error of [{ code: '42501', message: 'permission denied' }, { code: '42703', message: 'column notifications.message does not exist' }]) {
      const fake = client([{ data: null, error }]);
      await expect(readNotifications(fake.db, 'user-1')).rejects.toEqual(error);
      expect(fake.selections).toHaveLength(1);
    }
  });
});
