import { z } from 'zod'

import { nodeSettingsSchema } from './shared/nodeSettingsSchema'

export const approvalFormSchema = z.object({
  name: z.string(),
  approvers: z.string().min(1, 'At least one approver is required'),
  prompt: z.string(),
  fallback_decision: z.enum(['approve', 'reject']).optional(),
  decision_window: z.number().int().positive().optional(),
  settings: nodeSettingsSchema.optional(),
})

export type ApprovalFormData = z.infer<typeof approvalFormSchema>
