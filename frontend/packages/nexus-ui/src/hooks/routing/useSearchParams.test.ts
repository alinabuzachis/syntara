import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTanStackTestRouter } from '../../test/createTanStackTestRouter'
import { createTestRouter } from '../../test/createTestRouter'

// ── Wouter (existing contract) ────────────────────────────────────────────────
describe('useSearchParams (wouter)', () => {
  it('reads search params from the URL', async () => {
    const { useSearchParams } = await import('./useSearchParams')
    const wrapper = createTestRouter('/workflows?status=running')
    const { result } = renderHook(() => useSearchParams(), { wrapper })
    expect(result.current[0].get('status')).toBe('running')
  })

  it('updates the URL when setSearchParams is called', async () => {
    const { useSearchParams } = await import('./useSearchParams')
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useSearchParams(), { wrapper })

    act(() => {
      result.current[1](new URLSearchParams({ status: 'running' }))
    })

    expect(result.current[0].get('status')).toBe('running')
  })

  it('returns an empty URLSearchParams when no query string is present', async () => {
    const { useSearchParams } = await import('./useSearchParams')
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useSearchParams(), { wrapper })
    expect(result.current[0].toString()).toBe('')
  })
})

// ── TanStack (same contract, different router) ────────────────────────────────
describe('useSearchParams (tanstack)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../app/routerFlag', () => ({ isTanStackRouter: () => true }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads search params from the URL', async () => {
    const { useSearchParams } = await import('./useSearchParams')
    const wrapper = await createTanStackTestRouter('/workflows?status=running')
    const { result } = renderHook(() => useSearchParams(), { wrapper })
    await waitFor(() => expect(result.current[0].get('status')).toBe('running'))
  })

  it('updates the URL when setSearchParams is called', async () => {
    const { useSearchParams } = await import('./useSearchParams')
    const wrapper = await createTanStackTestRouter('/workflows')
    const { result } = renderHook(() => useSearchParams(), { wrapper })

    act(() => {
      result.current[1](new URLSearchParams({ status: 'running' }))
    })

    await waitFor(() => {
      expect(result.current[0].get('status')).toBe('running')
    })
  })

  it('returns an empty URLSearchParams when no query string is present', async () => {
    const { useSearchParams } = await import('./useSearchParams')
    const wrapper = await createTanStackTestRouter('/workflows')
    const { result } = renderHook(() => useSearchParams(), { wrapper })
    await waitFor(() => expect(result.current[0].toString()).toBe(''))
  })

  it('omits the query string delimiter when setSearchParams is called with empty params', async () => {
    const { useSearchParams } = await import('./useSearchParams')
    const wrapper = await createTanStackTestRouter('/workflows?status=running')
    const { result } = renderHook(() => useSearchParams(), { wrapper })

    await waitFor(() => expect(result.current[0].get('status')).toBe('running'))

    act(() => {
      result.current[1](new URLSearchParams())
    })

    await waitFor(() => expect(result.current[0].toString()).toBe(''))
  })
})
