import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_KEYFRAME_APPROVAL_MODE, normalizeApprovalMode, type KeyframeApprovalMode } from './keyframe-approval';

/**
 * Setting of the brand (migration 0037). Read tolerantly: before the migration, or without a brand, the default
 * applies (`always`), so a deployment never breaks the generation while the SQL is not applied yet.
 */
export async function loadBrandApprovalMode(admin: SupabaseClient, brandId: string | null | undefined): Promise<KeyframeApprovalMode> {
  if (!brandId) return DEFAULT_KEYFRAME_APPROVAL_MODE;
  const { data, error } = await admin.from('brands').select('keyframe_approval_mode').eq('id', brandId).maybeSingle();
  if (error || !data) return DEFAULT_KEYFRAME_APPROVAL_MODE;
  return normalizeApprovalMode((data as { keyframe_approval_mode?: unknown }).keyframe_approval_mode);
}
