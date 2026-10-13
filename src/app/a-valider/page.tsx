import { requireRole } from '@/core/auth/guards';
import { PageHeading } from '@/components/shell';
import { ValidationQueue } from './ValidationQueue';

export default async function ToValidatePage() {
  await requireRole('valideur', 'admin');
  return <><PageHeading eyebrow="Validation" title="À valider" description="Les vidéos envoyées par les collaborateurs attendent votre décision." /><ValidationQueue /></>;
}
