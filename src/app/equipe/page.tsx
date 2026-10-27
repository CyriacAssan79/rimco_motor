import { requirePageRole } from '@/core/auth/guards';
import { PageHeading } from '@/components/shell';
import { KeyframeApprovalSettings } from '@/app/admin/KeyframeApprovalSettings';
import { TeamManager } from './TeamManager';

export default async function TeamPage() {
  await requirePageRole('admin');
  return <>
    <PageHeading eyebrow="Administration" title="Équipe" description="Ajoutez les membres, choisissez leur rôle et qui peut valider les vidéos." />
    <TeamManager />
    <KeyframeApprovalSettings />
  </>;
}
