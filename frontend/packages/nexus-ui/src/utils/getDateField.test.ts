import { describe, expect, it } from 'vitest'

import { getDateField } from './getDateField'

describe('getDateField', () => {
  it('returns camelCase field when present', () => {
    const obj = { createdAt: '2025-01-01T00:00:00Z' }
    expect(getDateField(obj, 'createdAt')).toBe('2025-01-01T00:00:00Z')
  })

  it('returns snake_case field when camelCase is missing', () => {
    const obj = { created_at: '2025-01-01T00:00:00Z' }
    expect(getDateField(obj, 'createdAt')).toBe('2025-01-01T00:00:00Z')
  })

  it('prefers camelCase over snake_case when both present', () => {
    const obj = { createdAt: '2025-01-01', created_at: '2024-01-01' }
    expect(getDateField(obj, 'createdAt')).toBe('2025-01-01')
  })

  it('handles updatedAt field', () => {
    const obj = { updated_at: '2025-01-02T00:00:00Z' }
    expect(getDateField(obj, 'updatedAt')).toBe('2025-01-02T00:00:00Z')
  })

  it('returns null for null object', () => {
    expect(getDateField(null, 'createdAt')).toBeNull()
  })

  it('returns null for undefined object', () => {
    expect(getDateField(undefined, 'createdAt')).toBeNull()
  })

  it('returns null when field is missing', () => {
    const obj = { name: 'test' }
    expect(getDateField(obj, 'createdAt')).toBeNull()
  })

  it('returns null when field value is not a string', () => {
    const obj = { createdAt: 12345 }
    expect(getDateField(obj, 'createdAt')).toBeNull()
  })
})
