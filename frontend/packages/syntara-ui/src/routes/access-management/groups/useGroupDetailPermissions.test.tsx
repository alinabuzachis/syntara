import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accessFetchClient } from '../../access/accessClient'

import { useGroupDetailPermissions } from './useGroupDetailPermissions'

vi.mock('../../access/accessClient', () => ({
  accessFetchClient: { POST: vi.fn() },
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function mockCanI(permissions: Record<string, boolean>) {
  vi.mocked(accessFetchClient.POST).mockImplementation((_path, opts) => {
    const body = (opts as { body?: { resource_type?: string } })?.body
    const resourceType = body?.resource_type ?? ''
    const allowed = permissions[resourceType] ?? false
    return Promise.resolve({ data: { allowed } })
  })
}

describe('useGroupDetailPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all permissions when granted', async () => {
    mockCanI({ group: true, 'role-assignment': true })

    const { result } = renderHook(() => useGroupDetailPermissions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current).toEqual({
      canReadMembers: true,
      canReadAssignments: true,
      isLoading: false,
    })
  })

  it('denies all permissions when denied', async () => {
    mockCanI({ group: false, 'role-assignment': false })

    const { result } = renderHook(() => useGroupDetailPermissions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current).toEqual({
      canReadMembers: false,
      canReadAssignments: false,
      isLoading: false,
    })
  })

  it('handles mixed permissions', async () => {
    mockCanI({ group: true, 'role-assignment': false })

    const { result } = renderHook(() => useGroupDetailPermissions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canReadMembers).toBe(true)
    expect(result.current.canReadAssignments).toBe(false)
  })

  it('defaults to safe false while loading', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useGroupDetailPermissions(), {
      wrapper: createWrapper(),
    })

    expect(result.current.canReadMembers).toBe(false)
    expect(result.current.canReadAssignments).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })
})
