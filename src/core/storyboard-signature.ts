import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from '@/core/auth/guards';
import { env } from '@/env';

/**
 * Signed storyboard (26/10): /api/storyboard/suggest signs the shots it returns (plus the people sheet), /api/versions
 * launches only a storyboard whose signature is valid. The browser can no longer send its own texts to the
 * generators. Bound to the user and to the main choices (vehicle, tier, duration, format, workflow); valid 24 h.
 * Server only: never import this module from a client component.
 */
export const STORYBOARD_SIGNATURE_TTL_SECONDS = 24 * 60 * 60;
/** Simulation only, so that CI and the end-to-end test work without a secret; refused in live. */
const MOCK_SIGNING_KEY = 'rimco-simulation-only-storyboard-signing-key';

export type StoryboardSignatureContext = {
  userId: string;
  vehicleDossierId: string;
  workflow: 'single' | 'multi_clip';
  mode: string;
  durationSeconds: number;
  format: string;
};
export type SignedStoryboard = { storyboard: unknown; castDescription: string; context: StoryboardSignatureContext };

/** JSON with sorted keys and no undefined values: the same storyboard always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry === undefined ? null : entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Signing key; a clear French error in live when it is missing (no generation is launched). */
export function storyboardSigningKey(): string {
  return signingKeyFor(env.STORYBOARD_SIGNING_KEY, env.PROVIDERS_MODE);
}

export function signingKeyFor(key: string | undefined, mode: 'mock' | 'live'): string {
  if (key) return key;
  if (mode === 'mock') return MOCK_SIGNING_KEY;
  throw new HttpError(503, 'La clé de signature des storyboards n’est pas configurée : ajoutez STORYBOARD_SIGNING_KEY dans Vercel (64 caractères aléatoires), puis redéployez.');
}

const mac = (key: string, expiresAt: number, payload: SignedStoryboard) =>
  createHmac('sha256', key).update(`v1.${expiresAt}.${canonicalJson(payload)}`).digest('base64url');

export function signStoryboard(payload: SignedStoryboard, key: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const expiresAt = nowSeconds + STORYBOARD_SIGNATURE_TTL_SECONDS;
  return `v1.${expiresAt}.${mac(key, expiresAt, payload)}`;
}

export function verifyStoryboardSignature(signature: unknown, payload: SignedStoryboard, key: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (typeof signature !== 'string') return false;
  const [version, expires, received] = signature.split('.');
  const expiresAt = Number(expires);
  if (version !== 'v1' || !Number.isInteger(expiresAt) || expiresAt < nowSeconds || !received) return false;
  const expected = Buffer.from(mac(key, expiresAt, payload));
  const given = Buffer.from(received);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** /api/versions: only the storyboard signed by /api/storyboard/suggest (or, later, revalidated by the server) is launched. */
export function assertStoryboardSignature(signature: unknown, payload: SignedStoryboard): void {
  if (!verifyStoryboardSignature(signature, payload, storyboardSigningKey())) throw new HttpError(422, INVALID_STORYBOARD_SIGNATURE);
}

export const INVALID_STORYBOARD_SIGNATURE = 'Ce storyboard a été modifié ou a expiré depuis sa préparation par le réalisateur. Relancez la préparation du storyboard ; aucune vidéo n’a été lancée.';
