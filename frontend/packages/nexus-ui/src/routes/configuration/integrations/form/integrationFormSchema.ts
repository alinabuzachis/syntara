import { IntegrationTypeEnum, LLMProviderHintEnum } from '@ansible/nexus-contracts'
import { z } from 'zod'

import { PROVIDERS_REQUIRING_BASE_URL } from '../integrationFilters'

const sharedFields = {
  name: z.string().min(1, 'Server name / ID is required'),
  description: z.string().optional().nullable(),
  management_credential_id: z.string().optional().nullable(),
  scope: z.enum(['global', 'project']),
}

const mcpServerSchema = z.object({
  ...sharedFields,
  integration_type: z.literal(IntegrationTypeEnum.MCP_SERVER),
  configuration: z.object({
    integration_type: z.literal(IntegrationTypeEnum.MCP_SERVER),
    base_url: z
      .string()
      .min(1, 'Base URL is required')
      .url('Base URL must be a valid URL')
      .refine((url) => url.startsWith('http://') || url.startsWith('https://'), 'Must be an HTTP or HTTPS URL'),
  }),
})

const aapSchema = z.object({
  ...sharedFields,
  integration_type: z.literal(IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM),
  configuration: z.object({
    integration_type: z.literal(IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM),
    aap_url: z
      .string()
      .min(1, 'AAP URL is required')
      .url('Must be a valid URL')
      .refine((url) => url.startsWith('https://'), 'Must be an HTTPS URL'),
    insecure_skip_tls_verify: z.boolean(),
  }),
})

const llmProviderSchema = z.object({
  ...sharedFields,
  integration_type: z.literal(IntegrationTypeEnum.LLM_PROVIDER),
  configuration: z
    .object({
      integration_type: z.literal(IntegrationTypeEnum.LLM_PROVIDER),
      provider_hint: z.enum([LLMProviderHintEnum.RED_HAT_AI, LLMProviderHintEnum.OPENAI, LLMProviderHintEnum.CUSTOM]),
      base_url: z
        .string()
        .url('Must be a valid URL')
        .refine((url) => url.startsWith('http://') || url.startsWith('https://'), 'Must be an HTTP or HTTPS URL')
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
    }),
})

/**
 * Zod schema for the integration create form.
 * Discriminated union on integration_type — each type has its own configuration shape.
 * Backend 422 errors are still applied via useFormMutationErrorHandler.
 */
export const integrationFormSchema = z.discriminatedUnion('integration_type', [
  mcpServerSchema,
  aapSchema,
  llmProviderSchema,
])

export type IntegrationFormData = z.infer<typeof integrationFormSchema>

/** Fields validated on step 1 (Integration details) before advancing. Type-specific because each integration type has a different URL field. */
export function getStep1Fields(integrationType: string): string[] {
  const shared = ['name']
  switch (integrationType) {
    case IntegrationTypeEnum.MCP_SERVER:
      return [...shared, 'configuration.base_url']
    case IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM:
      return [...shared, 'configuration.aap_url']
    case IntegrationTypeEnum.LLM_PROVIDER:
      return [...shared, 'configuration.provider_hint', 'configuration.base_url']
    default:
      return shared
  }
}

export function getDefaultConfiguration(integrationType: string): IntegrationFormData['configuration'] {
  switch (integrationType) {
    case IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM:
      return { integration_type: 'ansible_automation_platform' as const, aap_url: '', insecure_skip_tls_verify: false }
    case IntegrationTypeEnum.LLM_PROVIDER:
      return {
        integration_type: 'llm_provider' as const,
        provider_hint: LLMProviderHintEnum.RED_HAT_AI,
        base_url: '',
      }
    default:
      return { integration_type: 'mcp_server' as const, base_url: '' }
  }
}

export const INTEGRATION_TYPE_OPTIONS = [
  { value: IntegrationTypeEnum.MCP_SERVER, label: 'MCP Server' },
  { value: IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM, label: 'Ansible Automation Platform' },
  { value: IntegrationTypeEnum.LLM_PROVIDER, label: 'LLM Provider' },
] as const

export const PROVIDER_HINT_OPTIONS = [
  { value: LLMProviderHintEnum.RED_HAT_AI, label: 'Red Hat AI' },
  { value: LLMProviderHintEnum.OPENAI, label: 'OpenAI' },
  { value: LLMProviderHintEnum.CUSTOM, label: 'Custom' },
] as const
