import { PageHeading } from '@/components/shell';
import { hasAdminRights, requirePageRole } from '@/core/auth/guards';
import { CreditsView } from './CreditsView';

export default async function CreditsPage() {
  const actor = await requirePageRole('collaborateur', 'admin');
  return <>
    <PageHeading eyebrow="Production" title="Crédits" description={hasAdminRights(actor) ? 'Le solde de votre équipe, ce qui est réservé par les vidéos en cours et d’où viennent les dépenses.' : 'Le solde disponible pour vos vidéos et vos propres dépenses.'} />
    <CreditsView />
  </>;
}
