import { NextResponse } from 'next/server';
import { errorResponse, getActor } from '@/core/auth/guards';
import { DEFAULT_KEYFRAME_APPROVAL_MODE } from '@/core/versions/keyframe-approval';
import { loadBrandApprovalMode } from '@/core/versions/keyframe-approval-server';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';

/** Setting of the user's brand, for the Studio box « Valider les images clés avant la vidéo ». */
export async function GET() {
  try {
    const actor = await getActor();
    if (!env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ mode: DEFAULT_KEYFRAME_APPROVAL_MODE });
    return NextResponse.json({ mode: await loadBrandApprovalMode(createStorageAdminClient(), actor.brandId) });
  } catch (error) { return errorResponse(error); }
}
