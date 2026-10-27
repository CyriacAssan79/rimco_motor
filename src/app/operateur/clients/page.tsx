import { PageHeading } from '@/components/shell';
import { requirePageRole } from '@/core/auth/guards';
import { OperatorClients } from './OperatorClients';

/** Espace KÔMIAN (27/10): never shown to the client. */
export default async function OperatorClientsPage() {
  await requirePageRole('operateur');
  return <>
    <PageHeading eyebrow="Interne KÔMIAN" title="Clients et crédits" description="Rechargez ou offrez des crédits, corrigez une erreur, prolongez une expiration. Tout reste tracé dans l’historique du client." />
    <OperatorClients />
  </>;
}
