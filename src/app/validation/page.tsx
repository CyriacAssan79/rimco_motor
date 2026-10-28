import { redirect } from 'next/navigation';
import { canValidate, requirePageRole } from '@/core/auth/guards';

/** Ancienne adresse : 28/10, ceux qui peuvent valider arrivent sur « À valider », les autres sur la Bibliothèque. */
export default async function ValidationPage() {
  const actor = await requirePageRole('collaborateur', 'admin');
  redirect(canValidate(actor) ? '/a-valider' : '/bibliotheque');
}
