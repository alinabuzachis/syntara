import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Wouter (existing contract) ────────────────────────────────────────────────
describe('navigate (wouter)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is a callable function', async () => {
    const { navigate } = await import('./navigate')
    expect(navigate).toBeTypeOf('function')
  })

  it('pushes to browser history', async () => {
    const { navigate } = await import('./navigate')
    const pushState = vi.spyOn(window.history, 'pushState')

    navigate('/workflows')

    expect(pushState).toHaveBeenCalledWith(null, '', '/workflows')
  })

  it('replaces history entry when replace option is set', async () => {
    const { navigate } = await import('./navigate')
    const replaceState = vi.spyOn(window.history, 'replaceState')

    navigate('/executions', { replace: true })

    expect(replaceState).toHaveBeenCalledWith(null, '', '/executions')
  })
})

// ── TanStack (contract: same callable signature, delegates to tanstackRouter) ──
describe('navigate (tanstack)', () => {
  const mockTsNavigate = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../app/routerFlag', () => ({ isTanStackRouter: () => true }))
    vi.doMock('../../app/tanstackRouter', () => ({ tanstackRouter: { navigate: mockTsNavigate } }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    mockTsNavigate.mockClear()
  })

  it('is a callable function', async () => {
    const { navigate } = await import('./navigate')
    expect(navigate).toBeTypeOf('function')
  })

  it('delegates to tanstackRouter.navigate with the given path', async () => {
    const { navigate } = await import('./navigate')
    navigate('/workflows')
    expect(mockTsNavigate).toHaveBeenCalledWith({ to: '/workflows', replace: undefined })
  })

  it('passes replace option to tanstackRouter.navigate', async () => {
    const { navigate } = await import('./navigate')
    navigate('/executions', { replace: true })
    expect(mockTsNavigate).toHaveBeenCalledWith({ to: '/executions', replace: true })
  })
})
