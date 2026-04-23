import { z } from 'zod'

/**
 * Zod schema for the AI Agent node form.
 * Single source of truth for shape and client-side validation.
 */
export const aiAgentFormSchema = z.object({
  name: z.string(),
  model: z.string(),
  prompt: z.string().min(1, 'Prompt is required'),
  tools: z.string(),
  credential_id: z.string().optional(),
})

export type AIAgentFormData = z.infer<typeof aiAgentFormSchema>
