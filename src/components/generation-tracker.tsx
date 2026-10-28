'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { indicatorText, progressView } from '@/core/versions/progress';
import {
  createGenerationTracker,
  createMemoryDueStore,
  isVersionRunning,
  type DueStore,
  type GenerationTracker,
  type TrackedVersion,
  type TrackerSnapshot,
} from '@/core/versions/generation-tracker';
import { createTabPresence, HEARTBEAT_MS, type PresenceChannel } from '@/core/versions/tab-presence';

const EMPTY: TrackerSnapshot = { versions: [], loaded: false, listError: '' };
const SEEN_KEY = 'rimco:seen-versions';
const FINISHED_KEY = 'rimco:finished-versions';
const DUE_PREFIX = 'rimco:refresh-due:';

/** Honest message while no durable job queue exists (docs/DECISIONS.md). */
/** 28/10 · webhook fal + relance chaque minute (Supabase pg_cron) : la génération ne dépend plus d’un onglet ouvert. */
export const KEEP_TAB_OPEN_MESSAGE = 'La génération continue même si vous fermez cet onglet. Les validations à faire et la vidéo prête s’affichent dans la cloche.';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window: memory only */ }
}

/** Next due time of each version, shared by the tabs of the browser; memory only if storage is unavailable. */
function browserDueStore(): DueStore {
  const memory = createMemoryDueStore();
  return {
    get(id) {
      try {
        const raw = window.localStorage.getItem(DUE_PREFIX + id);
        if (raw !== null && Number.isFinite(Number(raw))) return Number(raw);
      } catch { /* fall back to memory */ }
      return memory.get(id);
    },
    set(id, at) {
      memory.set(id, at);
      try { window.localStorage.setItem(DUE_PREFIX + id, String(at)); } catch { /* memory only */ }
    },
  };
}

function browserLock(): ((id: string, run: () => Promise<void>) => Promise<void>) | undefined {
  if (typeof navigator === 'undefined' || !navigator.locks) return undefined;
  return (id, run) => navigator.locks.request(`rimco-refresh-${id}`, { ifAvailable: true }, async (lock) => { if (lock) await run(); }).then(() => undefined);
}

type TrackerContext = {
  snapshot: TrackerSnapshot;
  userId?: string;
  /** Running or recent versions of the signed-in user. */
  mine: TrackedVersion[];
  seenIds: ReadonlySet<string>;
  finishedAt: Readonly<Record<string, number>>;
  track(id: string, initial: Record<string, unknown>): void;
  resolveReview(id: string): void;
  /** A /refresh answer obtained outside the loop (a finished video opened again in the Studio). */
  receive(id: string, data: Record<string, unknown>): void;
  reload(): Promise<void>;
  markSeen(id: string): void;
};

const noop = () => undefined;
const Context = createContext<TrackerContext>({
  snapshot: EMPTY, mine: [], seenIds: new Set(), finishedAt: {}, track: noop, resolveReview: noop, receive: noop, reload: async () => undefined, markSeen: noop,
});

export function useGenerationTracker() {
  return useContext(Context);
}

export function GenerationTrackerProvider({ enabled, userId, children }: { enabled: boolean; userId?: string; children: React.ReactNode }) {
  const [tracker, setTracker] = useState<GenerationTracker | null>(null);
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [finishedAt, setFinishedAt] = useState<Record<string, number>>({});

  useEffect(() => {
    setSeenIds(new Set(readJson<string[]>(SEEN_KEY, [])));
    setFinishedAt(readJson<Record<string, number>>(FINISHED_KEY, {}));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const isMine = (version: TrackedVersion) => !userId || !version.userId || version.userId === userId;
    let presence: ReturnType<typeof createTabPresence> | null = null;
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('rimco-studio');
    const instance = createGenerationTracker({
      async fetchJson(url) {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25_000) });
        const data = await response.json().catch(() => ({})) as Record<string, unknown>;
        return { ok: response.ok, data };
      },
      now: Date.now,
      setInterval: (run, ms) => window.setInterval(run, ms),
      clearInterval: (handle) => window.clearInterval(handle as number),
      isVisible: () => document.visibilityState === 'visible',
      dueStore: browserDueStore(),
      withLock: browserLock(),
      publish: (id, data) => presence?.shareVersion(id, data),
      onFinished(version) {
        try { window.localStorage.removeItem(DUE_PREFIX + version.id); } catch { /* nothing to clean */ }
        setFinishedAt((current) => {
          const next = Object.fromEntries(Object.entries({ ...current, [version.id]: Date.now() }).slice(-50));
          writeJson(FINISHED_KEY, next);
          return next;
        });
      },
    });
    if (channel) presence = createTabPresence({ channel: channel as unknown as PresenceChannel, tabId: crypto.randomUUID(), now: Date.now, onVersion: (id, data) => instance.receive(id, data) });
    setTracker(instance);
    instance.start();

    const onVisibility = () => { if (document.visibilityState === 'visible') instance.resume(); };
    // Warn, without blocking, only when this is the last RIMCO Studio tab and a video of the user is running.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const running = instance.getSnapshot().versions.some((version) => isMine(version) && isVersionRunning(version));
      if (!running || (presence?.otherTabCount() ?? 0) > 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const onPageHide = () => presence?.leave();
    const heartbeat = window.setInterval(() => presence?.heartbeat(), HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      instance.stop();
      presence?.leave();
      channel?.close();
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      setTracker(null);
    };
  }, [enabled, userId]);

  const subscribe = useMemo(() => tracker ? tracker.subscribe : () => noop, [tracker]);
  const getSnapshot = useMemo(() => tracker ? tracker.getSnapshot : () => EMPTY, [tracker]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const markSeen = useCallback((id: string) => {
    setSeenIds((current) => {
      if (current.has(id)) return current;
      const next = [...current, id].slice(-50);
      writeJson(SEEN_KEY, next);
      return new Set(next);
    });
  }, []);

  const value = useMemo<TrackerContext>(() => ({
    snapshot,
    userId,
    mine: snapshot.versions.filter((version) => !userId || !version.userId || version.userId === userId),
    seenIds,
    finishedAt,
    track: (id, initial) => tracker?.track(id, initial),
    resolveReview: (id) => tracker?.resolveReview(id),
    receive: (id, data) => tracker?.receive(id, data),
    reload: () => tracker?.reload() ?? Promise.resolve(),
    markSeen,
  }), [snapshot, userId, seenIds, finishedAt, tracker, markSeen]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Current time, refreshed every second while `active`: elapsed counters keep running between two refreshes. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Header indicator, on every page: « 1 vidéo en cours · Images clés · 3 min 12 s », link to the detailed follow-up. */
export function GenerationIndicator() {
  const { mine } = useGenerationTracker();
  const running = mine.filter(isVersionRunning);
  const now = useNow(running.length > 0);
  if (!running.length) return null;
  // A video waiting for a decision comes first: it is the one that needs the user.
  const views = running.map((version) => progressView(version, now));
  const shown = views.find((view) => view.phase === 'decision') ?? views[0];
  const decision = shown.phase === 'decision';
  const text = indicatorText(running.length, shown);
  return <Link href="/file-generation" title={`${text}. Voir le suivi détaillé.`} aria-label={`${text}. Voir le suivi détaillé.`} className={`flex min-h-11 min-w-0 items-center gap-2 rounded-full border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] ${decision ? 'border-[#e7c9c6] bg-[#fdf4f3] text-[#831810]' : 'border-[var(--border)] bg-white text-[#242428] hover:bg-[#f5f5f3]'}`}>
    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${decision ? 'bg-[#c51e1c]' : 'animate-pulse bg-[#c51e1c]'}`} />
    <span className="truncate tabular-nums">{text}</span>
  </Link>;
}
