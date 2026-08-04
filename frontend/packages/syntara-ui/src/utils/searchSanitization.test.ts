import { describe, expect, it } from 'vitest'

import { sanitizeSearchInput } from './searchSanitization'

describe('sanitizeSearchInput', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeSearchInput('')).toBe('')
  })

  it('preserves valid alphanumeric search', () => {
    expect(sanitizeSearchInput('test search 123')).toBe('test search 123')
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeSearchInput('  test  ')).toBe('test')
  })

  it('removes single quotes', () => {
    expect(sanitizeSearchInput("'; DROP TABLE--")).toBe('DROP TABLE--')
  })

  it('removes double quotes', () => {
    expect(sanitizeSearchInput('" OR 1=1--')).toBe('OR 1=1--')
  })

  it('removes semicolons', () => {
    expect(sanitizeSearchInput('test; DELETE FROM')).toBe('test DELETE FROM')
  })

  it('removes backticks', () => {
    expect(sanitizeSearchInput('test`command`')).toBe('testcommand')
  })

  it('removes backslashes', () => {
    expect(sanitizeSearchInput('test\\escape')).toBe('testescape')
  })

  it('removes control characters', () => {
    expect(sanitizeSearchInput('test\x00null\x01byte')).toBe('testnullbyte')
    expect(sanitizeSearchInput('test\nnewline')).toBe('testnewline')
    expect(sanitizeSearchInput('test\ttab')).toBe('testtab')
    expect(sanitizeSearchInput('test\rcarriage')).toBe('testcarriage')
  })

  it('enforces maximum length of 200 characters', () => {
    const longInput = 'a'.repeat(300)
    const result = sanitizeSearchInput(longInput)
    expect(result).toHaveLength(200)
    expect(result).toBe('a'.repeat(200))
  })

  it('allows special characters safe for search', () => {
    expect(sanitizeSearchInput('test-search_123.example')).toBe('test-search_123.example')
    expect(sanitizeSearchInput('user@example.com')).toBe('user@example.com')
    expect(sanitizeSearchInput('path/to/resource')).toBe('path/to/resource')
  })

  it('handles combined injection attempts', () => {
    expect(sanitizeSearchInput("admin' OR '1'='1")).toBe('admin OR 1=1')
    expect(sanitizeSearchInput('"; DELETE * FROM users; --')).toBe('DELETE * FROM users --')
  })

  it('handles LDAP injection patterns', () => {
    expect(sanitizeSearchInput('*)(uid=*))(|(uid=*')).toBe('*)(uid=*))(|(uid=*')
  })

  it('removes angle brackets to prevent XSS', () => {
    expect(sanitizeSearchInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script')
    expect(sanitizeSearchInput('test<img src=x onerror=alert(1)>')).toBe('testimg src=x onerror=alert(1)')
    expect(sanitizeSearchInput('valid<>test')).toBe('validtest')
  })

  it('preserves hyphens and underscores', () => {
    expect(sanitizeSearchInput('my-template_name')).toBe('my-template_name')
  })

  it('preserves spaces in multi-word search', () => {
    expect(sanitizeSearchInput('production web server')).toBe('production web server')
  })
})
