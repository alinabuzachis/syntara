import { describe, expect, it } from 'vitest'

import { integrationFormSchema } from './integrationFormSchema'

describe('integrationFormSchema', () => {
  it('accepts valid form data', () => {
    const result = integrationFormSchema.safeParse({
      name: 'My MCP Server',
      description: 'Optional description',
      configuration: {
        provider_type: 'mcp',
        base_url: 'https://api.example.com',
        api_key: 'secret',
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('My MCP Server')
      expect(result.data.configuration.base_url).toBe('https://api.example.com')
    }
  })

  it('accepts minimal valid data (optional fields empty)', () => {
    const result = integrationFormSchema.safeParse({
      name: 'Server',
      configuration: {
        provider_type: 'mcp',
        base_url: 'https://localhost:8000',
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = integrationFormSchema.safeParse({
      name: '',
      configuration: { provider_type: 'mcp', base_url: 'https://example.com' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Server name is required')).toBe(true)
    }
  })

  it('rejects empty base_url', () => {
    const result = integrationFormSchema.safeParse({
      name: 'Server',
      configuration: { provider_type: 'mcp', base_url: '' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'API URL is required')).toBe(true)
    }
  })

  it('rejects invalid URL for base_url', () => {
    const result = integrationFormSchema.safeParse({
      name: 'Server',
      configuration: { provider_type: 'mcp', base_url: 'not-a-url' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'API URL must be a valid URL')).toBe(true)
    }
  })
})
