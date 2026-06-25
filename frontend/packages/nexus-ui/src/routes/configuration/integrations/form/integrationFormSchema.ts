import { IntegrationTypeEnum } from '@ansible/nexus-contracts'
import { z } from 'zod'

/**
 * Zod schema for the integration create form.
 * Single source of truth for shape and client-side validation; backend 422 errors
 * are still applied via useFormMutationErrorHandler.
 */
export const integrationFormSchema = z.object({
  name: z.string().min(1, 'Server name / ID is required'),
  description: z.string().optional().nullable(),
  integration_type: z.literal(IntegrationTypeEnum.MCP_SERVER),
  configuration: z.object({
    integration_type: z.literal(IntegrationTypeEnum.MCP_SERVER),
    base_url: z
      .string()
      .min(1, 'Base URL is required')
      .url('Base URL must be a valid URL')
      .refine((url) => /^https?:\/\//.test(url), 'Must be an HTTP or HTTPS URL'),
  }),
  management_credential_id: z.string().optional().nullable(),
  scope: z.enum(['global', 'project']),
})

export type IntegrationFormData = z.infer<typeof integrationFormSchema>

/** Fields validated on step 1 (Integration details) before advancing */
export const STEP1_FIELDS = ['name', 'configuration.base_url'] as const

export const INTEGRATION_TYPE_OPTIONS = [{ value: IntegrationTypeEnum.MCP_SERVER, label: 'MCP Server' }] as const
