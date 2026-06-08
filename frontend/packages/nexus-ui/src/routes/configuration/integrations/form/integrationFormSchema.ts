import { z } from 'zod'

/**
 * Zod schema for the integration (tool provider) create form.
 * Single source of truth for shape and client-side validation; backend 422 errors
 * are still applied via useFormMutationErrorHandler.
 */
export const integrationFormSchema = z.object({
  name: z.string().min(1, 'Server name is required'),
  description: z.string().optional().nullable(),
  configuration: z.object({
    provider_type: z.literal('mcp'),
    base_url: z.string().min(1, 'API URL is required').url('API URL must be a valid URL'),
    api_key: z.string().optional().nullable(),
  }),
})

export type IntegrationFormData = z.infer<typeof integrationFormSchema>
