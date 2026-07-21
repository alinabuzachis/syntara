import { describe, expect, it } from 'vitest'

import { buildEditSchema, buildConfiguration } from './editIntegrationFormSchema'

const schema = buildEditSchema(true)
const schemaOptionalBaseUrl = buildEditSchema(false)

const validMcp = {
  name: 'My MCP Server',
  description: '',
  integration_type: 'mcp_server',
  base_url: 'https://example.com',
  scope: 'global' as const,
  management_credential_id: null,
}

const validAap = {
  name: 'My AAP',
  description: '',
  integration_type: 'ansible_automation_platform',
  aap_url: 'https://aap.example.com',
  insecure_skip_tls_verify: false,
  scope: 'global' as const,
  management_credential_id: null,
}

const validLlm = {
  name: 'My LLM',
  description: '',
  integration_type: 'llm_provider',
  base_url: 'https://api.example.com',
  scope: 'global' as const,
  management_credential_id: null,
}

describe('buildEditSchema', () => {
  describe('MCP Server', () => {
    it('accepts valid MCP data', () => {
      const result = schema.safeParse(validMcp)
      expect(result.success).toBe(true)
    })

    it('rejects empty base_url', () => {
      const result = schema.safeParse({ ...validMcp, base_url: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'Base URL is required')).toBe(true)
      }
    })

    it('rejects missing base_url', () => {
      const { name, description, integration_type, scope, management_credential_id } = validMcp
      const result = schema.safeParse({ name, description, integration_type, scope, management_credential_id })
      expect(result.success).toBe(false)
    })

    it('rejects invalid URL', () => {
      const result = schema.safeParse({ ...validMcp, base_url: 'not-a-url' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'Must be a valid URL')).toBe(true)
      }
    })

    it.each([
      ['HTTP URL', 'http://localhost:8765/mcp'],
      ['URL with port', 'https://mcp.example.com:9443'],
      ['URL with path', 'https://example.com/mcp/v1'],
      ['URL with trailing slash', 'https://example.com/'],
    ])('accepts %s', (_label, url) => {
      const result = schema.safeParse({ ...validMcp, base_url: url })
      expect(result.success).toBe(true)
    })

    it('rejects FTP scheme', () => {
      const result = schema.safeParse({ ...validMcp, base_url: 'ftp://example.com' })
      expect(result.success).toBe(false)
    })
  })

  describe('Ansible Automation Platform', () => {
    it('accepts valid AAP data', () => {
      const result = schema.safeParse(validAap)
      expect(result.success).toBe(true)
    })

    it.each([
      ['empty aap_url', '', 'AAP URL is required'],
      ['HTTP URL (HTTPS only)', 'http://aap.example.com', 'Must be an HTTPS URL'],
      ['invalid URL', 'not-a-url', 'Must be a valid URL'],
    ])('rejects %s', (_label, url, expectedMessage) => {
      const result = schema.safeParse({ ...validAap, aap_url: url })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === expectedMessage)).toBe(true)
      }
    })

    it('accepts HTTPS URL with port', () => {
      const result = schema.safeParse({ ...validAap, aap_url: 'https://aap.example.com:8443' })
      expect(result.success).toBe(true)
    })

    it('rejects FTP scheme', () => {
      const result = schema.safeParse({ ...validAap, aap_url: 'ftp://aap.example.com' })
      expect(result.success).toBe(false)
    })
  })

  describe('LLM Provider', () => {
    it('accepts valid LLM data', () => {
      const result = schema.safeParse(validLlm)
      expect(result.success).toBe(true)
    })

    it('rejects empty base_url when requiresBaseUrl is true', () => {
      const result = schema.safeParse({ ...validLlm, base_url: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'Base URL is required')).toBe(true)
      }
    })

    it('allows empty base_url when requiresBaseUrl is false', () => {
      const result = schemaOptionalBaseUrl.safeParse({ ...validLlm, base_url: '' })
      expect(result.success).toBe(true)
    })

    it('allows missing base_url when requiresBaseUrl is false', () => {
      const { name, description, integration_type, scope, management_credential_id } = validLlm
      const result = schemaOptionalBaseUrl.safeParse({
        name,
        description,
        integration_type,
        scope,
        management_credential_id,
      })
      expect(result.success).toBe(true)
    })

    it('accepts HTTP URL', () => {
      const result = schema.safeParse({ ...validLlm, base_url: 'http://localhost:11434' })
      expect(result.success).toBe(true)
    })

    it('accepts HTTPS URL', () => {
      const result = schema.safeParse({ ...validLlm, base_url: 'https://api.openai.com/v1' })
      expect(result.success).toBe(true)
    })

    it('rejects FTP scheme', () => {
      const result = schema.safeParse({ ...validLlm, base_url: 'ftp://api.example.com' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'Must be an HTTP or HTTPS URL')).toBe(true)
      }
    })

    it('rejects invalid URL when provided', () => {
      const result = schema.safeParse({ ...validLlm, base_url: 'not-a-url' })
      expect(result.success).toBe(false)
    })

    it('validates non-empty base_url even when not required', () => {
      const result = schemaOptionalBaseUrl.safeParse({ ...validLlm, base_url: 'not-a-url' })
      expect(result.success).toBe(false)
    })
  })

  describe('shared fields', () => {
    it('rejects empty name', () => {
      const result = schema.safeParse({ ...validMcp, name: '' })
      expect(result.success).toBe(false)
    })

    it('accepts project scope with project_ids', () => {
      const result = schema.safeParse({ ...validMcp, scope: 'project', project_ids: ['p-001'] })
      expect(result.success).toBe(true)
    })

    it('rejects project scope with empty project_ids', () => {
      const result = schema.safeParse({ ...validMcp, scope: 'project', project_ids: [] })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'At least one project must be selected')).toBe(true)
      }
    })

    it('does not require project_ids when scope is global', () => {
      const result = schema.safeParse({ ...validMcp, scope: 'global' })
      expect(result.success).toBe(true)
    })

    it('rejects invalid scope', () => {
      const result = schema.safeParse({ ...validMcp, scope: 'invalid' })
      expect(result.success).toBe(false)
    })
  })
})

describe('buildConfiguration', () => {
  const baseValues = {
    name: 'Test',
    description: '',
    integration_type: 'mcp_server',
    base_url: 'https://example.com',
    scope: 'global' as const,
    project_ids: [] as string[],
    management_credential_id: null,
  }

  describe('MCP Server', () => {
    it('returns MCP configuration with base_url', () => {
      const config = buildConfiguration('mcp_server', baseValues)
      expect(config).toEqual({
        integration_type: 'mcp_server',
        base_url: 'https://example.com',
      })
    })

    it('falls back to empty string when base_url is undefined', () => {
      const { name, description, integration_type, scope, management_credential_id } = baseValues
      const withoutUrl = { name, description, integration_type, scope, management_credential_id }
      const config = buildConfiguration('mcp_server', withoutUrl as typeof baseValues)
      expect(config.base_url).toBe('')
    })
  })

  describe('Ansible Automation Platform', () => {
    it('returns AAP configuration with aap_url and insecure_skip_tls_verify', () => {
      const aapValues = {
        ...baseValues,
        integration_type: 'ansible_automation_platform',
        aap_url: 'https://aap.example.com',
        insecure_skip_tls_verify: false,
      }
      const config = buildConfiguration('ansible_automation_platform', aapValues)
      expect(config).toEqual({
        integration_type: 'ansible_automation_platform',
        aap_url: 'https://aap.example.com',
        insecure_skip_tls_verify: false,
      })
    })

    it('defaults insecure_skip_tls_verify to false when undefined', () => {
      const config = buildConfiguration('ansible_automation_platform', baseValues)
      expect(config).toHaveProperty('insecure_skip_tls_verify', false)
    })

    it('preserves insecure_skip_tls_verify=true', () => {
      const aapValues = { ...baseValues, aap_url: 'https://aap.example.com', insecure_skip_tls_verify: true }
      const config = buildConfiguration('ansible_automation_platform', aapValues)
      expect(config).toHaveProperty('insecure_skip_tls_verify', true)
    })
  })

  describe('LLM Provider', () => {
    it('returns LLM configuration with provider_hint and base_url', () => {
      const llmValues = { ...baseValues, integration_type: 'llm_provider', base_url: 'https://api.example.com' }
      const config = buildConfiguration('llm_provider', llmValues, 'red_hat_ai')
      expect(config).toEqual({
        integration_type: 'llm_provider',
        provider_hint: 'red_hat_ai',
        base_url: 'https://api.example.com',
      })
    })

    it('sets base_url to undefined when empty', () => {
      const llmValues = { ...baseValues, integration_type: 'llm_provider', base_url: '' }
      const config = buildConfiguration('llm_provider', llmValues, 'openai')
      expect(config).toHaveProperty('base_url', undefined)
    })

    it('falls back to MCP config when providerHint is undefined', () => {
      const config = buildConfiguration('llm_provider', baseValues)
      expect(config).toEqual({
        integration_type: 'mcp_server',
        base_url: 'https://example.com',
      })
    })
  })

  describe('unknown type', () => {
    it('falls back to MCP configuration', () => {
      const config = buildConfiguration('unknown_type', baseValues)
      expect(config).toEqual({
        integration_type: 'mcp_server',
        base_url: 'https://example.com',
      })
    })
  })
})
