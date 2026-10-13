import { requireRole } from '@/core/auth/guards';
import { PageHeading } from '@/components/shell';
import { AdminCenter } from '@/app/admin/AdminCenter';

export default async function TeamPage() {
  await requireRole('admin');
  return <><PageHeading eyebrow="Organisation" title="Équipe" description="Gérez les utilisateurs, leurs rôles et leurs départements." /><AdminCenter /></>;
}
