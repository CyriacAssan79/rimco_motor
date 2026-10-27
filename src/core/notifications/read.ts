import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppNotification } from './center';

export const NOTIFICATIONS_MIGRATION_NOTICE = 'Les notifications sont partiellement disponibles. Dans l’éditeur SQL Supabase, exécutez le fichier supabase/migrations/0036_notifications_actions.sql à jour, puis actualisez la page.';

/** Preserve access to existing notifications while the 0036 migration is being installed. */
export async function readNotifications(client: SupabaseClient, userId: string) {
  const read = (fields: string) => client.from('notifications').select(fields).eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
  const fields = 'id,type,message,version_id,read_at,created_at';
  let result = await read(`${fields},dedupe_key`);
  const missingDedupe = result.error && ['42703', 'PGRST204'].includes(result.error.code) && /dedupe_key/i.test(result.error.message);
  if (missingDedupe) result = await read(fields);
  if (result.error) throw result.error;
  const notifications = (result.data ?? []) as unknown as AppNotification[];
  return { notifications, unread: notifications.filter((item) => !item.read_at).length, migrationRequired: Boolean(missingDedupe) };
}
