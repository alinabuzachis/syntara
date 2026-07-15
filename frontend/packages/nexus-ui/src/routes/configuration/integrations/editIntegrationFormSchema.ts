import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { IntegrationTypeEnum } from '@ansible/nexus-contracts'
import { z } from 'zod'

function validateUrl(
  url: string | undefined,
  opts: { required: boolean; allowedSchemes?: RegExp; schemeLabel?: string; fieldLabel?: string }
): string | undefined {
  if (!url || url === '') {
    return opts.required ? `${opts.fieldLabel ?? 'URL'} is required` : undefined
  }
  try {
    const parsed = new URL(url)
    if (opts.allowedSchemes && !opts.allowedSchemes.test(parsed.protocol)) {
      return `Must be ${opts.schemeLabel ?? 'a valid'} URL`
    }
  } catch {
    return 'Must be a valid URL'
  }
  return undefined
}

export function buildEditSchema(requiresBaseUrl: boolean) {
  return z
    .object({
      name: z.string().min(1, 'Server name / ID is required'),
      description: z.string(),
      integration_type: z.string(),
      base_url: z.string().optional(),
      aap_url: z.string().optional(),
      insecure_skip_tls_verify: z.boolean().optional(),
      scope: z.enum(['global', 'project']),
      management_credential_id: z.string().nullable(),
    })
    .superRefine((data, ctx) => {
      if (data.integration_type === IntegrationTypeEnum.MCP_SERVER) {
        const err = validateUrl(data.base_url, {
          required: true,
          allowedSchemes: /^https?:$/,
          schemeLabel: 'an HTTP or HTTPS',
          fieldLabel: 'Base URL',
        })
        if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ['base_url'] })
      }
      if (data.integration_type === IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM) {
        const err = validateUrl(data.aap_url, {
          required: true,
          allowedSchemes: /^https:$/,
          schemeLabel: 'an HTTPS',
          fieldLabel: 'AAP URL',
        })
        if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ['aap_url'] })
      }
      if (data.integration_type === IntegrationTypeEnum.LLM_PROVIDER) {
        const err = validateUrl(data.base_url, {
          required: requiresBaseUrl,
          allowedSchemes: /^https?:$/,
          schemeLabel: 'an HTTP or HTTPS',
          fieldLabel: 'Base URL',
        })
        if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ['base_url'] })
      }
    })
}

export const editIntegrationSchema = buildEditSchema(true)

export type EditIntegrationFormValues = z.infer<typeof editIntegrationSchema>

export type DiscoverResult = IntegrationsAPI.components['schemas']['DiscoverResult']
export type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

export function buildConfiguration(integrationType: string, values: EditIntegrationFormValues, providerHint?: string) {
  if (integrationType === IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM) {
    return {
      integration_type: IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM,
      aap_url: values.aap_url ?? '',
      insecure_skip_tls_verify: values.insecure_skip_tls_verify ?? false,
    }
  }
  if (integrationType === IntegrationTypeEnum.LLM_PROVIDER && providerHint) {
    return {
      integration_type: IntegrationTypeEnum.LLM_PROVIDER,
      provider_hint: providerHint as IntegrationsAPI.components['schemas']['LLMProviderConfiguration']['provider_hint'],
      base_url: values.base_url || undefined,
    }
  }
  return { integration_type: 'mcp_server' as const, base_url: values.base_url ?? '' }
}
