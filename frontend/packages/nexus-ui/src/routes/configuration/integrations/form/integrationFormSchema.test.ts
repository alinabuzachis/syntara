import { describe, expect, it } from 'vitest'

import { integrationFormSchema, LLM_STEP1_FIELDS, MCP_STEP1_FIELDS } from './integrationFormSchema'

const validMcpBase = {
  integration_type: 'mcp_server' as const,
  configuration: { integration_type: 'mcp_server' as const, base_url: 'https://example.com' },
  scope: 'global' as const,
}

const validLlmBase = {
  integration_type: 'llm_provider' as const,
  configuration: {
    integration_type: 'llm_provider' as const,
    provider_hint: 'red_hat_ai' as const,
    base_url: 'https://api.example.com',
  },
  scope: 'global' as const,
}

describe('integrationFormSchema', () => {
  it('accepts valid MCP form data', () => {
    const result = integrationFormSchema.safeParse({
      ...validMcpBase,
      name: 'My MCP Server',
      description: 'Optional description',
      management_credential_id: 'cred-123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('My MCP Server')
      expect(result.data.configuration.base_url).toBe('https://example.com')
      expect(result.data.management_credential_id).toBe('cred-123')
    }
  })

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

  it('accepts minimal valid data (optional fields empty)', () => {
    const result = integrationFormSchema.safeParse({ ...validMcpBase, name: 'Server' })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = integrationFormSchema.safeParse({ ...validMcpBase, name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Name is required')).toBe(true)
    }
  })

  it('rejects empty base_url for MCP server', () => {
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

  describe('LLM provider validation', () => {
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

    it('requires base_url for custom provider', () => {
      const result = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
        configuration: { integration_type: 'llm_provider' as const, provider_hint: 'custom' as const, base_url: '' },
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
  })

  describe('MCP_STEP1_FIELDS', () => {
    it('references valid schema paths that are required for MCP', () => {
      const result = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: '',
        configuration: { integration_type: 'mcp_server' as const, base_url: '' },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const errorPaths = result.error.issues.map((i) => i.path.join('.'))
        for (const field of MCP_STEP1_FIELDS) {
          expect(errorPaths).toContain(field)
        }
      }
    })
  })

  describe('LLM_STEP1_FIELDS', () => {
    it('contains the expected fields for LLM step 1 validation', () => {
      expect(LLM_STEP1_FIELDS).toContain('name')
      expect(LLM_STEP1_FIELDS).toContain('configuration.provider_hint')
      expect(LLM_STEP1_FIELDS).toContain('configuration.base_url')
    })
  })

  describe('discriminated union', () => {
    it('correctly distinguishes MCP vs LLM configuration branches', () => {
      const mcpResult = integrationFormSchema.safeParse({
        ...validMcpBase,
        name: 'Server',
      })
      const llmResult = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
      })
      expect(mcpResult.success).toBe(true)
      expect(llmResult.success).toBe(true)
      if (mcpResult.success) {
        expect(mcpResult.data.configuration.integration_type).toBe('mcp_server')
      }
      if (llmResult.success) {
        expect(llmResult.data.configuration.integration_type).toBe('llm_provider')
      }
    })

    it('rejects anthropic provider (not yet supported in create form)', () => {
      const result = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
        configuration: { integration_type: 'llm_provider' as const, provider_hint: 'anthropic' as const, base_url: '' },
      })
      expect(result.success).toBe(false)
    })

    it('rejects gemini provider (not yet supported in create form)', () => {
      const result = integrationFormSchema.safeParse({
        ...validLlmBase,
        name: 'Provider',
        configuration: { integration_type: 'llm_provider' as const, provider_hint: 'gemini' as const, base_url: '' },
      })
      expect(result.success).toBe(false)
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

    it('rejects missing name for both types', () => {
      const mcpResult = integrationFormSchema.safeParse({ ...validMcpBase, name: '' })
      const llmResult = integrationFormSchema.safeParse({ ...validLlmBase, name: '' })
      expect(mcpResult.success).toBe(false)
      expect(llmResult.success).toBe(false)
    })
  })
})
