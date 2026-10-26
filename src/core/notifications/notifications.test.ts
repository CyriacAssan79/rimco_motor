import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actionRequiredNotifications, type AwaitingShot } from './notify';
import { notifyStoryboardState } from './storyboard';
import { createNotificationCenter, documentTitle, notificationHref, type AppNotification } from './center';

type Row = Record<string, unknown>;

/** In-memory Supabase: notifications are unique on (user_id, version_id, dedupe_key), like the 0036 index. */
function fakeSupabase(state: { video: { user_id: string; title: string }; shots: AwaitingShot[] }) {
  const notifications: Row[] = [];
  const admin = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let operation: 'select' | 'update' | 'upsert' = 'select';
      let payload: unknown;
      const run = () => {
        if (table === 'notifications' && operation === 'upsert') {
          for (const row of (payload as { rows: Row[] }).rows) {
            const duplicate = notifications.some((existing) => existing.user_id === row.user_id && existing.version_id === row.version_id && existing.dedupe_key === row.dedupe_key);
            if (!duplicate) notifications.push({ ...row, id: `n${notifications.length + 1}`, read_at: null });
          }
          return { data: null, error: null };
        }
        if (table === 'notifications' && operation === 'update') {
          notifications.filter((row) => filters.every((filter) => filter(row))).forEach((row) => Object.assign(row, payload));
          return { data: null, error: null };
        }
        if (table === 'video_shots') return { data: state.shots.filter((row) => filters.every((filter) => filter(row as Row))), error: null };
        return { data: null, error: null };
      };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value || column === 'id' || (table === 'video_shots' && column === 'version_id')); return query; },
        is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return query; },
        like: (column: string, pattern: string) => { filters.push((row) => String(row[column]).startsWith(pattern.replace('%', ''))); return query; },
        or: () => { filters.push((row) => row.keyframe_status === 'awaiting_review' || row.video_quality_status === 'awaiting_review'); return query; },
        update: (values: Row) => { operation = 'update'; payload = values; return query; },
        upsert: (rows: Row[], options: unknown) => { operation = 'upsert'; payload = { rows, options }; return query; },
        maybeSingle: async () => ({ data: table === 'video_versions' ? { video: state.video } : null, error: null }),
        then: (resolve: (value: unknown) => void) => resolve(run()),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { admin, notifications };
}

const refused = (at: string, stage: 'keyframe' | 'video' = 'keyframe') => ({ stage, attempt: 0, at, approved: false, issues: [], reason: '', decision: 'review', by: 'verifier' });
const review = (shotNumber: number, stage: 'keyframe' | 'video' = 'keyframe') => ({ shotNumber, title: `Plan ${shotNumber}`, stage, issues: [], url: null, canRetry: true });

describe('notifications of the Studio videos (storyboard)', () => {
  it('notifies each time a shot waits for a decision, without duplicate on refresh', async () => {
    const state = { video: { user_id: 'u1', title: 'Haval H6' }, shots: [{ shot_number: 2, keyframe_status: 'awaiting_review', verification_history: [refused('2026-10-26T10:00:00Z')] }] as AwaitingShot[] };
    const { admin, notifications } = fakeSupabase(state);
    await notifyStoryboardState(admin, 'v1', { status: 'generating', reviewRequired: [review(2)] });
    await notifyStoryboardState(admin, 'v1', { status: 'generating', reviewRequired: [review(2)] }); // same state, refreshed again
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ user_id: 'u1', version_id: 'v1', type: 'action_required', message: '« Haval H6 » · Plan 2 · décision requise : l’image clé a été refusée par le contrôle automatique.' });

    // Another shot (its clip), then the same shot refused again later: two new notifications.
    state.shots = [
      { shot_number: 2, keyframe_status: 'awaiting_review', verification_history: [refused('2026-10-26T10:00:00Z'), { ...refused('2026-10-26T10:05:00Z'), decision: 'human_retry', by: 'human' }, refused('2026-10-26T10:09:00Z')] },
      { shot_number: 3, keyframe_status: 'ready', video_quality_status: 'awaiting_review', verification_history: [refused('2026-10-26T10:08:00Z', 'video')] },
    ] as AwaitingShot[];
    await notifyStoryboardState(admin, 'v1', { status: 'generating', reviewRequired: [review(2), review(3, 'video')] });
    expect(notifications.map((row) => row.message)).toEqual([
      '« Haval H6 » · Plan 2 · décision requise : l’image clé a été refusée par le contrôle automatique.',
      '« Haval H6 » · Plan 2 · décision requise : l’image clé a été refusée par le contrôle automatique.',
      '« Haval H6 » · Plan 3 · décision requise : le clip a été refusé par le contrôle automatique.',
    ]);
  });

  it('notifies a ready video once, and closes the decisions left', async () => {
    const { admin, notifications } = fakeSupabase({ video: { user_id: 'u1', title: 'Haval H6' }, shots: [{ shot_number: 1, keyframe_status: 'awaiting_review', verification_history: [refused('2026-10-26T10:00:00Z')] }] });
    await notifyStoryboardState(admin, 'v1', { status: 'generating', reviewRequired: [review(1)] });
    await notifyStoryboardState(admin, 'v1', { status: 'ready' });
    await notifyStoryboardState(admin, 'v1', { status: 'ready' });
    expect(notifications.filter((row) => row.type === 'ready')).toEqual([expect.objectContaining({ message: 'Votre vidéo « Haval H6 » est prête.', dedupe_key: 'ready' })]);
    expect(notifications.find((row) => row.type === 'action_required')?.read_at).toEqual(expect.any(String));
  });

  it('notifies a final failure once, with its cause', async () => {
    const { admin, notifications } = fakeSupabase({ video: { user_id: 'u1', title: 'Tank 300' }, shots: [] });
    await notifyStoryboardState(admin, 'v2', { status: 'failed', error: 'fal a refusé l’animation (422).' });
    await notifyStoryboardState(admin, 'v2', { status: 'failed', error: 'fal a refusé l’animation (422).' });
    expect(notifications).toEqual([expect.objectContaining({ type: 'failed', message: 'Votre vidéo « Tank 300 » a échoué : fal a refusé l’animation (422).' })]);
  });

  it('writes nothing while a video simply runs', async () => {
    const { admin, notifications } = fakeSupabase({ video: { user_id: 'u1', title: 'X' }, shots: [] });
    await notifyStoryboardState(admin, 'v3', { status: 'generating' });
    expect(notifications).toHaveLength(0);
  });

  it('gives a distinct key per shot, stage and refusal', () => {
    const keys = actionRequiredNotifications({ userId: 'u', versionId: 'v', shots: [
      { shot_number: 1, keyframe_status: 'awaiting_review', verification_history: [refused('2026-10-26T10:00:00Z')] },
      { shot_number: 1, video_quality_status: 'awaiting_review', verification_history: [refused('2026-10-26T10:00:00Z', 'video')] },
    ] }).map((item) => item.dedupeKey);
    expect(keys).toEqual(['action_required:1:keyframe:2026-10-26T10:00:00Z', 'action_required:1:video:2026-10-26T10:00:00Z']);
  });
});

const note = (type: string, read = false, id = type): AppNotification => ({ id, type, message: type, version_id: 'v1', read_at: read ? '2026-10-26T10:00:00Z' : null, created_at: '2026-10-26T09:00:00Z' });

describe('tab title and links', () => {
  it('says what needs the user', () => {
    expect(documentTitle([note('action_required'), note('action_required', false, 'b'), note('ready')])).toBe('(2) Action requise · RIMCO Studio');
    expect(documentTitle([note('action_required', true), note('ready')])).toBe('Vidéo prête · RIMCO Studio');
    expect(documentTitle([note('ready', true), note('failed')])).toBe('RIMCO Studio');
  });

  it('leads to the decision panel of the shot', () => {
    expect(notificationHref(note('action_required'))).toBe('/file-generation?version=v1#decision-v1');
    expect(notificationHref(note('review_requested'))).toBe('/a-valider');
  });
});

describe('notification center', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('updates the bell and the « À valider » badge every 60 s without page change, only while the tab is visible', async () => {
    let visible = true;
    let reviews = 1;
    let items: AppNotification[] = [];
    const calls: string[] = [];
    const center = createNotificationCenter({
      async fetchJson(url) {
        calls.push(url);
        return url.startsWith('/api/notifications') ? { ok: true, data: { notifications: items } } : { ok: true, data: { versions: Array.from({ length: reviews }, (_, index) => ({ id: index })) } };
      },
      setInterval: (run, ms) => setInterval(run, ms), clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
      isVisible: () => visible, countReviews: true,
    });
    center.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(center.getSnapshot()).toMatchObject({ pendingReviewCount: 1, notifications: [] });
    reviews = 3;
    items = [note('action_required')];
    await vi.advanceTimersByTimeAsync(60_000);
    expect(center.getSnapshot()).toMatchObject({ pendingReviewCount: 3, notifications: [expect.objectContaining({ type: 'action_required' })] });
    visible = false;
    const before = calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(calls).toHaveLength(before);
    center.stop();
  });
});
