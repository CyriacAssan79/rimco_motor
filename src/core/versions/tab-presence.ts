/**
 * Counts the other open RIMCO Studio tabs through a BroadcastChannel-like object: each tab says hello, answers,
 * repeats a heartbeat and says goodbye. Used to warn before closing the last tab while a video is running.
 */
export type PresenceChannel = {
  postMessage(message: PresenceMessage): void;
  onmessage: ((event: { data: unknown }) => void) | null;
};
export type PresenceMessage = { type: 'hello' | 'here' | 'bye'; tabId: string } | { type: 'version'; tabId: string; id: string; data: Record<string, unknown> };

export const HEARTBEAT_MS = 10_000;
const EXPIRES_MS = 25_000;

export function createTabPresence(options: {
  channel: PresenceChannel;
  tabId: string;
  now(): number;
  /** Refresh result shared by another tab. */
  onVersion?: (id: string, data: Record<string, unknown>) => void;
}) {
  const others = new Map<string, number>();
  const { channel, tabId } = options;
  const send = (type: 'hello' | 'here' | 'bye') => channel.postMessage({ type, tabId });
  channel.onmessage = (event) => {
    const message = event.data as PresenceMessage | null;
    if (!message || typeof message !== 'object' || message.tabId === tabId) return;
    if (message.type === 'bye') others.delete(message.tabId);
    else others.set(message.tabId, options.now());
    if (message.type === 'hello') send('here');
    if (message.type === 'version') options.onVersion?.(message.id, message.data);
  };
  send('hello');
  return {
    heartbeat: () => send('here'),
    leave: () => send('bye'),
    shareVersion: (id: string, data: Record<string, unknown>) => channel.postMessage({ type: 'version', tabId, id, data }),
    otherTabCount() {
      const at = options.now();
      for (const [id, seen] of others) if (at - seen > EXPIRES_MS) others.delete(id);
      return others.size;
    },
  };
}
