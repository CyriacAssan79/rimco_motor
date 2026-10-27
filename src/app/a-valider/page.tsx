import { redirect } from 'next/navigation';
import { canValidate, requirePageRole } from '@/core/auth/guards';
import { PageHeading } from '@/components/shell';
import { ValidationQueue } from './ValidationQueue';

export default async function ToValidatePage() {
  const actor = await requirePageRole('collaborateur', 'admin');
  // 27/10: validating is a right (profiles.can_validate) held by a collaborator; administrators and operators always hold it.
  if (!canValidate(actor)) redirect('/');
  return <><PageHeading eyebrow="Validation" title="À valider" description="Les vidéos envoyées par l’équipe attendent votre décision avant tout téléchargement." /><ValidationQueue currentUserId={actor.id} /></>;
}
