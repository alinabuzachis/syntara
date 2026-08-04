import { z } from 'zod'

import { formatDurationLabel } from '../utils/timeUtils'

import { nodeSettingsSchema } from './shared/nodeSettingsSchema'

const DEFAULT_MAX_WAIT_SECONDS = 2_592_000 // 30 days

export function createWaitFormSchema(maxSeconds: number = DEFAULT_MAX_WAIT_SECONDS) {
  return z.object({
    name: z.string(),
    settings: nodeSettingsSchema.optional(),
    duration: z
      .number()
      .int()
      .min(1, { message: 'Total wait duration must be greater than zero' })
      .max(maxSeconds, {
        message: `Total wait duration cannot exceed the configured maximum (${formatDurationLabel(maxSeconds)})`,
      })
      .optional(),
  })
}

export type WaitFormData = z.infer<ReturnType<typeof createWaitFormSchema>>
