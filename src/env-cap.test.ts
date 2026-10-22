import { afterEach, expect, it, vi } from 'vitest';

const original = process.env.VIDEO_COST_CAP_USD;
afterEach(() => {
  if (original === undefined) delete process.env.VIDEO_COST_CAP_USD; else process.env.VIDEO_COST_CAP_USD = original;
  vi.resetModules();
});

it.each([[undefined, undefined], ['', undefined], ['  ', undefined], ['20', 20]])('VIDEO_COST_CAP_USD=%j donne le plafond %j sans faire planter l’application', async (raw, expected) => {
  vi.resetModules();
  if (raw === undefined) delete process.env.VIDEO_COST_CAP_USD; else process.env.VIDEO_COST_CAP_USD = raw;
  const { env } = await import('./env');
  expect(env.VIDEO_COST_CAP_USD).toBe(expected);
});
