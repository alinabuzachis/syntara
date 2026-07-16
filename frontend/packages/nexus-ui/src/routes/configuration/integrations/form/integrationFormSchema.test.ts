import { IntegrationTypeEnum, LLMProviderHintEnum } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { integrationFormSchema, getStep1Fields, getDefaultConfiguration } from './integrationFormSchema'

const validMcpBase = {
  integration_type: 'mcp_server' as const,
  configuration: { integration_type: 'mcp_server' as const, base_url: 'https://example.com' },
  scope: 'global' as const,
}

const validAapBase = {
  integration_type: 'ansible_automation_platform' as const,
  configuration: {
    integration_type: 'ansible_automation_platform' as const,
    aap_url: 'https://aap.example.com',
    insecure_skip_tls_verify: false,
  },
  scope: 'global' as const,
}

const validLlmBase = {
  integration_type: 'llm_provider' as const,
  configuration: {
    integration_type: 'llm_provider' as const,
    provider_hint: 'red_hat_ai' as const,
    base_url: 'https://api.example.com',
  },
  management_credential_id: 'cred-llm-123',
  scope: 'global' as const,
}

describe('integrationFormSchema', () => {
  describe('MCP Server', () => {
    it('accepts valid form data', () => {
      const result = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: 'My MCP Server',
        description: 'Optional description',
        management_credential_id: 'cred-123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('My MCP Server')
        expect(result.data.configuration).toHaveProperty('base_url', 'https://example.com')
        expect(result.data.management_credential_id).toBe('cred-123')
      }
    })

    it('accepts minimal valid data (optional fields empty)', () => {
      const result = integrationFormSchema.safeParse({ ...validMcpBase, name: 'Server' })
      expect(result.success).toBe(true)
    })

    it('rejects empty name', () => {
      const result = integrationFormSchema.safeParse({ ...validMcpBase, name: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'Server name / ID is required')).toBe(true)
      }
    })

    it('rejects empty base_url', () => {
      const result = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: 'Server',
        configuration: { integration_type: 'mcp_server' as const, base_url: '' },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'Base URL is required')).toBe(true)
      }
    })

    it('rejects invalid URL for base_url', () => {
      const result = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: 'Server',
        configuration: { integration_type: 'mcp_server' as const, base_url: 'not-a-url' },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'Base URL must be a valid URL')).toBe(true)
      }
    })

    it('accepts null management_credential_id', () => {
      const result = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: 'Server',
        management_credential_id: null,
      })
      expect(result.success).toBe(true)
    })

    it('accepts project scope', () => {
      const result = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: 'Server',
        scope: 'project',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.scope).toBe('project')
      }
    })

    it('rejects non-HTTP URL schemes', () => {
      const result = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: 'Server',
        configuration: { integration_type: 'mcp_server' as const, base_url: 'ftp://example.com' },
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Ansible Automation Platform', () => {
    it('accepts valid Ansible Automation Platform data', () => {
      const result = integrationFormSchema.safeParse({
        ...validAapBase,
        name: 'My Ansible Automation Platform',
        description: 'Production AAP',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('My Ansible Automation Platform')
        expect(result.data.configuration).toHaveProperty('aap_url', 'https://aap.example.com')
        expect(result.data.configuration).toHaveProperty('insecure_skip_tls_verify', false)
      }
    })

    it('accepts Ansible Automation Platform with insecure_skip_tls_verify=true', () => {
      const result = integrationFormSchema.safeParse({
        ...validAapBase,
        name: 'Dev AAP',
        configuration: {
          integration_type: 'ansible_automation_platform' as const,
          aap_url: 'https://dev-aap.example.com',
          insecure_skip_tls_verify: true,
        },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.configuration).toHaveProperty('insecure_skip_tls_verify', true)
      }
    })

    it('requires insecure_skip_tls_verify to be explicitly set', () => {
      const result = integrationFormSchema.safeParse({
        ...validAapBase,
        name: 'AAP',
        configuration: {
          integration_type: 'ansible_automation_platform' as const,
          aap_url: 'https://aap.example.com',
        },
      })
      expect(result.success).toBe(false)
    })

    it('rejects Ansible Automation Platform without aap_url', () => {
      const result = integrationFormSchema.safeParse({
        ...validAapBase,
        name: 'AAP',
        configuration: { integration_type: 'ansible_automation_platform' as const, aap_url: '' },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'AAP URL is required')).toBe(true)
      }
    })

    it('rejects Ansible Automation Platform with non-HTTPS URL', () => {
      const result = integrationFormSchema.safeParse({
        ...validAapBase,
        name: 'AAP',
        configuration: {
          integration_type: 'ansible_automation_platform' as const,
          aap_url: 'http://aap.example.com',
          insecure_skip_tls_verify: false,
        },
      })
      expect(result.success).toBe(false)
    })

    it('rejects mismatched discriminator (ansible_automation_platform type with base_url)', () => {
      const result = integrationFormSchema.safeParse({
        name: 'AAP',
        integration_type: IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM,
        configuration: { integration_type: 'mcp_server', base_url: 'https://example.com' },
        scope: 'global',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('LLM provider validation', () => {
    it('accepts valid LLM provider form data', () => {
      const result = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'My LLM Provider',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('My LLM Provider')
        expect(result.data.integration_type).toBe('llm_provider')
      }
    })

    it('requires base_url for red_hat_ai provider', () => {
      const result = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
        configuration: {
          integration_type: 'llm_provider' as const,
          provider_hint: 'red_hat_ai' as const,
          base_url: '',
        },
      })
      expect(result.success).toBe(false)
    })

    it.each([
      ['custom (requires base_url)', 'custom' as const],
      ['anthropic (not yet supported in create form)', 'anthropic' as const],
      ['gemini (not yet supported in create form)', 'gemini' as const],
    ])('rejects %s provider with empty base_url', (_label, providerHint) => {
      const result = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
        configuration: { integration_type: 'llm_provider' as const, provider_hint: providerHint, base_url: '' },
      })
      expect(result.success).toBe(false)
    })

    it('allows empty base_url for openai provider', () => {
      const result = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
        configuration: { integration_type: 'llm_provider' as const, provider_hint: 'openai' as const, base_url: '' },
      })
      expect(result.success).toBe(true)
    })

    it('accepts valid openai provider with base_url', () => {
      const result = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
        configuration: {
          integration_type: 'llm_provider' as const,
          provider_hint: 'openai' as const,
          base_url: 'https://api.openai.com',
        },
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid base_url for LLM provider', () => {
      const result = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
        configuration: {
          integration_type: 'llm_provider' as const,
          provider_hint: 'red_hat_ai' as const,
          base_url: 'not-a-url',
        },
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing name for all types', () => {
      const mcpResult = integrationFormSchema.safeParse({ ...validMcpBase, name: '' })
      const llmResult = integrationFormSchema.safeParse({ ...validLlmBase, name: '' })
      const aapResult = integrationFormSchema.safeParse({ ...validAapBase, name: '' })
      expect(mcpResult.success).toBe(false)
      expect(llmResult.success).toBe(false)
      expect(aapResult.success).toBe(false)
    })
  })

  describe('getStep1Fields', () => {
    it('returns name and base_url for MCP Server', () => {
      const fields = getStep1Fields(IntegrationTypeEnum.MCP_SERVER)
      expect(fields).toContain('name')
      expect(fields).toContain('configuration.base_url')
      expect(fields).not.toContain('configuration.aap_url')
    })

    it('returns name and aap_url for Ansible Automation Platform', () => {
      const fields = getStep1Fields(IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM)
      expect(fields).toContain('name')
      expect(fields).toContain('configuration.aap_url')
      expect(fields).not.toContain('configuration.base_url')
    })

    it('returns name and provider fields for LLM Provider', () => {
      const fields = getStep1Fields(IntegrationTypeEnum.LLM_PROVIDER)
      expect(fields).toContain('name')
      expect(fields).toContain('configuration.provider_hint')
      expect(fields).toContain('configuration.base_url')
    })

    it('references valid schema paths that are required for MCP', () => {
      const result = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: '',
        configuration: { integration_type: 'mcp_server' as const, base_url: '' },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const errorPaths = result.error.issues.map((i) => i.path.join('.'))
        for (const field of getStep1Fields(IntegrationTypeEnum.MCP_SERVER)) {
          expect(errorPaths).toContain(field)
        }
      }
    })

    it('references valid schema paths that are required for Ansible Automation Platform', () => {
      const result = integrationFormSchema.safeParse({
        ...validAapBase,
        name: '',
        configuration: { integration_type: 'ansible_automation_platform' as const, aap_url: '' },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const errorPaths = result.error.issues.map((i) => i.path.join('.'))
        for (const field of getStep1Fields(IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM)) {
          expect(errorPaths).toContain(field)
        }
      }
    })

    it('returns only name for unknown integration type', () => {
      const fields = getStep1Fields('unknown_type')
      expect(fields).toEqual(['name'])
    })
  })

  describe('getDefaultConfiguration', () => {
    it.each([
      [
        IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM,
        { integration_type: 'ansible_automation_platform', aap_url: '', insecure_skip_tls_verify: false },
      ],
      [
        IntegrationTypeEnum.LLM_PROVIDER,
        { integration_type: 'llm_provider', provider_hint: LLMProviderHintEnum.RED_HAT_AI, base_url: '' },
      ],
      [IntegrationTypeEnum.MCP_SERVER, { integration_type: 'mcp_server', base_url: '' }],
    ])('returns correct defaults for %s', (integrationType, expected) => {
      expect(getDefaultConfiguration(integrationType)).toEqual(expected)
    })

    it('defaults to MCP server configuration for unknown type', () => {
      expect(getDefaultConfiguration('unknown_type')).toEqual({ integration_type: 'mcp_server', base_url: '' })
    })
  })

  describe('discriminated union', () => {
    it('correctly distinguishes MCP vs LLM vs AAP Gateway configuration branches', () => {
      const mcpResult = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: 'Server',
      })
      const llmResult = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
      })
      const aapResult = integrationFormSchema.safeParse({
        ...validAapBase,
        name: 'Gateway',
      })
      expect(mcpResult.success).toBe(true)
      expect(llmResult.success).toBe(true)
      expect(aapResult.success).toBe(true)
      if (mcpResult.success) {
        expect(mcpResult.data.configuration.integration_type).toBe('mcp_server')
      }
      if (llmResult.success) {
        expect(llmResult.data.configuration.integration_type).toBe('llm_provider')
      }
      if (aapResult.success) {
        expect(aapResult.data.configuration.integration_type).toBe('ansible_automation_platform')
      }
    })
  })
})
