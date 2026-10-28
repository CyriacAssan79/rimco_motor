import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { createFalClient } from '@fal-ai/client';
import type { createStorageAdminClient } from '@/core/storage/supabase';
import { createSignedStorageObjectUrl } from '@/core/storage/signed-video';
import { downscaleImage } from '@/core/postproduction/pipeline';

/**
 * 28/10 · le juge reçoit des copies réduites des photos de référence (côté le plus long : 1 024 px) au lieu des
 * originaux, souvent des photos de téléphone de plusieurs Mo : moins à télécharger et à lire pour le modèle de
 * vision, donc une réponse plus rapide et moins chère. Les générateurs gardent les originaux (fidélité du véhicule).
 *
 * Chaque copie est faite une fois : rangée dans le bucket `assets` sous `judge-1024/` (photos de la médiathèque)
 * ou envoyée au stockage fal pour la journée (lieux du catalogue). Au moindre problème, l'original est utilisé.
 */
export const JUDGE_IMAGE_MAX_SIDE = 1024;
const JUDGE_PREFIX = `judge-${JUDGE_IMAGE_MAX_SIDE}/`;
type Admin = ReturnType<typeof createStorageAdminClient>;
type FalStorage = ReturnType<typeof createFalClient>['storage'];

/** Curated places (public folder) uploaded to fal: kept for 12 h in this server instance (fal keeps them 1 day). */
const curatedCache = new Map<string, { url: Promise<string | null>; at: number }>();
const CURATED_TTL_MS = 12 * 3_600_000;

export function judgeCopyPath(path: string): string {
  return `${JUDGE_PREFIX}${path.replace(/^\/+/, '')}.jpg`;
}

async function signedAsset(admin: Admin, path: string) {
  return createSignedStorageObjectUrl((storagePath, expiresIn) => admin.storage.from('assets').createSignedUrl(storagePath, expiresIn), 'assets', path);
}

async function libraryCopy(admin: Admin, path: string): Promise<string | null> {
  const copy = judgeCopyPath(path);
  // The copy is made once; a listing of its folder (no download) tells whether it exists.
  const slash = copy.lastIndexOf('/');
  const { data: found } = await admin.storage.from('assets').list(copy.slice(0, slash), { search: copy.slice(slash + 1), limit: 5 });
  if (found?.some((entry) => entry.name === copy.slice(slash + 1))) return signedAsset(admin, copy);
  const { data, error } = await admin.storage.from('assets').download(path);
  if (error || !data) return null;
  const small = await downscaleImage(Buffer.from(await data.arrayBuffer()), JUDGE_IMAGE_MAX_SIDE);
  if (!small) return null;
  const { error: uploadError } = await admin.storage.from('assets').upload(copy, small, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) return null;
  return signedAsset(admin, copy);
}

function curatedCopy(path: string, falStorage: FalStorage): Promise<string | null> {
  const cached = curatedCache.get(path);
  if (cached && Date.now() - cached.at < CURATED_TTL_MS) return cached.url;
  const url = readFile(join(process.cwd(), 'public', path.replace(/^\/+/, '')))
    .then((bytes) => downscaleImage(bytes, JUDGE_IMAGE_MAX_SIDE))
    .then((small) => small ? falStorage.upload(new Blob([small.buffer.slice(small.byteOffset, small.byteOffset + small.byteLength) as ArrayBuffer], { type: 'image/jpeg' }), { lifecycle: { expiresIn: '1d' } }) : null)
    .catch(() => null);
  curatedCache.set(path, { url, at: Date.now() });
  url.then((value) => { if (!value) curatedCache.delete(path); });
  return url;
}

/**
 * URLs for the judge, in the same order as `paths`; `originals` (same order) are used for any copy that fails.
 * Never throws.
 */
export async function judgeReferenceUrls(input: { admin: Admin; falStorage: FalStorage; paths: Array<string | null | undefined>; originals: string[] }): Promise<string[]> {
  return Promise.all(input.paths.map(async (path, index) => {
    const original = input.originals[index];
    if (!path) return original;
    try {
      const copy = path.startsWith('/places/') ? await curatedCopy(path, input.falStorage) : await libraryCopy(input.admin, path);
      return copy ?? original;
    } catch {
      return original;
    }
  }));
}
