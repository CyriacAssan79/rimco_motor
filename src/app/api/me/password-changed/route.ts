import { NextResponse } from 'next/server';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';

/**
 * Called once the person has chosen their own password (27/10): the « must change » flag set at creation or reset
 * is removed (app_metadata is never writable by the user, so the server does it for the signed-in person only).
 */
export async function POST() {
  try {
    const actor = await getActor({ allowPasswordChange: true });
    if (!actor.mustChangePassword) return NextResponse.json({ ok: true });
    const { error } = await createStorageAdminClient().auth.admin.updateUserById(actor.id, { app_metadata: { must_change_password: false } });
    if (error) throw new HttpError(503, 'Votre mot de passe est enregistré, mais l’accès n’a pas pu être débloqué. Réessayez.');
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
