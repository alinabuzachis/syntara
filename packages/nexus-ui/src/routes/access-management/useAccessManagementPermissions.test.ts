import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accessFetchClient } from '../access/accessClient'

import { useAccessManagementPermissions } from './useAccessManagementPermissions'

vi.mock('../access/accessClient', () => ({
  accessFetchClient: {
    POST: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useAccessManagementPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to canReadUsers: true and canReadGroups: true while loading', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canReadUsers: true, canReadGroups: true, isLoading: true })
  })

  it('updates to true when API confirms access', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } } as never)

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current).toEqual({ canReadUsers: true, canReadGroups: true, isLoading: false })
    })
  })

  it('updates to false when API denies access', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: false } } as never)

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current).toEqual({ canReadUsers: false, canReadGroups: false, isLoading: false })
    })
  })

  it('handles mixed permissions', async () => {
    vi.mocked(accessFetchClient.POST)
      .mockResolvedValueOnce({ data: { allowed: true } } as never)
      .mockResolvedValueOnce({ data: { allowed: false } } as never)

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current).toEqual({ canReadUsers: true, canReadGroups: false, isLoading: false })
    })
  })

  it('calls can_i with correct resource types', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } } as never)

    renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalledTimes(2)
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'read', resource_type: 'user' },
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'read', resource_type: 'group' },
    })
  })

  it('deduplicates queries across multiple consumers', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } } as never)

    const wrapper = createWrapper()
    renderHook(() => useAccessManagementPermissions(), { wrapper })
    renderHook(() => useAccessManagementPermissions(), { wrapper })

    await waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalledTimes(2)
    })
  })

  it('defaults to true when API call fails', async () => {
    vi.mocked(accessFetchClient.POST).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current).toEqual({ canReadUsers: true, canReadGroups: true, isLoading: false })
  })
})
