import { z } from 'zod'

import { optionalNumber } from './shared/formSchemaUtils'

/**
 * Zod schema for the Approval node form (internal form shape: approvers as string, timeout as units).
 * Single source of truth for shape and client-side validation.
 */
export const approvalFormSchema = z.object({
  name: z.string(),
  approvers: z.string().min(1, 'At least one approver is required'),
  prompt: z.string(),
  timeoutSeconds: optionalNumber.optional(),
  timeoutMinutes: optionalNumber.optional(),
  timeoutHours: optionalNumber.optional(),
  timeoutDays: optionalNumber.optional(),
  onTimeout: z.string(),
})

export type ApprovalFormData = z.infer<typeof approvalFormSchema>
