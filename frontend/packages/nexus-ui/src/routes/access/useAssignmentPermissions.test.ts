import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accessFetchClient } from './accessClient'
import { useAssignmentPermissions } from './useAssignmentPermissions'

vi.mock('./accessClient', () => ({
  accessFetchClient: {
    POST: vi.fn(),
  },
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useAssignmentPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to safe-false while loading', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useAssignmentPermissions(), { wrapper: createWrapper() })

    expect(result.current.canAssign).toBe(false)
    expect(result.current.canRevoke).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })

  it('returns all true when API grants all permissions', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } } as never)

    const { result } = renderHook(() => useAssignmentPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.canAssign).toBe(true)
    expect(result.current.canRevoke).toBe(true)
  })

  it('calls can_i with correct action and resource_type', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } } as never)

    renderHook(() => useAssignmentPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalledTimes(2)
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'assign', resource_type: 'role-assignment' },
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'revoke', resource_type: 'role-assignment' },
    })
  })

  it('provides standardized tooltip messages', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useAssignmentPermissions(), { wrapper: createWrapper() })

    expect(result.current.tooltips.assign).toContain('role-assignment:assign')
    expect(result.current.tooltips.revoke).toContain('role-assignment:revoke')
  })

  it('returns safe defaults when requests fail', async () => {
    vi.mocked(accessFetchClient.POST).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useAssignmentPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.canAssign).toBe(false)
    expect(result.current.canRevoke).toBe(false)
  })
})
