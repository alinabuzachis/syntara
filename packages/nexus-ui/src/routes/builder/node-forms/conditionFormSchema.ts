import { z } from 'zod'

import { conditionValidationRules } from './shared/conditionValidation'

/**
 * Zod schema for the Condition node form.
 * Condition field uses shared conditionValidationRules (expression format, parsing).
 * superRefine calls the validator once and uses its result for the error message.
 */
export const conditionFormSchema = z
  .object({
    name: z.string(),
    condition: z.string(),
  })
  .superRefine((data, ctx) => {
    const result = conditionValidationRules.validate(data.condition)
    if (result !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: typeof result === 'string' ? result : 'Condition is invalid',
        path: ['condition'],
      })
    }
  })

export type ConditionFormData = z.infer<typeof conditionFormSchema>
