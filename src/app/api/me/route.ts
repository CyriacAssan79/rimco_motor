import { NextResponse } from 'next/server';
import { errorResponse, getActor } from '@/core/auth/guards';
import { loadBillingSettings } from '@/core/billing/settings';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';

export async function GET() {
  try {
    const actor = await getActor({ allowPasswordChange: true });
    // 29/10 · O03 : le menu et le Studio n'affichent la validation que si le client l'a activée (désactivée par défaut).
    let videoValidation = false;
    if (env.NEXT_PUBLIC_SUPABASE_URL && actor.clientId) {
      try { videoValidation = (await loadBillingSettings(createStorageAdminClient(), actor.clientId)).videoValidationEnabled; }
      catch { videoValidation = false; }
    }
    return NextResponse.json({ actor, videoValidation });
  } catch (error) {
    return errorResponse(error);
  }
}
