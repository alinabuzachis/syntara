import { z } from 'zod'

export const approvalDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  notes: z.string().max(2000),
})

export type ApprovalDecisionFormData = z.infer<typeof approvalDecisionSchema>
