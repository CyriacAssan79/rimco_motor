import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { isMoving } from '@/core/providers/fal-keyframes';
import type { StoryboardShot } from '@/core/storyboard';

/**
 * 27/10 · « voiture fantôme »: a car that drives with nobody at the wheel is not credible.
 * - The car drives, or has just stopped after a shot where it drove: a discreet driver sits at the wheel.
 * - The car is parked, in a showroom, or the shot is a detail: the cabin may stay empty (previous behaviour).
 * - The brief says « sans personne »: no driver, but no visible empty cabin either (the windows reflect the place).
 * The driver's description is a brand setting (brands.default_driver_description), frozen in brief_json at launch so
 * every shot shows the same person. Versions launched before 27/10 have no `movingDriver` and keep their behaviour.
 */
export const FALLBACK_DRIVER_DESCRIPTION = 'one adult driver in neat smart-casual clothes, calm and natural';

const descriptionSchema = z.string().trim().min(3).max(240).transform((value) => value.replace(/[<>{}[\]`]/g, ' ').replace(/\s+/g, ' ').trim());

export type MovingDriver = { description: string };

/** Description of the brand's default driver. Before migration 0039 the column is missing: the fallback is used. */
export async function loadDefaultDriver(admin: SupabaseClient, brandId: string | null | undefined): Promise<MovingDriver> {
  if (!brandId) return { description: FALLBACK_DRIVER_DESCRIPTION };
  const { data, error } = await admin.from('brands').select('default_driver_description').eq('id', brandId).maybeSingle();
  const parsed = descriptionSchema.safeParse((data as { default_driver_description?: unknown } | null)?.default_driver_description);
  return { description: !error && parsed.success ? parsed.data : FALLBACK_DRIVER_DESCRIPTION };
}

/** Rule frozen in brief_json at launch; null on versions launched before 27/10. */
export function storedMovingDriver(brief: Record<string, unknown>): MovingDriver | null {
  const value = brief.movingDriver;
  if (!value || typeof value !== 'object') return null;
  const parsed = descriptionSchema.safeParse((value as { description?: unknown }).description);
  return { description: parsed.success ? parsed.data : FALLBACK_DRIVER_DESCRIPTION };
}

/**
 * Does this shot need someone at the wheel? Yes when the car drives, or when it stops right after a shot where it
 * drove (the driver has not vanished). Never for a detail shot or a shot in an indoor place (showroom).
 */
export function needsDriver(brief: Record<string, unknown>, shot: StoryboardShot, shotNumber: number | undefined): boolean {
  if (shot.shotType === 'detail') return false;
  const interiorIds = Array.isArray(brief.interiorPlaceIds) ? brief.interiorPlaceIds : [];
  if (shot.locationPhotoId && interiorIds.includes(shot.locationPhotoId)) return false;
  if (isMoving(shot)) return true;
  const storyboard = Array.isArray(brief.storyboard) ? brief.storyboard as StoryboardShot[] : [];
  const previous = shotNumber && shotNumber > 1 ? storyboard[shotNumber - 2] : undefined;
  return Boolean(previous && isMoving(previous));
}
