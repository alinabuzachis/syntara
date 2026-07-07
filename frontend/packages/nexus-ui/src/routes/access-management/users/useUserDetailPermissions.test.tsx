import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accessFetchClient } from '../../access/accessClient'

import { useUserDetailPermissions } from './useUserDetailPermissions'

vi.mock('../../access/accessClient', () => ({
  accessFetchClient: { POST: vi.fn() },
}))

const { mockAuthQuery } = vi.hoisted(() => ({
  mockAuthQuery: vi.fn(),
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
  authClient: { useQuery: mockAuthQuery },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const CURRENT_USER_ID = 'a1b2c3d4-0000-0000-0000-000000000000'
const OTHER_USER_ID = 'ffffffff-0000-0000-0000-000000000000'

function mockMeQuery(currentUserId: string) {
  mockAuthQuery.mockReturnValue({
    data: { id: currentUserId },
    isLoading: false,
  })
}

function mockCanI(permissions: Record<string, boolean>) {
  vi.mocked(accessFetchClient.POST).mockImplementation((_path, opts) => {
    const body = (opts as { body?: { resource_type?: string } })?.body
    const resourceType = body?.resource_type ?? ''
    const allowed = permissions[resourceType] ?? false
    return Promise.resolve({ data: { allowed } })
  })
}

describe('useUserDetailPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMeQuery(CURRENT_USER_ID)
  })

  it('returns all permissions when granted', async () => {
    mockCanI({ user: true, group: true, user_identity: true, 'role-assignment': true })

    const { result } = renderHook(() => useUserDetailPermissions(OTHER_USER_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current).toEqual({
      canReadUsers: true,
      canReadGroups: true,
      canReadIdentities: true,
      canReadAssignments: true,
      isLoading: false,
    })
  })

  it('denies all permissions when denied', async () => {
    mockCanI({ user: false, group: false, user_identity: false, 'role-assignment': false })

    const { result } = renderHook(() => useUserDetailPermissions(OTHER_USER_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current).toEqual({
      canReadUsers: false,
      canReadGroups: false,
      canReadIdentities: false,
      canReadAssignments: false,
      isLoading: false,
    })
  })

  it('grants groups, identities, and assignments for own profile via self-permission', async () => {
    mockCanI({ user: false, group: false, user_identity: false, 'role-assignment': false })

    const { result } = renderHook(() => useUserDetailPermissions(CURRENT_USER_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canReadUsers).toBe(false)
    expect(result.current.canReadGroups).toBe(true)
    expect(result.current.canReadIdentities).toBe(true)
    expect(result.current.canReadAssignments).toBe(true)
  })

  it('does not grant self-permission for other users', async () => {
    mockCanI({ group: true, user_identity: false, 'role-assignment': false })

    const { result } = renderHook(() => useUserDetailPermissions(OTHER_USER_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canReadIdentities).toBe(false)
    expect(result.current.canReadAssignments).toBe(false)
  })

  it('defaults to safe false while loading', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useUserDetailPermissions(OTHER_USER_ID), {
      wrapper: createWrapper(),
    })

    expect(result.current.canReadUsers).toBe(false)
    expect(result.current.canReadGroups).toBe(false)
    expect(result.current.canReadIdentities).toBe(false)
    expect(result.current.canReadAssignments).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })
})
