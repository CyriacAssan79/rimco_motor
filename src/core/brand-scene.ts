import { z } from 'zod';

/**
 * Brand settings read by the prompts (migration 0031): traffic side, steering wheel side and market location.
 * Multi-brand: these values live in `brands`, never in the code.
 */
export const brandSceneSchema = z.object({
  trafficSide: z.enum(['right', 'left']),
  steeringSide: z.enum(['left', 'right']),
  marketLocation: z.string().trim().max(120),
});
export type BrandScene = z.infer<typeof brandSceneSchema>;

type BrandRow = { traffic_side?: unknown; steering_side?: unknown; market_location?: unknown } | null | undefined;

/** Tolerant reading of a `brands` row; invalid or missing values stay undefined (no rule rather than a wrong one). */
export function brandSceneFromRow(row: BrandRow): BrandScene | undefined {
  const parsed = brandSceneSchema.safeParse({
    trafficSide: row?.traffic_side,
    steeringSide: row?.steering_side,
    marketLocation: typeof row?.market_location === 'string' ? row.market_location : '',
  });
  return parsed.success ? parsed.data : undefined;
}

/** Columns to select from `brands` for {@link loadBrandScene}. */
export const BRAND_SCENE_COLUMNS = 'traffic_side,steering_side,market_location';

/**
 * Loads the brand scene from a `brands` query. Before migration 0031 is applied the columns do not exist:
 * the video is then made without these rules (as before) instead of failing.
 */
export async function loadBrandScene(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<BrandScene | undefined> {
  const { data, error } = await query;
  if (error) {
    console.warn('brand_scene_unavailable', error.message);
    return undefined;
  }
  return brandSceneFromRow(data as BrandRow);
}

/** Brand scene stored in `video_versions.brief_json` at creation, so every later prompt uses the same rules. */
export function storedBrandScene(brief: Record<string, unknown>): BrandScene | undefined {
  const parsed = brandSceneSchema.safeParse(brief.brandScene);
  return parsed.success ? parsed.data : undefined;
}
