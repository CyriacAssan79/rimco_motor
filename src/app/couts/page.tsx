import {PageHeading} from '@/components/shell';
import {CostDashboard} from './CostDashboard';
export default function CostsPage(){return <><PageHeading eyebrow="Suivi financier" title="Coûts & budget" description="Transparence sur les montants facturés, alertes de plafond et rapports téléchargeables."/><CostDashboard/></>}
