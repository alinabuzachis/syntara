import { describe, expect, it } from 'vitest'

import { parseJsonSchema, safeJSONReviver } from './jsonSafeParse'

describe('safeJSONReviver', () => {
  it('returns value for normal keys', () => {
    expect(safeJSONReviver('name', 'test')).toBe('test')
    expect(safeJSONReviver('type', 'object')).toBe('object')
  })

  it('strips __proto__ key', () => {
    expect(safeJSONReviver('__proto__', { polluted: true })).toBeUndefined()
  })

  it('strips constructor key', () => {
    expect(safeJSONReviver('constructor', { polluted: true })).toBeUndefined()
  })

  it('strips prototype key', () => {
    expect(safeJSONReviver('prototype', { polluted: true })).toBeUndefined()
  })
})

describe('parseJsonSchema', () => {
  it('parses valid JSON into an object', () => {
    const result = parseJsonSchema('{"type": "object", "properties": {}}')
    expect(result).toEqual({ type: 'object', properties: {} })
  })

  it('returns undefined for empty string', () => {
    expect(parseJsonSchema('')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(parseJsonSchema(undefined)).toBeUndefined()
  })

  it('returns undefined for whitespace-only string', () => {
    expect(parseJsonSchema('   ')).toBeUndefined()
  })

  it('returns undefined for invalid JSON', () => {
    expect(parseJsonSchema('{invalid}')).toBeUndefined()
  })

  it('returns undefined for a JSON string value', () => {
    expect(parseJsonSchema('"hello"')).toBeUndefined()
  })

  it('returns undefined for a JSON number value', () => {
    expect(parseJsonSchema('42')).toBeUndefined()
  })

  it('returns undefined for a JSON array value', () => {
    expect(parseJsonSchema('[1, 2, 3]')).toBeUndefined()
  })

  it('returns undefined for input exceeding 100KB', () => {
    const oversized = `{"data": "${'x'.repeat(100_001)}"}"`
    expect(parseJsonSchema(oversized)).toBeUndefined()
  })

  it('strips prototype pollution keys during parsing', () => {
    const malicious = '{"__proto__": {"polluted": true}, "safe": "value"}'
    const result = parseJsonSchema(malicious)
    expect(result).toBeDefined()
    expect(result?.safe).toBe('value')
    expect(result?.__proto__).not.toHaveProperty('polluted')
  })
})
