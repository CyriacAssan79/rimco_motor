import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGenerationTracker, createMemoryDueStore, pickStudioVersion, type DueStore, type TrackedVersion } from './generation-tracker';
import { createTabPresence, type PresenceChannel, type PresenceMessage } from './tab-presence';

type Server = { versions: TrackedVersion[]; refresh: Record<string, Record<string, unknown>>; calls: string[] };

function makeServer(): Server {
  return {
    versions: [{ id: 'v1', userId: 'u1', status: 'generating', versionStatus: 'generating', createdAt: new Date(Date.now()).toISOString() }],
    refresh: { v1: { id: 'v1', status: 'generating', processingStage: 'keyframing', nextPollInSeconds: 30 } },
    calls: [],
  };
}

function makeTracker(server: Server, options: { dueStore: DueStore; visible?: () => boolean }) {
  return createGenerationTracker({
    async fetchJson(url) {
      server.calls.push(url);
      const refresh = url.match(/^\/api\/versions\/([^/]+)\/refresh$/);
      if (refresh) return { ok: true, data: server.refresh[decodeURIComponent(refresh[1])] ?? {} };
      return { ok: true, data: { versions: server.versions } };
    },
    now: () => Date.now(),
    setInterval: (run, ms) => setInterval(run, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    isVisible: options.visible ?? (() => true),
    dueStore: options.dueStore,
  });
}

const refreshCalls = (server: Server, id: string) => server.calls.filter((url) => url === `/api/versions/${id}/refresh`).length;

describe('generation tracker', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T10:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('loads the running versions and follows them with the server delay', async () => {
    const server = makeServer();
    const tracker = makeTracker(server, { dueStore: createMemoryDueStore() });
    tracker.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(refreshCalls(server, 'v1')).toBe(1);
    expect(tracker.getSnapshot().versions[0]).toMatchObject({ id: 'v1', processingStage: 'keyframing' });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(refreshCalls(server, 'v1')).toBe(1); // nextPollInSeconds = 30
    await vi.advanceTimersByTimeAsync(7_000);
    expect(refreshCalls(server, 'v1')).toBe(2);
    tracker.stop();
  });

  it('calls /refresh once per version and per interval, even with the Studio and the queue open in two tabs', async () => {
    const server = makeServer();
    const shared = createMemoryDueStore(); // localStorage shared by the tabs in the browser
    const studioTab = makeTracker(server, { dueStore: shared });
    const queueTab = makeTracker(server, { dueStore: shared });
    studioTab.start();
    queueTab.start();
    await vi.advanceTimersByTimeAsync(119_000);
    // 119 s with a 30 s delay: at 0, 30, 60 and 90 s; one tab alone would make exactly the same calls.
    expect(refreshCalls(server, 'v1')).toBe(4);
    studioTab.stop();
    queueTab.stop();
  });

  it('pauses while the tab is hidden and resumes when it is shown again', async () => {
    const server = makeServer();
    let visible = false;
    const tracker = makeTracker(server, { dueStore: createMemoryDueStore(), visible: () => visible });
    tracker.start();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(server.calls).toHaveLength(0);
    visible = true;
    tracker.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(refreshCalls(server, 'v1')).toBe(1);
    tracker.stop();
  });

  it('stops following a finished version and reloads the list once', async () => {
    const server = makeServer();
    server.refresh.v1 = { id: 'v1', status: 'ready' };
    const finished: string[] = [];
    const tracker = createGenerationTracker({
      async fetchJson(url) {
        server.calls.push(url);
        if (url.endsWith('/refresh')) {
          // The refresh route writes the new state before answering: the list then returns it.
          server.versions = [{ ...server.versions[0], status: 'ready', versionStatus: 'ready' }];
          return { ok: true, data: server.refresh.v1 };
        }
        return { ok: true, data: { versions: server.versions } };
      },
      now: () => Date.now(), setInterval: (run, ms) => setInterval(run, ms), clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
      isVisible: () => true, dueStore: createMemoryDueStore(), onFinished: (version) => finished.push(version.id),
    });
    tracker.start();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(finished).toEqual(['v1']);
    expect(refreshCalls(server, 'v1')).toBe(1);
    expect(tracker.getSnapshot().versions[0].versionStatus).toBe('ready');
    tracker.stop();
  });

  it('follows a version launched in this tab before the list returns it', async () => {
    const server = makeServer();
    server.versions = [];
    server.refresh.v2 = { id: 'v2', status: 'generating', processingStage: 'keyframing', nextPollInSeconds: 30 };
    const tracker = makeTracker(server, { dueStore: createMemoryDueStore() });
    tracker.start();
    await vi.advanceTimersByTimeAsync(100);
    tracker.track('v2', { status: 'generating', title: 'Essai' });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(refreshCalls(server, 'v2')).toBe(0); // first follow-up after 15 s, as before
    await vi.advanceTimersByTimeAsync(2_500);
    expect(refreshCalls(server, 'v2')).toBe(1);
    expect(tracker.getSnapshot().versions[0]).toMatchObject({ id: 'v2', title: 'Essai', processingStage: 'keyframing' });
    tracker.stop();
  });
});

describe('pickStudioVersion', () => {
  const now = Date.parse('2026-10-26T10:00:00Z');
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const base = { userId: 'u1', seenIds: new Set<string>(), finishedAt: {}, now };

  it('shows again the running video of the user', () => {
    const versions: TrackedVersion[] = [
      { id: 'other', userId: 'u2', status: 'generating', createdAt: minutesAgo(1) },
      { id: 'mine', userId: 'u1', status: 'generating', versionStatus: 'generating', createdAt: minutesAgo(4) },
    ];
    expect(pickStudioVersion(versions, base)?.id).toBe('mine');
  });

  it('shows a video finished less than 30 minutes ago and not seen yet', () => {
    const versions: TrackedVersion[] = [{ id: 'done', userId: 'u1', status: 'ready', createdAt: minutesAgo(50) }];
    expect(pickStudioVersion(versions, { ...base, finishedAt: { done: now - 10 * 60_000 } })?.id).toBe('done');
    expect(pickStudioVersion(versions, { ...base, finishedAt: { done: now - 40 * 60_000 } })).toBeUndefined();
    expect(pickStudioVersion(versions, { ...base, finishedAt: { done: now - 10 * 60_000 }, seenIds: new Set(['done']) })).toBeUndefined();
  });

  it('ignores a video already sent to validation', () => {
    expect(pickStudioVersion([{ id: 'review', userId: 'u1', status: 'review', createdAt: minutesAgo(5) }], base)).toBeUndefined();
  });
});

describe('tab presence', () => {
  function makeBus() {
    const channels: PresenceChannel[] = [];
    return () => {
      const channel: PresenceChannel = {
        onmessage: null,
        postMessage(message: PresenceMessage) { channels.filter((other) => other !== channel).forEach((other) => other.onmessage?.({ data: message })); },
      };
      channels.push(channel);
      return channel;
    };
  }

  it('knows whether this is the last RIMCO Studio tab', () => {
    const open = makeBus();
    let now = 0;
    const first = createTabPresence({ channel: open(), tabId: 'a', now: () => now });
    expect(first.otherTabCount()).toBe(0);
    const second = createTabPresence({ channel: open(), tabId: 'b', now: () => now });
    expect(first.otherTabCount()).toBe(1);
    expect(second.otherTabCount()).toBe(1);
    second.leave();
    expect(first.otherTabCount()).toBe(0);
    now = 60_000;
    expect(second.otherTabCount()).toBe(0); // a tab closed without goodbye expires
  });

  it('shares a refresh result with the other tabs', () => {
    const open = makeBus();
    const received: string[] = [];
    const first = createTabPresence({ channel: open(), tabId: 'a', now: () => 0 });
    createTabPresence({ channel: open(), tabId: 'b', now: () => 0, onVersion: (id) => received.push(id) });
    first.shareVersion('v1', { status: 'ready' });
    expect(received).toEqual(['v1']);
  });
});
