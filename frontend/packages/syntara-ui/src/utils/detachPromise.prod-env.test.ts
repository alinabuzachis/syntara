import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Exercises `defaultDetachedRejectionHandler` when `import.meta.env.DEV` is false (requires a
 * fresh module after `vi.stubEnv` + `vi.resetModules`). Kept separate so the main unit tests
 * keep a stable static import.
 */
describe('detachPromise (stubbed production env)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('forwards rejection to globalThis.reportError when DEV is stubbed off', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('PROD', true)
    const reportError = vi.fn()
    globalThis.reportError = reportError as typeof globalThis.reportError

    const { detachPromise } = await import('./detachPromise')
    detachPromise(Promise.reject(new Error('prod-path')))
    await Promise.resolve()

    expect(reportError).toHaveBeenCalledOnce()
    expect((reportError.mock.calls[0][0] as Error).message).toBe('prod-path')
  })
})
