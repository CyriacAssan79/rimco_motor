import { NextResponse } from 'next/server';
import { errorResponse, getActor } from '@/core/auth/guards';
import { DEFAULT_KEYFRAME_APPROVAL_MODE } from '@/core/versions/keyframe-approval';
import { loadBrandApprovalSettings } from '@/core/versions/keyframe-approval-server';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';

/** Setting of the user's brand, for the Studio box « Valider les images clés avant la vidéo ». */
export async function GET() {
  try {
    const actor = await getActor();
    if (!env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ mode: DEFAULT_KEYFRAME_APPROVAL_MODE, clipApproval: true });
    // 28/10: `clipApproval` tells the Studio whether the clips are validated too (setting of the operator).
    return NextResponse.json(await loadBrandApprovalSettings(createStorageAdminClient(), actor.brandId));
  } catch (error) { return errorResponse(error); }
}
