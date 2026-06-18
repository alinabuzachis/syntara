import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// routerFlag reads localStorage once at module scope, so we must reset modules
// between tests and use dynamic imports to get a fresh evaluation each time.
describe('routerFlag', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('returns false (wouter) when no flag is set', async () => {
    const { isTanStackRouter } = await import('./routerFlag')
    expect(isTanStackRouter()).toBe(false)
  })

  it('returns false (wouter) when flag is set to "wouter"', async () => {
    localStorage.setItem('nexus-ui-router', 'wouter')
    const { isTanStackRouter } = await import('./routerFlag')
    expect(isTanStackRouter()).toBe(false)
  })

  it('returns true (tanstack) when flag is set to "tanstack"', async () => {
    localStorage.setItem('nexus-ui-router', 'tanstack')
    const { isTanStackRouter } = await import('./routerFlag')
    expect(isTanStackRouter()).toBe(true)
  })

  it('returns false (wouter) for an unrecognised flag value', async () => {
    localStorage.setItem('nexus-ui-router', 'banana')
    const { isTanStackRouter } = await import('./routerFlag')
    expect(isTanStackRouter()).toBe(false)
  })
})
