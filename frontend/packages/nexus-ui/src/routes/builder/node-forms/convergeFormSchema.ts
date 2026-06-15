import { z } from 'zod'

import { optionalNumber } from './shared/formSchemaUtils'
import { nodeSettingsSchema } from './shared/nodeSettingsSchema'

const positiveWholeNumber = optionalNumber
  .optional()
  .refine((value) => value === undefined || (Number.isInteger(value) && value >= 1), {
    message: 'Required path count must be a whole number greater than 0',
  })

/**
 * Zod schema for the Converge node form.
 * continue_on_failure lives in node settings (Settings tab).
 * wait_duration is a config field shown on the Parameters tab.
 */
const convergeFormSchemaBase = z.object({
  name: z.string(),
  strategy: z.enum(['all', 'any']),
  requiredPathCount: positiveWholeNumber,
  wait_duration: z.number().int().positive().optional(),
  settings: nodeSettingsSchema.optional(),
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
  }
})

export type ConvergeFormData = z.infer<typeof convergeFormSchemaBase>
export type ConvergeStrategy = ConvergeFormData['strategy']
