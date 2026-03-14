import { TriggerTypeEnum } from '@ansible/nexus-contracts'
import { z } from 'zod'

/**
 * Zod schema for the Trigger node form.
 * When triggerType is scheduled and scheduleType is interval, interval is required.
 */
const triggerFormSchemaBase = z.object({
  name: z.string().optional(),
  triggerType: z.string(),
  scheduleType: z.string().optional(),
  interval: z.string().optional(),
})

export const triggerFormSchema = triggerFormSchemaBase.superRefine((data, ctx) => {
  if (data.triggerType === TriggerTypeEnum.SCHEDULED && data.scheduleType === 'interval') {
    if (!data.interval?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start date is required',
        path: ['interval'],
      })
    }
  }
})

export type TriggerFormData = z.infer<typeof triggerFormSchemaBase>
