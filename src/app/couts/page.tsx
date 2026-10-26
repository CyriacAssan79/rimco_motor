import {PageHeading} from '@/components/shell';
import {CostDashboard} from './CostDashboard';
import { requirePageRole } from '@/core/auth/guards';
export default async function CostsPage(){await requirePageRole('admin'); return <><PageHeading eyebrow="Suivi de consommation" title="Suivi de consommation" description="Suivez les montants facturés, les coûts réels, les marges et l’historique des générations."/><CostDashboard/></>}
