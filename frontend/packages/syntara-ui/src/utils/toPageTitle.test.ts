import { describe, expect, it } from 'vitest'

import { toPageTitle } from './toPageTitle'

const SUFFIX = 'Syntara'

describe('toPageTitle', () => {
  it('appends the app title as suffix in upstream builds', () => {
    expect(toPageTitle([])).toBe(SUFFIX)
  })

  it('appends the app suffix to a single segment', () => {
    expect(toPageTitle(['Workflows'])).toBe(`Workflows | ${SUFFIX}`)
  })

  it('joins multiple segments narrow > broad', () => {
    expect(toPageTitle(['admin', 'Users'])).toBe(`admin | Users | ${SUFFIX}`)
  })

  it('handles three segments narrow > broad', () => {
    expect(toPageTitle(['my-workflow', 'Workflows'])).toBe(`my-workflow | Workflows | ${SUFFIX}`)
  })

  it('returns just the app suffix when only undefined is passed', () => {
    expect(toPageTitle([undefined])).toBe(SUFFIX)
  })

  it('returns just the app suffix when only null is passed', () => {
    expect(toPageTitle([null])).toBe(SUFFIX)
  })

  it('returns just the app suffix when only an empty string is passed', () => {
    expect(toPageTitle([''])).toBe(SUFFIX)
  })

  it('returns just the app suffix when only a whitespace string is passed', () => {
    expect(toPageTitle(['   '])).toBe(SUFFIX)
  })

  it('returns just the app suffix when called with an empty array', () => {
    expect(toPageTitle([])).toBe(SUFFIX)
  })

  it('filters out falsy entries from a mixed array', () => {
    expect(toPageTitle(['Page', undefined, '', 'Section'])).toBe(`Page | Section | ${SUFFIX}`)
  })

  it('scrubs null and undefined from a narrow > broad array', () => {
    expect(toPageTitle([null, 'admin', undefined, 'Users'])).toBe(`admin | Users | ${SUFFIX}`)
  })

  it('trims whitespace from segments', () => {
    expect(toPageTitle(['  Workflows  '])).toBe(`Workflows | ${SUFFIX}`)
  })

  it('treats the literal string "null" as a valid segment', () => {
    expect(toPageTitle(['null'])).toBe(`null | ${SUFFIX}`)
  })

  it('treats the literal string "undefined" as a valid segment', () => {
    expect(toPageTitle(['undefined'])).toBe(`undefined | ${SUFFIX}`)
  })

  it('scrubs all-null array, leaving only the suffix', () => {
    expect(toPageTitle([null, undefined, ''])).toBe(SUFFIX)
  })

  it('preserves segment order (narrow first, broad last before suffix)', () => {
    const result = toPageTitle(['my-integration', 'Integrations'])
    expect(result).toBe(`my-integration | Integrations | ${SUFFIX}`)
    // Narrow segment must appear before broad segment
    expect(result.indexOf('my-integration')).toBeLessThan(result.indexOf('Integrations'))
  })
})
