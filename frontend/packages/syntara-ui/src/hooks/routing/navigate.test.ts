import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

import { navigate } from './navigate'

describe('navigate', () => {
  const mockTsNavigate = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../app/tanstackRouter', () => ({ tanstackRouter: { navigate: mockTsNavigate } }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    mockTsNavigate.mockClear()
  })

  it('is a callable function', () => {
    expect(navigate).toBeTypeOf('function')
  })

  it('delegates to tanstackRouter.navigate with the given path', async () => {
    const { navigate: nav } = await import('./navigate')
    nav('/workflows')
    expect(mockTsNavigate).toHaveBeenCalledWith({ to: '/workflows', replace: undefined })
  })

  it('passes replace option to tanstackRouter.navigate', async () => {
    const { navigate: nav } = await import('./navigate')
    nav('/executions', { replace: true })
    expect(mockTsNavigate).toHaveBeenCalledWith({ to: '/executions', replace: true })
  })
})
