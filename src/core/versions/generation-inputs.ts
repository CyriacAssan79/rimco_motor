import { findCuratedLocation } from '@/core/assets/location-catalog';

/** What the user chose in the Studio, read back from video_versions.brief_json. */
export type GenerationInputs = {
  description: string | null;
  vehicle: string | null;
  places: string[];
  cast: string[];
  lighting: string | null;
  mood: string | null;
  music: string | null;
  /** 28/10 · what the director adapted in the brief (accepted by the user before launch). */
  adaptations: string[];
};

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

/** Uploaded asset ids whose titles must be looked up (curated places carry their own title). */
export function generationInputAssetIds(brief: Record<string, unknown>): string[] {
  const placeIds = ids(brief.placeIds).filter((id) => !findCuratedLocation(id));
  const audioId = text(brief.audioAssetId);
  return audioId ? [...placeIds, audioId] : placeIds;
}

export function extractGenerationInputs(brief: Record<string, unknown>, assetTitles: ReadonlyMap<string, string> = new Map()): GenerationInputs {
  const placeIds = ids(brief.placeIds);
  const places = placeIds.length
    ? placeIds.map((id) => findCuratedLocation(id)?.title ?? assetTitles.get(id) ?? 'Lieu de la médiathèque')
    : [text(brief.location)].filter((place): place is string => place !== null);
  const cast = Array.isArray(brief.castAssets)
    ? brief.castAssets.map((member) => text((member as { title?: unknown } | null)?.title) ?? 'Personne du casting')
    : [];
  const audioId = text(brief.audioAssetId);
  return {
    description: text(brief.user_direction),
    vehicle: text(brief.vehicle_description),
    places,
    cast,
    lighting: text(brief.lighting),
    mood: text(brief.mood),
    music: audioId ? assetTitles.get(audioId) ?? 'Piste de la médiathèque' : null,
    adaptations: Array.isArray(brief.briefAdaptations) ? brief.briefAdaptations.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).slice(0, 5) : [],
  };
}
