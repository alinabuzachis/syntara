import { describe, it, expect } from 'vitest'

import { generateTemplateFromSchema, schemaToTemplateData, schemaToTemplateJson } from './jsonSchemaTemplate'

describe('generateTemplateFromSchema', () => {
  it('generates template with string properties', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ name: '' })
  })

  it('generates template with number properties', () => {
    const schema = { type: 'object', properties: { count: { type: 'number' } } }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ count: 0 })
  })

  it('generates template with integer properties', () => {
    const schema = { type: 'object', properties: { age: { type: 'integer' } } }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ age: 0 })
  })

  it('generates template with boolean properties', () => {
    const schema = { type: 'object', properties: { enabled: { type: 'boolean' } } }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ enabled: false })
  })

  it('generates template with array properties', () => {
    const schema = { type: 'object', properties: { tags: { type: 'array' } } }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ tags: [] })
  })

  it('generates template with array items', () => {
    const schema = {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } } },
    }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ tags: [{ name: '' }] })
  })

  it('generates template with nested object properties', () => {
    const schema = {
      type: 'object',
      properties: { meta: { type: 'object', properties: { key: { type: 'string' } } } },
    }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ meta: { key: '' } })
  })

  it('generates template with object without properties', () => {
    const schema = { type: 'object', properties: { data: { type: 'object' } } }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ data: {} })
  })

  it('uses schema-defined default values', () => {
    const schema = {
      type: 'object',
      properties: { host: { type: 'string', default: 'localhost' }, port: { type: 'number', default: 8080 } },
    }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ host: 'localhost', port: 8080 })
  })

  it('returns null for unknown property types', () => {
    const schema = { type: 'object', properties: { unknown: {} } }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ unknown: null })
  })

  it('generates template with multiple properties', () => {
    const schema = {
      type: 'object',
      properties: {
        host: { type: 'string' },
        severity: { type: 'string' },
        count: { type: 'number' },
        active: { type: 'boolean' },
      },
    }
    const result = JSON.parse(generateTemplateFromSchema(schema)) as Record<string, unknown>
    expect(result).toEqual({ host: '', severity: '', count: 0, active: false })
  })

  it('returns {} when schema type is not object', () => {
    expect(generateTemplateFromSchema({ type: 'array' })).toBe('{}')
  })

  it('returns {} when schema has no properties', () => {
    expect(generateTemplateFromSchema({ type: 'object' })).toBe('{}')
  })

  it('returns {} for empty schema', () => {
    expect(generateTemplateFromSchema({})).toBe('{}')
  })

  it('returns {} for null input', () => {
    expect(generateTemplateFromSchema(null as unknown as Record<string, unknown>)).toBe('{}')
  })

  it('returns {} for undefined input', () => {
    expect(generateTemplateFromSchema(undefined as unknown as Record<string, unknown>)).toBe('{}')
  })

  it('returns {} for array input', () => {
    expect(generateTemplateFromSchema([] as unknown as Record<string, unknown>)).toBe('{}')
  })

  it('returns {} when property iteration throws', () => {
    const badProperties = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('boom')
        },
      }
    )
    expect(generateTemplateFromSchema({ type: 'object', properties: badProperties })).toBe('{}')
  })

  it('returns formatted JSON string', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } }
    const result = generateTemplateFromSchema(schema)
    expect(result).toBe('{\n  "name": ""\n}')
  })
})

describe('schemaToTemplateData', () => {
  it('returns template object for JSON Schema', () => {
    const schema = { type: 'object', properties: { host: { type: 'string' } } }
    expect(schemaToTemplateData(schema)).toEqual({ host: '' })
  })

  it('falls back to raw data when schema is not a JSON Schema', () => {
    const rawData = { host: 'web-prod-04.example.com', severity: 'critical' }
    expect(schemaToTemplateData(rawData)).toEqual(rawData)
  })

  it('falls back to raw schema when type is not object', () => {
    const schema = { type: 'array', items: { type: 'string' } }
    expect(schemaToTemplateData(schema)).toEqual(schema)
  })

  it('returns empty object for schema with empty properties', () => {
    expect(schemaToTemplateData({ type: 'object', properties: {} })).toEqual({})
  })
})

describe('schemaToTemplateJson', () => {
  it('returns formatted JSON string for JSON Schema', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } }
    expect(schemaToTemplateJson(schema)).toBe('{\n  "name": ""\n}')
  })

  it('falls back to raw data when schema is not a JSON Schema', () => {
    const rawData = { host: 'web-prod-04.example.com', severity: 'critical' }
    expect(schemaToTemplateJson(rawData)).toBe(JSON.stringify(rawData, null, 2))
  })

  it('falls back to raw schema when type is not object', () => {
    const schema = { type: 'array', items: { type: 'string' } }
    expect(schemaToTemplateJson(schema)).toBe(JSON.stringify(schema, null, 2))
  })

  it('returns empty JSON object for schema with empty properties', () => {
    expect(schemaToTemplateJson({ type: 'object', properties: {} })).toBe('{}')
  })
})
