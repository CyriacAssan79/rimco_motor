type QueueStatus = {
  status: string;
  versionStatus?: string | null;
};

const ACTIVE_STATUSES = new Set(['queued', 'generating', 'postprocessing']);
const TERMINAL_STATUSES = new Set(['ready', 'failed', 'cancelled']);
/** AGENTS.md: a running version is followed every 10 s; the server may ask for longer. */
export const MIN_REFRESH_DELAY_SECONDS = 10;
export const DEFAULT_REFRESH_DELAY_SECONDS = 15;
export const MAX_REFRESH_DELAY_SECONDS = 180;

export function isGenerationActive(item: QueueStatus) {
  return ACTIVE_STATUSES.has(item.status) || ACTIVE_STATUSES.has(item.versionStatus ?? '');
}

export function isTerminalStatus(status: string | null | undefined) {
  return TERMINAL_STATUSES.has(status ?? '');
}

/** Delay before the next /refresh of one version, from the server hint, bounded to [10 s, 180 s]. */
export function refreshDelayMs(nextPollInSeconds: unknown) {
  const seconds = Number(nextPollInSeconds);
  const value = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_REFRESH_DELAY_SECONDS;
  return Math.max(MIN_REFRESH_DELAY_SECONDS, Math.min(MAX_REFRESH_DELAY_SECONDS, value)) * 1000;
}
