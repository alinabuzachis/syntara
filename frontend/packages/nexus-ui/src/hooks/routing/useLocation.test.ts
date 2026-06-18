import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTanStackTestRouter } from '../../test/createTanStackTestRouter'
import { createTestRouter } from '../../test/createTestRouter'

// ── Wouter (existing contract) ────────────────────────────────────────────────
describe('useLocation (wouter)', () => {
  it('returns the current pathname as a string', async () => {
    const { useLocation } = await import('./useLocation')
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useLocation(), { wrapper })
    expect(result.current).toBe('/workflows')
  })
})

// ── TanStack (same contract, different router) ────────────────────────────────
describe('useLocation (tanstack)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../app/routerFlag', () => ({ isTanStackRouter: () => true }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the current pathname as a string', async () => {
    const { useLocation } = await import('./useLocation')
    const wrapper = await createTanStackTestRouter('/workflows')
    const { result } = renderHook(() => useLocation(), { wrapper })
    await waitFor(() => expect(result.current).toBe('/workflows'))
  })
})
