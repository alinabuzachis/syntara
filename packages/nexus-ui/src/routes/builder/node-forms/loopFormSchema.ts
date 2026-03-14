import { z } from 'zod'

import { conditionValidationRules } from './shared/conditionValidation'
import { optionalNumber } from './shared/formSchemaUtils'

/**
 * Zod schema for the Loop node form.
 * Conditional: items required when type is forEach; condition required and validated when type is while.
 */
const loopFormSchemaBase = z.object({
  name: z.string(),
  type: z.enum(['forEach', 'while']),
  items: z.string().optional(),
  indexVariable: z.string().optional(),
  itemVariable: z.string().optional(),
  condition: z.string().optional(),
  maxIterations: optionalNumber.optional(),
  maxIterationsBehavior: z.enum(['continue', 'fail']).optional(),
})

export const loopFormSchema = loopFormSchemaBase.superRefine((data, ctx) => {
  if (data.type === 'forEach' && !data.items?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Items expression is required',
      path: ['items'],
    })
  }
  if (data.type === 'while') {
    if (!data.condition?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Conditional expression is required',
        path: ['condition'],
      })
    } else {
      const conditionResult = conditionValidationRules.validate(data.condition)
      if (conditionResult !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: typeof conditionResult === 'string' ? conditionResult : 'Invalid condition syntax',
          path: ['condition'],
        })
      }
    }
  }
  if (typeof data.maxIterations === 'number' && (!Number.isInteger(data.maxIterations) || data.maxIterations <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Max iterations must be a positive integer',
      path: ['maxIterations'],
    })
  }
})

export type LoopFormData = z.infer<typeof loopFormSchemaBase>
