/**
 * Notification center of the browser (bell, badge « À valider », banner, tab title). Reloaded every 60 s while
 * the tab is visible, and at once when the video follow-up sees a change: no page change needed.
 */
export type AppNotification = { id: string; type: string; message: string; version_id?: string | null; dedupe_key?: string | null; read_at?: string | null; created_at: string };
export type CenterSnapshot = { notifications: AppNotification[]; pendingReviewCount: number; loaded: boolean };

export const NOTIFICATIONS_POLL_MS = 60_000;
export const BASE_TITLE = 'RIMCO Studio';

/** Shown in the banner: decisions and validations to take, and an expired video (27/10). */
export function unreadActions(notifications: AppNotification[]) {
  return notifications.filter((item) => (item.type === 'action_required' || item.type === 'expired') && !item.read_at);
}

/** « (1) Action requise · RIMCO Studio » while a decision waits, « Vidéo prête · RIMCO Studio » for an unread ready video. */
export function documentTitle(notifications: AppNotification[]) {
  const actions = notifications.filter((item) => item.type === 'action_required' && !item.read_at).length;
  if (actions) return `(${actions}) Action requise · ${BASE_TITLE}`;
  if (notifications.some((item) => item.type === 'ready' && !item.read_at)) return `Vidéo prête · ${BASE_TITLE}`;
  return BASE_TITLE;
}

/** Where a notification leads: the decision panel of the shot, the library, or the validation queue. */
export function notificationHref(item: AppNotification) {
  if (item.type === 'action_required' && item.version_id) return `/file-generation?version=${item.version_id}#${item.dedupe_key?.startsWith('keyframe_approval') ? 'keyframes' : 'decision'}-${item.version_id}`;
  if (item.type === 'expired' && item.version_id) return `/bibliotheque?video=${item.version_id}`;
  if (item.type === 'review_requested') return '/a-valider';
  if (['ready', 'approved', 'rejected'].includes(item.type)) return item.version_id ? `/bibliotheque?video=${item.version_id}` : '/bibliotheque';
  return null;
}

/** Browser notifications: only « action requise » and « vidéo prête », only once, never for what was there at load. */
export function browserNotificationsToShow(known: ReadonlySet<string>, notifications: AppNotification[]) {
  return notifications.filter((item) => !known.has(item.id) && !item.read_at && (item.type === 'action_required' || item.type === 'ready'));
}

type Deps = {
  fetchJson(url: string): Promise<{ ok: boolean; data: Record<string, unknown> }>;
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  isVisible(): boolean;
  /** Validators and administrators see the « À valider » badge. */
  countReviews: boolean;
};

export function createNotificationCenter(deps: Deps) {
  let snapshot: CenterSnapshot = { notifications: [], pendingReviewCount: 0, loaded: false };
  const listeners = new Set<() => void>();
  let timer: unknown = null;
  let loading = false;
  const emit = (next: Partial<CenterSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const [notifications, reviews] = await Promise.all([
        deps.fetchJson('/api/notifications').catch(() => null),
        deps.countReviews ? deps.fetchJson('/api/versions?status=review&includePreviews=false').catch(() => null) : Promise.resolve(null),
      ]);
      const next: Partial<CenterSnapshot> = { loaded: true };
      if (notifications?.ok && Array.isArray(notifications.data.notifications)) next.notifications = notifications.data.notifications as AppNotification[];
      if (reviews?.ok && Array.isArray(reviews.data.versions)) next.pendingReviewCount = reviews.data.versions.length;
      emit(next);
    } finally {
      loading = false;
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    start() {
      if (timer !== null) return;
      timer = deps.setInterval(() => { if (deps.isVisible()) void refresh(); }, NOTIFICATIONS_POLL_MS);
      void refresh();
    },
    stop() {
      if (timer !== null) deps.clearInterval(timer);
      timer = null;
    },
    /** Immediate reload: the tab is shown again, or the follow-up has just seen a video change. */
    refresh,
    /** Optimistic update after « marquer comme lu ». */
    markRead(ids?: string[]) {
      const at = new Date().toISOString();
      emit({ notifications: snapshot.notifications.map((item) => !ids || ids.includes(item.id) ? { ...item, read_at: item.read_at ?? at } : item) });
    },
  };
}
