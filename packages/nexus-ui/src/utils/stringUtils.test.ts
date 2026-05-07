import { describe, expect, it } from 'vitest'

import { capitalize, formatSnakeCase } from './stringUtils'

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('returns empty string unchanged', () => {
    expect(capitalize('')).toBe('')
  })

  it('leaves already-capitalized word unchanged', () => {
    expect(capitalize('Hello')).toBe('Hello')
  })
})

describe('formatSnakeCase', () => {
  it('converts snake_case to Title Case', () => {
    expect(formatSnakeCase('security_event')).toBe('Security Event')
  })

  it('handles single word', () => {
    expect(formatSnakeCase('info')).toBe('Info')
  })

  it('handles multiple underscores', () => {
    expect(formatSnakeCase('aap_job_template')).toBe('Aap Job Template')
  })
})
