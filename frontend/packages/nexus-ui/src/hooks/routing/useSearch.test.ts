import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTanStackTestRouter } from '../../test/createTanStackTestRouter'
import { createTestRouter } from '../../test/createTestRouter'

// ── Wouter (existing contract) ────────────────────────────────────────────────
describe('useSearch (wouter)', () => {
  it('returns the search string when query params are present', async () => {
    const { useSearch } = await import('./useSearch')
    const wrapper = createTestRouter('/workflows?status=running&page=2')
    const { result } = renderHook(() => useSearch(), { wrapper })
    expect(result.current).toContain('status=running')
    expect(result.current).toContain('page=2')
  })

  it('returns an empty string when no query params are present', async () => {
    const { useSearch } = await import('./useSearch')
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useSearch(), { wrapper })
    expect(result.current).toBe('')
  })
})

// ── TanStack (same contract, different router) ────────────────────────────────
describe('useSearch (tanstack)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../app/routerFlag', () => ({ isTanStackRouter: () => true }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the search string when query params are present', async () => {
    const { useSearch } = await import('./useSearch')
    const wrapper = await createTanStackTestRouter('/workflows?status=running&page=2')
    const { result } = renderHook(() => useSearch(), { wrapper })
    await waitFor(() => expect(result.current).toContain('status=running'))
    expect(result.current).toContain('page=2')
  })

  it('returns an empty string when no query params are present', async () => {
    const { useSearch } = await import('./useSearch')
    const wrapper = await createTanStackTestRouter('/workflows')
    const { result } = renderHook(() => useSearch(), { wrapper })
    await waitFor(() => expect(result.current).toBe(''))
  })

  it('strips a lone trailing question mark when query string is empty', async () => {
    const { useSearch } = await import('./useSearch')
    // TanStack emits '?' as searchStr when the URL ends with '?'; strip it.
    const wrapper = await createTanStackTestRouter('/workflows?')
    const { result } = renderHook(() => useSearch(), { wrapper })
    await waitFor(() => expect(result.current).toBe(''))
  })
})
