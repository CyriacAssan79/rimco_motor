import type { ReviewRequest } from '@/core/verification/loop';
import { isGenerationActive, refreshDelayMs } from './client-polling';

/**
 * Single follow-up of the running versions for the whole application (one instance per browser tab).
 * Only this module calls /api/versions/[id]/refresh: the Studio, the queue and the library read its snapshot.
 * Across tabs, the next due time of each version is shared (localStorage in the browser) and claimed under a
 * Web Lock, so a version is refreshed once per interval whatever the number of open pages.
 */
export type TrackedVersion = {
  id: string;
  videoId?: string;
  userId?: string;
  title?: string;
  status: string;
  versionStatus?: string | null;
  processingStage?: string | null;
  stageElapsedSeconds?: number | null;
  createdAt?: string;
  durationSeconds?: number;
  error?: string;
  errorMessage?: string | null;
  pollError?: string | null;
  reconciliationRequired?: boolean;
  canRetryTracking?: boolean;
  reviewRequired?: ReviewRequest[];
  /** Time (ms) of the last data received: elapsed counters keep running from it. */
  observedAt?: number;
  /** The last /refresh call failed; the next one is automatic. */
  refreshFailed?: boolean;
  [key: string]: unknown;
};

export type DueStore = { get(id: string): number | undefined; set(id: string, at: number): void };
export type TrackerDeps = {
  fetchJson(url: string): Promise<{ ok: boolean; data: Record<string, unknown> }>;
  now(): number;
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  isVisible(): boolean;
  dueStore: DueStore;
  /** Runs `run` only if no other tab holds the lock of this version (Web Locks `ifAvailable`). */
  withLock?: (id: string, run: () => Promise<void>) => Promise<void>;
  /** Shares a refresh result with the other tabs. */
  publish?: (id: string, data: Record<string, unknown>) => void;
  /** A followed version has just reached ready, failed or cancelled. */
  onFinished?: (version: TrackedVersion) => void;
};
export type TrackerSnapshot = { versions: TrackedVersion[]; loaded: boolean; listError: string };

export const TICK_MS = 2_000;
export const LIST_RELOAD_MS = 60_000;
/** A refresh in progress keeps its claim at most this long (request timeout 25 s), so a closed tab never blocks a version. */
const CLAIM_MS = 30_000;
const UNAVAILABLE = 'Le suivi est momentanément indisponible. Nouvelle tentative automatique.';
/** Fields that only describe the current moment: absent from a new refresh means no longer true. */
const VOLATILE_KEYS = ['stageElapsedSeconds', 'reviewRequired', 'error', 'progress', 'keyframeApproval'] as const;

const currentStatus = (version: TrackedVersion) => version.versionStatus ?? version.status;

/** Still running for the user (shown as « en cours »), including a version waiting for a cost reconciliation. */
export function isVersionRunning(version: TrackedVersion) {
  return isGenerationActive({ status: currentStatus(version) });
}

/** Running and refreshable: a version to reconcile is never polled again automatically. */
function needsRefresh(version: TrackedVersion) {
  return isVersionRunning(version) && !version.reconciliationRequired;
}

export function createMemoryDueStore(): DueStore {
  const values = new Map<string, number>();
  return { get: (id) => values.get(id), set: (id, at) => { values.set(id, at); } };
}

export function createGenerationTracker(deps: TrackerDeps) {
  let versions = new Map<string, TrackedVersion>();
  let loaded = false;
  let listError = '';
  let snapshot: TrackerSnapshot = { versions: [], loaded, listError };
  const listeners = new Set<() => void>();
  const inFlight = new Set<string>();
  let listLoading = false;
  let lastListAt = Number.NEGATIVE_INFINITY;
  let timer: unknown = null;

  function emit() {
    snapshot = { versions: [...versions.values()], loaded, listError };
    listeners.forEach((listener) => listener());
  }

  function applyRefresh(id: string, data: Record<string, unknown>) {
    const previous = versions.get(id) ?? { id, status: 'generating' };
    const next: TrackedVersion = { ...previous, ...data, id, refreshFailed: false, observedAt: deps.now() };
    for (const key of VOLATILE_KEYS) if (!(key in data)) delete next[key];
    if (typeof data.status === 'string') next.versionStatus = data.status;
    versions.set(id, next);
    if (isVersionRunning(previous) && !isVersionRunning(next)) {
      deps.onFinished?.(next);
      // The list gives the final state (validation, preview rights): read it at the next tick.
      lastListAt = Number.NEGATIVE_INFINITY;
    }
    emit();
  }

  function applyList(items: TrackedVersion[], requestedAt: number) {
    const at = deps.now();
    const next = new Map<string, TrackedVersion>();
    // A version just launched may not be listed yet: it stays first until the list returns it.
    for (const [id, version] of versions) if (version.localOnly && !items.some((item) => item.id === id)) next.set(id, version);
    for (const item of items) {
      const previous = versions.get(item.id);
      // A refresh received after the list was requested is newer: the list must not bring back an older state.
      const refreshedSince = previous?.observedAt !== undefined && previous.observedAt >= requestedAt;
      next.set(item.id, refreshedSince ? { ...item, ...previous, localOnly: false } : { ...previous, ...item, localOnly: false, observedAt: at });
    }
    versions = next;
  }

  async function reload() {
    if (listLoading) return;
    listLoading = true;
    const requestedAt = deps.now();
    lastListAt = requestedAt;
    try {
      const response = await deps.fetchJson('/api/versions?includePreviews=false');
      if (response.ok) {
        applyList(Array.isArray(response.data.versions) ? response.data.versions as TrackedVersion[] : [], requestedAt);
        listError = '';
      } else listError = typeof response.data.error === 'string' ? response.data.error : 'Impossible de charger le suivi des vidéos.';
    } catch {
      listError = 'Impossible de charger le suivi des vidéos.';
    } finally {
      listLoading = false;
      loaded = true;
      emit();
    }
  }

  async function refreshOne(id: string) {
    // Existing lock against concurrent calls: one request per version at a time in this tab.
    if (inFlight.has(id)) return;
    inFlight.add(id);
    const run = async () => {
      const at = deps.now();
      if (at < (deps.dueStore.get(id) ?? 0)) return; // another tab has just refreshed it
      deps.dueStore.set(id, at + CLAIM_MS);
      let response: { ok: boolean; data: Record<string, unknown> } | null = null;
      try { response = await deps.fetchJson(`/api/versions/${encodeURIComponent(id)}/refresh`); } catch { response = null; }
      if (!response?.ok) {
        deps.dueStore.set(id, deps.now() + refreshDelayMs(null));
        const previous = versions.get(id);
        if (previous) {
          versions.set(id, { ...previous, refreshFailed: true, error: typeof response?.data.error === 'string' ? response.data.error : UNAVAILABLE });
          emit();
        }
        return;
      }
      deps.dueStore.set(id, deps.now() + refreshDelayMs(response.data.nextPollInSeconds));
      applyRefresh(id, response.data);
      deps.publish?.(id, response.data);
    };
    try {
      if (deps.withLock) await deps.withLock(id, run);
      else await run();
    } finally {
      inFlight.delete(id);
    }
  }

  function refreshDue() {
    if (timer === null || !deps.isVisible()) return;
    const at = deps.now();
    for (const version of versions.values()) {
      if (needsRefresh(version) && at >= (deps.dueStore.get(version.id) ?? 0)) void refreshOne(version.id);
    }
  }

  function tick() {
    if (timer === null || !deps.isVisible()) return; // paused while the tab is hidden
    if (deps.now() - lastListAt >= LIST_RELOAD_MS) void reload().then(refreshDue);
    refreshDue();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    start() {
      if (timer !== null) return;
      timer = deps.setInterval(tick, TICK_MS);
      tick();
    },
    stop() {
      if (timer !== null) deps.clearInterval(timer);
      timer = null;
    },
    /** Call when the tab becomes visible again: the follow-up resumes at once. */
    resume() {
      lastListAt = Number.NEGATIVE_INFINITY;
      tick();
    },
    reload,
    /** A version just launched by this tab: followed immediately, without waiting for the list. */
    track(id: string, initial: Record<string, unknown>) {
      const at = deps.now();
      const version: TrackedVersion = { status: 'queued', createdAt: new Date(at).toISOString(), ...initial, id, localOnly: true, observedAt: at };
      if (typeof initial.status === 'string') version.versionStatus = initial.status;
      versions = new Map([[id, version], ...[...versions].filter(([key]) => key !== id)]);
      deps.dueStore.set(id, at + refreshDelayMs(initial.nextPollInSeconds));
      emit();
    },
    /** A human decision was recorded: hide the request and follow the version again within 5 s. */
    resolveReview(id: string) {
      const previous = versions.get(id);
      if (previous) versions.set(id, { ...previous, reviewRequired: [], error: undefined });
      deps.dueStore.set(id, deps.now() + 5_000);
      emit();
    },
    /** Result published by another tab. */
    receive(id: string, data: Record<string, unknown>) {
      if (versions.has(id)) applyRefresh(id, data);
    },
  };
}

export type GenerationTracker = ReturnType<typeof createGenerationTracker>;

const RECENT_FINISH_MS = 30 * 60_000;

/**
 * Version to show again in the Studio « État de la vidéo »: the latest running version of the user, otherwise a
 * version finished less than 30 minutes ago that the user has not opened or dismissed yet.
 */
export function pickStudioVersion(
  versions: TrackedVersion[],
  options: { userId?: string; seenIds: ReadonlySet<string>; finishedAt: Readonly<Record<string, number>>; now: number },
): TrackedVersion | undefined {
  const mine = versions.filter((version) => !options.userId || !version.userId || version.userId === options.userId);
  const running = mine.find(isVersionRunning);
  if (running) return running;
  return mine.find((version) => {
    if (options.seenIds.has(version.id) || !['ready', 'failed'].includes(version.status)) return false;
    const finished = options.finishedAt[version.id] ?? Date.parse(version.createdAt ?? '');
    return Number.isFinite(finished) && options.now - finished < RECENT_FINISH_MS;
  });
}
