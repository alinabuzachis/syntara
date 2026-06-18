import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTanStackTestRouter } from '../../test/createTanStackTestRouter'
import { createTestRouter } from '../../test/createTestRouter'

// ── Wouter (existing contract) ────────────────────────────────────────────────
describe('useParams (wouter)', () => {
  it('extracts a single typed param from the matching route', async () => {
    const { useParams } = await import('./useParams')
    const wrapper = createTestRouter('/workflows/abc-123', '/workflows/:workflowId')
    const { result } = renderHook(() => useParams<{ workflowId: string }>(), { wrapper })
    expect(result.current.workflowId).toBe('abc-123')
  })

  it('extracts multiple typed params from the matching route', async () => {
    const { useParams } = await import('./useParams')
    const wrapper = createTestRouter('/users/42/groups/7', '/users/:userId/groups/:groupId')
    const { result } = renderHook(() => useParams<{ userId: string; groupId: string }>(), { wrapper })
    expect(result.current.userId).toBe('42')
    expect(result.current.groupId).toBe('7')
  })
})

// ── TanStack (same contract, different router) ────────────────────────────────
describe('useParams (tanstack)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../app/routerFlag', () => ({ isTanStackRouter: () => true }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts a single typed param from the matching route', async () => {
    const { useParams } = await import('./useParams')
    const wrapper = await createTanStackTestRouter('/workflows/abc-123', '/workflows/:workflowId')
    const { result } = renderHook(() => useParams<{ workflowId: string }>(), { wrapper })
    await waitFor(() => expect(result.current.workflowId).toBe('abc-123'))
  })

  it('extracts multiple typed params from the matching route', async () => {
    const { useParams } = await import('./useParams')
    const wrapper = await createTanStackTestRouter('/users/42/groups/7', '/users/:userId/groups/:groupId')
    const { result } = renderHook(() => useParams<{ userId: string; groupId: string }>(), { wrapper })
    await waitFor(() => expect(result.current.userId).toBe('42'))
    expect(result.current.groupId).toBe('7')
  })

  it('returns undefined for a named param that does not exist on the current route', async () => {
    const { useParams } = await import('./useParams')
    const wrapper = await createTanStackTestRouter('/workflows')
    const { result } = renderHook(() => useParams<{ workflowId?: string }>(), { wrapper })
    await waitFor(() => expect(result.current.workflowId).toBeUndefined())
  })
})
