import type { Activity } from '@ansible/nexus-contracts'

/** Options for creating a condition fixture with flexible nested activity types */
interface ConditionOverrides {
  id?: string
  name?: string
  condition?: string
  then?: unknown[]
  else?: unknown[]
}

/**
 * Creates a condition Activity fixture for testing.
 * Centralizes the biome-ignore suppression for the `then` property.
 */
export const makeCondition = (overrides: ConditionOverrides = {}): Activity =>
  ({
    type: 'condition',
    id: overrides.id ?? 'C1',
    name: overrides.name ?? 'Condition',
    condition: overrides.condition ?? 'x > 10',
    // biome-ignore lint/suspicious/noThenProperty: Activity schema uses `then` for condition branches
    then: overrides.then ?? [],
    else: overrides.else ?? [],
  }) as Activity
