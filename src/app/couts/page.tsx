import {PageHeading} from '@/components/shell';
import {CostDashboard} from './CostDashboard';
import { requireRole } from '@/core/auth/guards';
export default async function CostsPage(){await requireRole('admin'); return <><PageHeading eyebrow="Suivi de consommation" title="Suivi de consommation" description="Pilotez les montants, les plafonds et l’historique des générations."/><CostDashboard/></>}
