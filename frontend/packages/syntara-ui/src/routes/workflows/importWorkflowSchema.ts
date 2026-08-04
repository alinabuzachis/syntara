import { z } from 'zod'

export const importWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(255, 'Name must be 255 characters or fewer'),
})

export type ImportWorkflowFormData = z.infer<typeof importWorkflowSchema>
