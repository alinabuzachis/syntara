import { serializeExpression } from '../../../utils/expressions/serializer'
import type { ComparisonOperator } from '../../../utils/expressions/types'

export const SWITCH_CASE_PORT_PREFIX = 'case_'

export function buildSwitchCasePort(index: number): string {
  return `${SWITCH_CASE_PORT_PREFIX}${index}`
}

export function isSwitchCasePort(handle: string | undefined | null): boolean {
  return typeof handle === 'string' && handle.startsWith(SWITCH_CASE_PORT_PREFIX)
}

type SwitchCaseFormData = {
  id: string
  label?: string
  variable: string
  operator: ComparisonOperator
  value: string
  negate?: boolean
}

export function serializeSwitchCases(
  cases: SwitchCaseFormData[]
): Array<{ port: string; label: string; condition: string }> {
  return cases.map((c, i) => ({
    port: buildSwitchCasePort(i),
    label: c.label || `Path ${i + 1}`,
    condition: serializeExpression(
      {
        root: {
          type: 'condition' as const,
          id: c.id,
          variable: c.variable,
          operator: c.operator,
          value: c.value,
          negate: c.negate,
        },
      },
      { forBackend: true }
    ),
  }))
}
