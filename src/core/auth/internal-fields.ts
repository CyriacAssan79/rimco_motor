import { isOperator, type RoleSubject } from './roles';

/**
 * Fields only a KÔMIAN operator may receive (27/10): provider costs in dollars, internal cost estimates and the
 * generated prompts (the locked layer). The filter runs in the route, never in a component.
 */
const INTERNAL_KEYS = ['prompt', 'storyboardCostUsd', 'storyboardCostFcfa', 'costUsd', 'usd', 'costPlanUsd'] as const;

export function withoutInternalFields<T extends Record<string, unknown>>(actor: RoleSubject, payload: T): T {
  if (isOperator(actor)) return payload;
  const copy: Record<string, unknown> = { ...payload };
  for (const key of INTERNAL_KEYS) delete copy[key];
  return copy as T;
}
