import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usersClient } from '../../client'

import { useCanDecideApproval } from './useCanDecideApproval'

const mockUseAuthStore = vi.fn()

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => {
    const state = mockUseAuthStore() as Record<string, unknown>
    return selector(state)
  },
}))

// Note: vi.mock factories are hoisted and cannot reference outer scope variables.
// We use vi.fn() directly in the factory and access the created mock via vi.mocked() in tests.
vi.mock('../../client', () => ({
  usersClient: {
    useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false, error: null }),
  },
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useCanDecideApproval', () => {
  const mockedUseQuery = vi.mocked(usersClient.useQuery)

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockReturnValue({ username: 'alice', userId: 'user-alice-id' })
  })

  it('returns false when approval is undefined', () => {
    const { result } = renderHook(() => useCanDecideApproval(undefined), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: false, isLoading: false })
  })

  it('returns false when approval is an empty object', () => {
    const { result } = renderHook(() => useCanDecideApproval({}), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: false, isLoading: false })
  })

  it('returns true when approval has no approvers configured', () => {
    const approval = {
      approver_users: undefined,
      approver_groups: undefined,
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: true, isLoading: false })
  })

  it('returns true when approval has empty approver arrays', () => {
    const approval = {
      approver_users: [],
      approver_groups: [],
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: true, isLoading: false })
  })

  it('returns true when current username is in approver_users list', () => {
    const approval = {
      approver_users: [
        { id: 'user-1', username: 'alice' },
        { id: 'user-2', username: 'bob' },
      ],
      approver_groups: undefined,
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: true, isLoading: false })
  })

  it('returns false when current username is not in approver_users list and no groups', () => {
    const approval = {
      approver_users: [
        { id: 'user-2', username: 'bob' },
        { id: 'user-3', username: 'charlie' },
      ],
      approver_groups: undefined,
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: false, isLoading: false })
  })

  it('returns true when user is in approver_users even with groups configured', () => {
    const approval = {
      approver_users: [{ id: 'user-1', username: 'alice' }],
      approver_groups: [{ id: 'group-1', name: 'admins' }],
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: true, isLoading: false })
  })

  it('fetches groups and returns true when user is member of approver group', async () => {
    mockedUseQuery.mockReturnValue({
      data: {
        resources: [
          { id: 'group-1', name: 'admins' },
          { id: 'group-2', name: 'developers' },
        ],
      },
      isLoading: false,
    })

    const approval = {
      approver_users: [{ id: 'user-other', username: 'bob' }],
      approver_groups: [{ id: 'group-1', name: 'admins' }],
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current).toEqual({ canDecide: true, isLoading: false })
    expect(mockedUseQuery).toHaveBeenCalledWith('get', '/users/{user_id}/groups', {
      params: { path: { user_id: 'user-alice-id' } },
      enabled: true,
    })
  })

  it('fetches groups and returns false when user is not member of any approver group', async () => {
    mockedUseQuery.mockReturnValue({
      data: {
        resources: [{ id: 'group-other', name: 'developers' }],
      },
      isLoading: false,
    })

    const approval = {
      approver_users: [{ id: 'user-other', username: 'bob' }],
      approver_groups: [{ id: 'group-1', name: 'admins' }],
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current).toEqual({ canDecide: false, isLoading: false })
  })

  it('returns loading state while fetching groups', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    const approval = {
      approver_users: [{ id: 'user-other', username: 'bob' }],
      approver_groups: [{ id: 'group-1', name: 'admins' }],
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: false, isLoading: true })
  })

  it('returns false when username is null', () => {
    mockUseAuthStore.mockReturnValue({ username: null, userId: null })

    const approval = {
      approver_users: [{ id: 'user-1', username: 'alice' }],
      approver_groups: undefined,
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: false, isLoading: false })
  })

  it('does not fetch groups when userId is null', () => {
    mockUseAuthStore.mockReturnValue({ username: 'alice', userId: null })

    const approval = {
      approver_users: [{ id: 'user-other', username: 'bob' }],
      approver_groups: [{ id: 'group-1', name: 'admins' }],
    }

    const { result } = renderHook(() => useCanDecideApproval(approval), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canDecide: false, isLoading: false })
    expect(mockedUseQuery).toHaveBeenCalledWith('get', '/users/{user_id}/groups', {
      params: { path: { user_id: '' } },
      enabled: false,
    })
  })
})
