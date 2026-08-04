import type { Activity } from '@syntara/contracts'

/** Options for creating a condition fixture with flexible config */
type ConditionOverrides = {
  id?: string
  name?: string
  condition?: string
}

/**
 * Creates a v2 condition Activity fixture for testing.
 * V2: condition expression is in parameters.condition, no then/else arrays.
 */
export const makeCondition = (overrides: ConditionOverrides = {}): Activity => ({
  type: 'condition',
  id: overrides.id ?? 'C1',
  name: overrides.name ?? 'Condition',
  parameters: {
    condition: overrides.condition ?? 'x > 10',
  },
})
