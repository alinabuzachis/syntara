import { z } from 'zod'

import { isUnaryOperator } from '../../../utils/expressions/defaults'
import type { ComparisonOperator } from '../../../utils/expressions/types'

const COMPARISON_OPERATORS: [ComparisonOperator, ...ComparisonOperator[]] = [
  '==',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'contains',
  'startsWith',
  'endsWith',
  'matches',
  'exists',
  'isEmpty',
  'lengthEqualTo',
  'lengthGreaterThan',
  'lengthLessThan',
]

const switchCaseSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  variable: z.string(),
  operator: z.enum(COMPARISON_OPERATORS),
  value: z.string(),
  negate: z.boolean().optional(),
})

export const switchFormSchema = z
  .object({
    name: z.string(),
    cases: z.array(switchCaseSchema).min(1, 'At least one path is required'),
  })
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.cases.length; i++) {
      const c = data.cases[i]
      if (!c.variable.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Field is required',
          path: ['cases', i, 'variable'],
        })
      }
      if (!isUnaryOperator(c.operator) && !c.value.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Value is required',
          path: ['cases', i, 'value'],
        })
      }
    }
  })

export type SwitchFormData = z.infer<typeof switchFormSchema>
export type SwitchCaseData = z.infer<typeof switchCaseSchema>
