import type { SupabaseClient } from '@supabase/supabase-js';
import { findCuratedLocation } from '@/core/assets/location-catalog';
import { PLACE_GEOMETRY_COLUMNS, placeGeometryFromRow, type PlaceGeometry } from '@/core/assets/place-geometry';

/** A place selected for a storyboard, curated or uploaded, with what its photo shows. */
export type SelectedPlace = { id: string; title: string; category: string | null; path: string; geometry: PlaceGeometry | null; curated: boolean };

export class PlaceSelectionError extends Error {}

/**
 * Loads the selected places in the order given, shared by the director and the generation (one place rule, one
 * place). Curated places come from the code, uploaded places from `assets`; retired curated places are refused
 * unless `allowRetired` (versions created before the retirement).
 */
export async function loadSelectedPlaces(client: SupabaseClient, brandId: string, placeIds: string[], options: { allowRetired?: boolean } = {}): Promise<SelectedPlace[]> {
  const curated = placeIds.map(findCuratedLocation).filter((place) => place !== undefined);
  if (!options.allowRetired && curated.some((place) => place.retired)) throw new PlaceSelectionError('Un lieu sélectionné a été retiré de la médiathèque. Choisissez un autre lieu.');
  const curatedIds = new Set(curated.map((place) => place.id));
  const uploadedIds = placeIds.filter((id) => !curatedIds.has(id));
  let uploaded: SelectedPlace[] = [];
  if (uploadedIds.length) {
    const { data, error } = await client.from('assets').select(`id,title,category,path,${PLACE_GEOMETRY_COLUMNS}`)
      .in('id', uploadedIds).eq('kind', 'place').eq('status', 'validée').eq('brand_id', brandId);
    if (error) throw new PlaceSelectionError(/place_viewpoint|column/i.test(error.message)
      ? 'La description des lieux n’est pas encore installée : collez la dernière version de supabase/setup.sql dans l’éditeur SQL de Supabase.'
      : 'Un ou plusieurs lieux ne sont pas disponibles pour votre marque.');
    if (!data || data.length !== uploadedIds.length) throw new PlaceSelectionError('Un ou plusieurs lieux ne sont pas disponibles pour votre marque.');
    uploaded = (data as Array<Record<string, string | null>>).map((row) => ({
      id: String(row.id), title: row.title ?? 'Lieu', category: row.category ?? null, path: String(row.path), geometry: placeGeometryFromRow(row), curated: false,
    }));
  }
  const all: SelectedPlace[] = [
    ...curated.map((place) => ({ id: place.id, title: place.title, category: place.category, path: place.path, geometry: place.geometry, curated: true })),
    ...uploaded,
  ];
  return placeIds.map((id) => all.find((place) => place.id === id)).filter((place): place is SelectedPlace => Boolean(place));
}

/** Places an admin still has to describe before a storyboard may use them. */
export function undescribedPlacesIssue(places: SelectedPlace[]): string | null {
  const missing = places.filter((place) => !place.geometry).map((place) => `« ${place.title} »`);
  if (!missing.length) return null;
  return `${missing.length > 1 ? 'Ces lieux ne sont' : 'Ce lieu n’est'} pas encore ${missing.length > 1 ? 'décrits' : 'décrit'} : ${missing.join(', ')}. Un administrateur doit indiquer dans la médiathèque le point de vue, la route, le moment de la journée et les éléments visibles.`;
}
