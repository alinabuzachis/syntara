import { describe, expect, it } from 'vitest'

import { integrationFormSchema, STEP1_FIELDS } from './integrationFormSchema'

const validBase = {
  integration_type: 'mcp_server' as const,
  configuration: { integration_type: 'mcp_server' as const, base_url: 'https://example.com' },
  scope: 'global' as const,
}

describe('integrationFormSchema', () => {
  it('accepts valid form data', () => {
    const result = integrationFormSchema.safeParse({
      ...validBase,
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

  it('accepts minimal valid data (optional fields empty)', () => {
    const result = integrationFormSchema.safeParse({ ...validBase, name: 'Server' })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = integrationFormSchema.safeParse({ ...validBase, name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Server name / ID is required')).toBe(true)
    }
  })

  it('rejects empty base_url', () => {
    const result = integrationFormSchema.safeParse({
      ...validBase,
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
      ...validBase,
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
      ...validBase,
      name: 'Server',
      management_credential_id: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts project scope', () => {
    const result = integrationFormSchema.safeParse({
      ...validBase,
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
      ...validBase,
      name: 'Server',
      configuration: { integration_type: 'mcp_server' as const, base_url: 'ftp://example.com' },
    })
    expect(result.success).toBe(false)
  })

  describe('STEP1_FIELDS', () => {
    it('references valid schema paths that are required', () => {
      const result = integrationFormSchema.safeParse({
        ...validBase,
        name: '',
        configuration: { integration_type: 'mcp_server' as const, base_url: '' },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const errorPaths = result.error.issues.map((i) => i.path.join('.'))
        for (const field of STEP1_FIELDS) {
          expect(errorPaths).toContain(field)
        }
      }
    })
  })
})
