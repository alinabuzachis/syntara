import { afterEach, describe, expect, it, vi } from 'vitest'

describe('APP_TITLE', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('falls back to "Syntara" when VITE_APP_TITLE is not set', async () => {
    vi.stubEnv('VITE_APP_TITLE', undefined as unknown as string)
    vi.resetModules()
    const mod = (await import('./appTitle')) as { APP_TITLE: string }
    expect(mod.APP_TITLE).toBe('Syntara')
  })

  it('uses the custom title when VITE_APP_TITLE is set', async () => {
    vi.stubEnv('VITE_APP_TITLE', 'Custom Title')
    vi.resetModules()
    const mod = (await import('./appTitle')) as { APP_TITLE: string }
    expect(mod.APP_TITLE).toBe('Custom Title')
  })
})
