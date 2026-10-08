export function mockStatusAt(createdAt: string, now = Date.now()): 'queued' | 'generating' | 'ready' {
  const elapsed = Math.max(0, now - new Date(createdAt).getTime());
  if (elapsed < 7_000) return 'queued';
  if (elapsed < 18_000) return 'generating';
  return 'ready';
}
