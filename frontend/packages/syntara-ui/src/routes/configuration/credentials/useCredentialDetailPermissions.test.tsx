import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accessFetchClient } from '../../../routes/access/accessClient'

import { useCredentialDetailPermissions } from './useCredentialDetailPermissions'

vi.mock('../../../routes/access/accessClient', () => ({
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

describe('useCredentialDetailPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns canReadWorkflows true when granted', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } })

    const { result } = renderHook(() => useCredentialDetailPermissions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canReadWorkflows).toBe(true)
  })

  it('returns canReadWorkflows false when denied', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: false } })

    const { result } = renderHook(() => useCredentialDetailPermissions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canReadWorkflows).toBe(false)
  })

  it('defaults to safe false while loading', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCredentialDetailPermissions(), {
      wrapper: createWrapper(),
    })

    expect(result.current.canReadWorkflows).toBe(false)
    expect(result.current.canReadIntegrations).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })

  it('returns canReadIntegrations true when granted', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } })

    const { result } = renderHook(() => useCredentialDetailPermissions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canReadIntegrations).toBe(true)
  })

  it('returns canReadIntegrations false when denied', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: false } })

    const { result } = renderHook(() => useCredentialDetailPermissions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canReadIntegrations).toBe(false)
  })

  it('isLoading is true while either permission check is pending', () => {
    let callCount = 0
    vi.mocked(accessFetchClient.POST).mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ data: { allowed: true } })
      return new Promise(() => {})
    })

    const { result } = renderHook(() => useCredentialDetailPermissions(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
  })
})
