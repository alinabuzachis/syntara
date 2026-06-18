import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTanStackTestRouter } from '../../test/createTanStackTestRouter'
import { createTestRouter } from '../../test/createTestRouter'

// ── Wouter (existing contract) ────────────────────────────────────────────────
describe('useNavigate (wouter)', () => {
  it('programmatic navigation changes the current path', async () => {
    const { useLocation } = await import('./useLocation')
    const { useNavigate } = await import('./useNavigate')
    const wrapper = createTestRouter('/')
    const { result } = renderHook(() => ({ navigate: useNavigate(), location: useLocation() }), { wrapper })

    act(() => {
      result.current.navigate('/workflows')
    })

    expect(result.current.location).toBe('/workflows')
  })

  it('navigates with replace option without error and changes the current path', async () => {
    const { useLocation } = await import('./useLocation')
    const { useNavigate } = await import('./useNavigate')
    const wrapper = createTestRouter('/')
    const { result } = renderHook(() => ({ navigate: useNavigate(), location: useLocation() }), { wrapper })

    act(() => {
      result.current.navigate('/executions', { replace: true })
    })

    expect(result.current.location).toBe('/executions')
  })
})

// ── TanStack (same contract, different router) ────────────────────────────────
describe('useNavigate (tanstack)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../app/routerFlag', () => ({ isTanStackRouter: () => true }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('programmatic navigation changes the current path', async () => {
    const { useLocation } = await import('./useLocation')
    const { useNavigate } = await import('./useNavigate')
    const wrapper = await createTanStackTestRouter('/')
    const { result } = renderHook(() => ({ navigate: useNavigate(), location: useLocation() }), { wrapper })

    act(() => {
      result.current.navigate('/workflows')
    })

    await waitFor(() => {
      expect(result.current.location).toBe('/workflows')
    })
  })

  it('navigates with replace option without error and changes the current path', async () => {
    const { useLocation } = await import('./useLocation')
    const { useNavigate } = await import('./useNavigate')
    const wrapper = await createTanStackTestRouter('/')
    const { result } = renderHook(() => ({ navigate: useNavigate(), location: useLocation() }), { wrapper })

    act(() => {
      result.current.navigate('/executions', { replace: true })
    })

    await waitFor(() => {
      expect(result.current.location).toBe('/executions')
    })
  })
})
