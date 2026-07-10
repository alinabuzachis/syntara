import { IntegrationTypeEnum, LLMProviderHintEnum } from '@ansible/nexus-contracts'
import type { FieldPath } from 'react-hook-form'
import { z } from 'zod'

import { PROVIDERS_REQUIRING_BASE_URL } from '../integrationFilters'

const httpUrlValidator = z
  .string()
  .min(1, 'Base URL is required')
  .url('Base URL must be a valid URL')
  .refine((url) => /^https?:\/\//.test(url), 'Must be an HTTP or HTTPS URL')

const mcpServerConfigSchema = z.object({
  integration_type: z.literal(IntegrationTypeEnum.MCP_SERVER),
  base_url: httpUrlValidator,
})

const llmProviderConfigSchema = z
  .object({
    integration_type: z.literal(IntegrationTypeEnum.LLM_PROVIDER),
    provider_hint: z.enum([LLMProviderHintEnum.RED_HAT_AI, LLMProviderHintEnum.OPENAI, LLMProviderHintEnum.CUSTOM]),
    base_url: z
      .string()
      .url('Must be a valid URL')
      .refine((url) => /^https?:\/\//.test(url), 'Must be an HTTP or HTTPS URL')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (PROVIDERS_REQUIRING_BASE_URL.has(data.provider_hint) && (!data.base_url || data.base_url === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Base URL is required for this provider',
        path: ['base_url'],
      })
    }
  })

/**
 * Zod schema for the integration create form.
 * Single source of truth for shape and client-side validation; backend 422 errors
 * are still applied via useFormMutationErrorHandler.
 */
export const integrationFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
  integration_type: z.enum([IntegrationTypeEnum.MCP_SERVER, IntegrationTypeEnum.LLM_PROVIDER]),
  configuration: z.discriminatedUnion('integration_type', [mcpServerConfigSchema, llmProviderConfigSchema]),
  management_credential_id: z.string().optional().nullable(),
  scope: z.enum(['global', 'project']),
})

export type IntegrationFormData = z.infer<typeof integrationFormSchema>

/** Fields validated on step 1 before advancing — MCP Server */
export const MCP_STEP1_FIELDS: FieldPath<IntegrationFormData>[] = ['name', 'configuration.base_url']

/** Fields validated on step 1 before advancing — LLM Provider.
 * base_url is included so superRefine fires for providers that require it (Red Hat AI, Custom);
 * for providers where it's optional (OpenAI), trigger passes silently. */
export const LLM_STEP1_FIELDS: FieldPath<IntegrationFormData>[] = [
  'name',
  'configuration.provider_hint',
  'configuration.base_url',
]

export const INTEGRATION_TYPE_OPTIONS = [
  { value: IntegrationTypeEnum.MCP_SERVER, label: 'MCP Server' },
  { value: IntegrationTypeEnum.LLM_PROVIDER, label: 'LLM Provider' },
] as const

export const PROVIDER_HINT_OPTIONS = [
  { value: LLMProviderHintEnum.RED_HAT_AI, label: 'Red Hat AI' },
  { value: LLMProviderHintEnum.OPENAI, label: 'OpenAI' },
  { value: LLMProviderHintEnum.CUSTOM, label: 'Custom' },
] as const
