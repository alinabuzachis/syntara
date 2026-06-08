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

  const allGranted = {
    canReadUsers: true,
    canReadGroups: true,
    canReadProjects: true,
    canReadAssignments: true,
    canReadTokenRevocation: true,
    canAccessPage: true,
    isLoading: false,
  }

  it('defaults to safe-false for all permissions while loading', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    expect(result.current).toMatchObject({ canAccessPage: false, isLoading: true })
  })

  it('updates to true when API confirms access', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } } as never)

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current).toEqual(allGranted)
    })
  })

  it('updates to false when API denies all access', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: false } } as never)

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current).toEqual({
        canReadUsers: false,
        canReadGroups: false,
        canReadProjects: false,
        canReadAssignments: false,
        canReadTokenRevocation: false,
        canAccessPage: false,
        isLoading: false,
      })
    })
  })

  it('handles mixed permissions — canAccessPage true when at least one is granted', async () => {
    vi.mocked(accessFetchClient.POST)
      .mockResolvedValueOnce({ data: { allowed: false } } as never) // user
      .mockResolvedValueOnce({ data: { allowed: false } } as never) // group
      .mockResolvedValueOnce({ data: { allowed: true } } as never) // project
      .mockResolvedValueOnce({ data: { allowed: false } } as never) // role-assignment
      .mockResolvedValueOnce({ data: { allowed: false } } as never) // token-revocation

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current).toEqual({
        canReadUsers: false,
        canReadGroups: false,
        canReadProjects: true,
        canReadAssignments: false,
        canReadTokenRevocation: false,
        canAccessPage: true,
        isLoading: false,
      })
    })
  })

  it('calls can_i with correct resource types', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } } as never)

    renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalledTimes(5)
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'read', resource_type: 'user' },
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'read', resource_type: 'group' },
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'read', resource_type: 'project' },
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'read', resource_type: 'role-assignment' },
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'read', resource_type: 'admin:revocation' },
    })
  })

  it('deduplicates queries across multiple consumers', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } } as never)

    const wrapper = createWrapper()
    renderHook(() => useAccessManagementPermissions(), { wrapper })
    renderHook(() => useAccessManagementPermissions(), { wrapper })

    await waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalledTimes(5)
    })
  })

  it('defaults to false when API call fails (fail-secure)', async () => {
    vi.mocked(accessFetchClient.POST).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useAccessManagementPermissions(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current).toEqual({
      canReadUsers: false,
      canReadGroups: false,
      canReadProjects: false,
      canReadAssignments: false,
      canReadTokenRevocation: false,
      canAccessPage: false,
      isLoading: false,
    })
  })
})
