import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveAppMode } from './appMode'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveAppMode', () => {
  it('returns upstream when neither variable is set', () => {
    vi.stubEnv('VITE_APP_MODE', undefined as unknown as string)
    vi.stubEnv('VITE_DOC_MODE', undefined as unknown as string)
    expect(resolveAppMode()).toBe('upstream')
  })

  it('returns upstream when VITE_APP_MODE=upstream', () => {
    vi.stubEnv('VITE_APP_MODE', 'upstream')

    expect(resolveAppMode()).toBe('upstream')
  })

  it('returns product when VITE_APP_MODE=product', () => {
    vi.stubEnv('VITE_APP_MODE', 'product')

    expect(resolveAppMode()).toBe('product')
  })

  it('returns product via shim when VITE_DOC_MODE=product and VITE_APP_MODE is unset', () => {
    vi.stubEnv('VITE_APP_MODE', undefined as unknown as string)
    vi.stubEnv('VITE_DOC_MODE', 'product')

    expect(resolveAppMode()).toBe('product')
  })

  it('VITE_APP_MODE wins over VITE_DOC_MODE when both are set', () => {
    vi.stubEnv('VITE_APP_MODE', 'product')
    vi.stubEnv('VITE_DOC_MODE', 'upstream')

    expect(resolveAppMode()).toBe('product')
  })

  it('returns upstream for an invalid value', () => {
    vi.stubEnv('VITE_APP_MODE', 'invalid-value')

    expect(resolveAppMode()).toBe('upstream')
  })
})
