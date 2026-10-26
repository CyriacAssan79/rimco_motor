import { z } from 'zod';

/**
 * Brand settings read by the prompts (migration 0031), never written in the code (multi-brand):
 * - `market_location`: city and country of the market, e.g. « Abidjan, Côte d’Ivoire », geographic anchor of every scene;
 * - `steering_side`: side of the steering wheel and of the driver (24/10: the wheel switched sides between shots);
 * - `traffic_side`: side of the road the cars drive on (26/10).
 */
const marketLocationSchema = z.string().trim().min(2).max(120).transform((value) => value.replace(/[<>{}]/g, ' ').replace(/\s+/g, ' ').trim());
const sideSchema = z.enum(['left', 'right']);
export type SteeringSide = z.infer<typeof sideSchema>;
export type TrafficSide = z.infer<typeof sideSchema>;
export type BrandSettings = { marketLocation?: string; steeringSide?: SteeringSide; trafficSide?: TrafficSide };

/** Columns to select from `brands` for {@link loadBrandSettings}. */
export const BRAND_SETTINGS_COLUMNS = 'market_location,steering_side,traffic_side';

/**
 * Loads the settings from a `brands` query. Before migration 0031 is applied the columns do not exist: the video is
 * then made without a city name, steering or traffic rule (the selected places still anchor it) instead of failing.
 */
export async function loadBrandSettings(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<BrandSettings> {
  const { data, error } = await query;
  if (error) {
    console.warn('brand_settings_unavailable', error.message);
    return {};
  }
  const row = data as { market_location?: unknown; steering_side?: unknown; traffic_side?: unknown } | null;
  const market = marketLocationSchema.safeParse(row?.market_location);
  const steering = sideSchema.safeParse(row?.steering_side);
  const traffic = sideSchema.safeParse(row?.traffic_side);
  return {
    ...(market.success ? { marketLocation: market.data } : {}),
    ...(steering.success ? { steeringSide: steering.data } : {}),
    ...(traffic.success ? { trafficSide: traffic.data } : {}),
  };
}

/** Market stored in `video_versions.brief_json` at creation, so every later prompt uses the same one. */
export function storedBrandMarket(brief: Record<string, unknown>): string | undefined {
  const parsed = marketLocationSchema.safeParse(brief.marketLocation);
  return parsed.success ? parsed.data : undefined;
}

/** Steering side stored in `video_versions.brief_json` at creation. */
export function storedSteeringSide(brief: Record<string, unknown>): SteeringSide | undefined {
  const parsed = sideSchema.safeParse(brief.steeringSide);
  return parsed.success ? parsed.data : undefined;
}

/** Traffic side stored in `video_versions.brief_json` at creation (absent on versions created before 26/10). */
export function storedTrafficSide(brief: Record<string, unknown>): TrafficSide | undefined {
  const parsed = sideSchema.safeParse(brief.trafficSide);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Driving rules of a version, read once from brief_json. Versions created before 26/10 have no `trafficSide`: they keep
 * their behaviour (no traffic rule, steering rule only when someone is visible).
 */
export function storedDrivingRules(brief: Record<string, unknown>): { steeringSide?: SteeringSide; trafficSide?: TrafficSide; steeringWithPeopleOnly: boolean } {
  const steeringSide = storedSteeringSide(brief);
  const trafficSide = storedTrafficSide(brief);
  return { ...(steeringSide ? { steeringSide } : {}), ...(trafficSide ? { trafficSide } : {}), steeringWithPeopleOnly: !trafficSide };
}
