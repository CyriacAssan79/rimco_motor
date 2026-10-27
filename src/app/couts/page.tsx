import {PageHeading} from '@/components/shell';
import {CostDashboard} from './CostDashboard';
import { requirePageRole } from '@/core/auth/guards';
export default async function CostsPage(){await requirePageRole('operateur'); return <><PageHeading eyebrow="Interne KÔMIAN" title="Coûts de production" description="Suivez les montants facturés, les coûts réels, les marges et l’historique des générations."/><CostDashboard/></>}
