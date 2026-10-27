import {PageHeading} from '@/components/shell';
import {AdminCenter} from './AdminCenter';
import {KeyframeApprovalSettings} from './KeyframeApprovalSettings';
import { requirePageRole } from '@/core/auth/guards';
export default async function AdminPage(){await requirePageRole('admin'); return <><PageHeading eyebrow="Gestion des accès et règles" title="Administration" description="Gérez les membres, la règle de facturation et les modèles de génération autorisés."/><AdminCenter/><KeyframeApprovalSettings/></>}
