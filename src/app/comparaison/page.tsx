import { PageHeading } from '@/components/shell';
import { env } from '@/env';
import { ComparisonWorkspace } from './ComparisonWorkspace';

export default function ComparisonPage() {
  return <>
    <PageHeading eyebrow="Espace administrateur" title="Comparaison de modèles" description="Lancez le même brief et la même photo sur deux ou trois moteurs compatibles." />
    <ComparisonWorkspace mode={env.PROVIDERS_MODE} usdToEurRate={env.USD_TO_EUR_RATE} budgetCapEur={env.BUDGET_CAP_EUR} llmMaxCostUsd={env.LLM_MAX_COST_USD ?? 0} />
  </>;
}
