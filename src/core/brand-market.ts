import { z } from 'zod';

/**
 * Brand settings read by the prompts (migration 0031), never written in the code (multi-brand):
 * - `market_location`: city and country of the market, e.g. « Abidjan, Côte d’Ivoire », geographic anchor of every scene;
 * - `steering_side`: side of the steering wheel and of the driver (24/10: the wheel switched sides between shots).
 */
const marketLocationSchema = z.string().trim().min(2).max(120).transform((value) => value.replace(/[<>{}]/g, ' ').replace(/\s+/g, ' ').trim());
const steeringSideSchema = z.enum(['left', 'right']);
export type SteeringSide = z.infer<typeof steeringSideSchema>;
export type BrandSettings = { marketLocation?: string; steeringSide?: SteeringSide };

/** Columns to select from `brands` for {@link loadBrandSettings}. */
export const BRAND_SETTINGS_COLUMNS = 'market_location,steering_side';

/**
 * Loads the settings from a `brands` query. Before migration 0031 is applied the columns do not exist: the video is
 * then made without a city name or steering rule (the selected places still anchor it) instead of failing.
 */
export async function loadBrandSettings(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<BrandSettings> {
  const { data, error } = await query;
  if (error) {
    console.warn('brand_settings_unavailable', error.message);
    return {};
  }
  const row = data as { market_location?: unknown; steering_side?: unknown } | null;
  const market = marketLocationSchema.safeParse(row?.market_location);
  const steering = steeringSideSchema.safeParse(row?.steering_side);
  return { ...(market.success ? { marketLocation: market.data } : {}), ...(steering.success ? { steeringSide: steering.data } : {}) };
}

/** Market stored in `video_versions.brief_json` at creation, so every later prompt uses the same one. */
export function storedBrandMarket(brief: Record<string, unknown>): string | undefined {
  const parsed = marketLocationSchema.safeParse(brief.marketLocation);
  return parsed.success ? parsed.data : undefined;
}

/** Steering side stored in `video_versions.brief_json` at creation. */
export function storedSteeringSide(brief: Record<string, unknown>): SteeringSide | undefined {
  const parsed = steeringSideSchema.safeParse(brief.steeringSide);
  return parsed.success ? parsed.data : undefined;
}
