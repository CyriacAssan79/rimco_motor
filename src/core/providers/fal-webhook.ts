import { env } from '@/env';

/**
 * 28/10 · webhook fal. When a fal task ends, fal calls /api/fal/webhook; the route then runs the same follow-up as
 * an open tab (/refresh) for the video that owns the task, so the next step starts at once instead of at the next
 * poll. The callback is only a « wake-up »: its body is never trusted (status, URLs and costs are read again from
 * fal by the follow-up), which is why the secret token in the URL is enough and no signature check is needed.
 *
 * Sent only from the production deployment (Preview deployments are protected and cannot be reached by fal), in
 * live mode, with FAL_WEBHOOK_SECRET set. Without it, everything works as before (polling + cron every minute).
 */
export function falWebhookUrl(source: { appUrl?: string; vercelEnv?: string; productionHost?: string; secret?: string; live?: boolean } = {
  appUrl: env.APP_URL, vercelEnv: process.env.VERCEL_ENV, productionHost: process.env.VERCEL_PROJECT_PRODUCTION_URL, secret: env.FAL_WEBHOOK_SECRET, live: env.PROVIDERS_MODE === 'live',
}): string | undefined {
  if (!source.live || !source.secret) return undefined;
  if (source.vercelEnv && source.vercelEnv !== 'production') return undefined;
  const base = source.appUrl ?? (source.productionHost ? `https://${source.productionHost}` : undefined);
  if (!base || !/^https:\/\//.test(base) || /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)) return undefined;
  return `${base.replace(/\/+$/, '')}/api/fal/webhook?token=${encodeURIComponent(source.secret)}`;
}

/** Option of queue.submit: `{ webhookUrl }` when the webhook is active, nothing otherwise. */
export function falWebhookOption(): { webhookUrl?: string } {
  const webhookUrl = falWebhookUrl();
  return webhookUrl ? { webhookUrl } : {};
}

/** fal request ids are UUIDs; anything else is refused before it reaches a database filter. */
export function isFalRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{7,79}$/.test(value);
}
