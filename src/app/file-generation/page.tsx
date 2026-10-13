import { requireRole } from '@/core/auth/guards';
import { PageHeading } from '@/components/shell';
import { GenerationQueue } from './GenerationQueue';

export default async function GenerationQueuePage() {
  await requireRole('collaborateur', 'admin');
  return <><PageHeading eyebrow="Production" title="File de génération" description="Suivez vos vidéos en cours. Vous serez notifié dès qu’une vidéo est prête." /><GenerationQueue /></>;
}
