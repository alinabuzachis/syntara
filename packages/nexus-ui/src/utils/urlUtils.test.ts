import { describe, expect, it } from 'vitest'

import { trimTrailingSlashes } from './urlUtils'

describe('trimTrailingSlashes', () => {
  it('removes a single trailing slash', () => {
    expect(trimTrailingSlashes('https://example.com/')).toBe('https://example.com')
  })

  it('removes multiple trailing slashes', () => {
    expect(trimTrailingSlashes('https://example.com///')).toBe('https://example.com')
  })

  it('returns the same string when there are no trailing slashes', () => {
    expect(trimTrailingSlashes('https://example.com')).toBe('https://example.com')
  })

  it('returns an empty string for an empty input', () => {
    expect(trimTrailingSlashes('')).toBe('')
  })

  it('returns an empty string for a string of only slashes', () => {
    expect(trimTrailingSlashes('///')).toBe('')
  })

  it('preserves internal slashes', () => {
    expect(trimTrailingSlashes('https://example.com/path/to/resource/')).toBe('https://example.com/path/to/resource')
  })
})
