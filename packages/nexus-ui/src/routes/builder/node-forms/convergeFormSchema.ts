import { z } from 'zod'

import { optionalNumber } from './shared/formSchemaUtils'

const nonNegativeWholeNumber = optionalNumber
  .optional()
  .refine((value) => value === undefined || (Number.isInteger(value) && value >= 0), {
    message: 'Must be a whole number greater than or equal to 0',
  })

const positiveWholeNumber = optionalNumber
  .optional()
  .refine((value) => value === undefined || (Number.isInteger(value) && value >= 1), {
    message: 'Required path count must be a whole number greater than 0',
  })

/**
 * Zod schema for the Converge node form.
 * Conditional: strategy required; when strategy is 'any', requiredPathCount and remainingBehavior required;
 * when timeoutEnabled, onTimeout required.
 */
const convergeFormSchemaBase = z.object({
  name: z.string(),
  strategy: z.enum(['all', 'any']),
  timeoutEnabled: z.boolean().optional(),
  timeoutSeconds: nonNegativeWholeNumber,
  timeoutMinutes: nonNegativeWholeNumber,
  timeoutHours: nonNegativeWholeNumber,
  timeoutDays: nonNegativeWholeNumber,
  /** Output only: derived from unit fields in handleSubmit */
  timeout: z.number().optional(),
  onTimeout: z.enum(['continue', 'fail']).optional(),
  requiredPathCount: positiveWholeNumber,
  remainingBehavior: z.enum(['continue', 'cancel']).optional(),
})

export const convergeFormSchema = convergeFormSchemaBase.superRefine((data, ctx) => {
  if (!data.strategy || String(data.strategy).trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Continue when criteria is required',
      path: ['strategy'],
    })
  }
  if (data.strategy === 'any') {
    if (data.requiredPathCount == null || data.requiredPathCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Required path count is required',
        path: ['requiredPathCount'],
      })
    }
    if (!data.remainingBehavior) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Behavior of remaining paths is required',
        path: ['remainingBehavior'],
      })
    }
  }
  if (data.timeoutEnabled && !data.onTimeout) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Timeout action is required',
      path: ['onTimeout'],
    })
  }
})

export type ConvergeFormData = z.infer<typeof convergeFormSchemaBase>
export type ConvergeStrategy = ConvergeFormData['strategy']
export type RemainingBehavior = NonNullable<ConvergeFormData['remainingBehavior']>
