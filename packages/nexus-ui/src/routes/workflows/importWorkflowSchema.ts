import { z } from 'zod'

export const importWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(255, 'Name must be 255 characters or fewer'),
  projectId: z.string().optional().or(z.literal('')),
})

export type ImportWorkflowFormData = z.infer<typeof importWorkflowSchema>
