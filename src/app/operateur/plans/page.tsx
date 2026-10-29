import { PageHeading } from '@/components/shell';
import { requirePageRole } from '@/core/auth/guards';
import { ShotReports } from './ShotReports';

/** Espace KÔMIAN (29/10, S01 / S03 simple) : jamais montré au client. */
export default async function ShotReportsPage() {
  await requirePageRole('operateur');
  return <>
    <PageHeading eyebrow="Interne KÔMIAN" title="Plans non conformes" description="Plans déclarés non conformes par les clients avant le montage. Les erreurs techniques se recréditent dans Clients et crédits (Crédit offert), puis se marquent ici." />
    <ShotReports />
  </>;
}
