const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isLocalSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return url.protocol === 'http:' && LOCAL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}
