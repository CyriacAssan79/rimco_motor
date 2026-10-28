import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_KEYFRAME_APPROVAL_MODE, normalizeApprovalMode, type KeyframeApprovalMode } from './keyframe-approval';

/**
 * Setting of the brand (migration 0037). Read tolerantly: before the migration, or without a brand, the default
 * applies (`always`), so a deployment never breaks the generation while the SQL is not applied yet.
 */
export async function loadBrandApprovalMode(admin: SupabaseClient, brandId: string | null | undefined): Promise<KeyframeApprovalMode> {
  return (await loadBrandApprovalSettings(admin, brandId)).mode;
}

/**
 * 28/10 · both human validations of the brand: keyframes (0037) and clips (0043, default true). Read tolerantly:
 * before 0043 the clip validation follows the keyframes, as before.
 */
export async function loadBrandApprovalSettings(admin: SupabaseClient, brandId: string | null | undefined): Promise<{ mode: KeyframeApprovalMode; clipApproval: boolean }> {
  if (!brandId) return { mode: DEFAULT_KEYFRAME_APPROVAL_MODE, clipApproval: true };
  const { data, error } = await admin.from('brands').select('keyframe_approval_mode,clip_approval_enabled').eq('id', brandId).maybeSingle();
  if (error || !data) {
    const { data: legacy } = await admin.from('brands').select('keyframe_approval_mode').eq('id', brandId).maybeSingle();
    return { mode: legacy ? normalizeApprovalMode((legacy as { keyframe_approval_mode?: unknown }).keyframe_approval_mode) : DEFAULT_KEYFRAME_APPROVAL_MODE, clipApproval: true };
  }
  const row = data as { keyframe_approval_mode?: unknown; clip_approval_enabled?: unknown };
  return { mode: normalizeApprovalMode(row.keyframe_approval_mode), clipApproval: row.clip_approval_enabled !== false };
}
