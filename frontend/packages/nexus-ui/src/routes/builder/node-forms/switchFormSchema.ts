import { z } from 'zod'

import type { Expression } from '../../../utils/expressions/types'

const switchCaseSchema = z.object({
  caseId: z.string(),
  label: z.string().optional(),
  condition: z.string().min(1, 'Condition is required'),
  expressionTree: z.custom<Expression>().optional(),
  editorMode: z.enum(['visual', 'raw']).optional(),
})

export const switchFormSchema = z.object({
  name: z.string(),
  cases: z.array(switchCaseSchema).min(1, 'At least one path is required'),
})

export type SwitchFormData = z.infer<typeof switchFormSchema>
export type SwitchCaseData = z.infer<typeof switchCaseSchema>
