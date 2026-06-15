import { z } from 'zod'

import { formatDurationLabel } from '../utils/timeUtils'

import { nodeSettingsSchema } from './shared/nodeSettingsSchema'

const DEFAULT_MAX_WAIT_SECONDS = 2_592_000 // 30 days

export function createWaitFormSchema(maxSeconds: number = DEFAULT_MAX_WAIT_SECONDS) {
  return z
    .object({
      name: z.string(),
      settings: nodeSettingsSchema.optional(),
      days: z
        .number()
        .int()
        .min(0, { message: 'Days cannot be negative' })
        .max(365, { message: 'Days cannot exceed 365' }),
      hours: z
        .number()
        .int()
        .min(0, { message: 'Hours cannot be negative' })
        .max(23, { message: 'Hours cannot exceed 23' }),
      minutes: z
        .number()
        .int()
        .min(0, { message: 'Minutes cannot be negative' })
        .max(59, { message: 'Minutes cannot exceed 59' }),
      seconds: z
        .number()
        .int()
        .min(0, { message: 'Seconds cannot be negative' })
        .max(59, { message: 'Seconds cannot exceed 59' }),
    })
    .refine((data) => data.days + data.hours + data.minutes + data.seconds > 0, {
      message: 'Total wait duration must be greater than zero',
      path: ['seconds'],
    })
    .refine(
      (data) => {
        const totalSeconds = data.days * 86400 + data.hours * 3600 + data.minutes * 60 + data.seconds
        return totalSeconds <= maxSeconds
      },
      {
        message: `Total wait duration cannot exceed the configured maximum (${formatDurationLabel(maxSeconds)})`,
        path: ['days'],
      }
    )
}

export type WaitFormData = z.infer<ReturnType<typeof createWaitFormSchema>>
