import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { integrationsClient } from '../../../client'

import { useCredentialIntegrationCheck } from './useCredentialIntegrationCheck'

vi.mock('../../../client', () => ({
  integrationsClient: {
    useQuery: vi.fn(),
  },
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

describe('useCredentialIntegrationCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty integrations when credential is null', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { result } = renderHook(() => useCredentialIntegrationCheck(null))

    expect(result.current.affectedIntegrations).toEqual([])
    expect(result.current.integrationsFetchError).toBe(false)
    expect(result.current.isLoadingIntegrations).toBe(false)
  })

  it('returns integrations when credential is provided', () => {
    const mockIntegrations = [
      { id: 'int-1', name: 'GitHub Copilot' },
      { id: 'int-2', name: 'Jira Integration' },
    ]
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      error: null,
      isLoading: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { result } = renderHook(() => useCredentialIntegrationCheck('cred-123'))

    expect(result.current.affectedIntegrations).toEqual(mockIntegrations)
    expect(result.current.integrationsFetchError).toBe(false)
    expect(result.current.isLoadingIntegrations).toBe(false)
  })

  it('returns error state on fetch error', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: undefined,
      error: new Error('Network error'),
      isLoading: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { result } = renderHook(() => useCredentialIntegrationCheck('cred-123'))

    expect(result.current.affectedIntegrations).toEqual([])
    expect(result.current.integrationsFetchError).toBe(true)
    expect(result.current.isLoadingIntegrations).toBe(false)
  })

  it('returns loading state when query is loading', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { result } = renderHook(() => useCredentialIntegrationCheck('cred-123'))

    expect(result.current.isLoadingIntegrations).toBe(true)
  })

  it('does not report loading when credential is null', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { result } = renderHook(() => useCredentialIntegrationCheck(null))

    expect(result.current.isLoadingIntegrations).toBe(false)
  })

  it('passes credential ID as query parameter', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: [] },
      error: null,
      isLoading: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    renderHook(() => useCredentialIntegrationCheck('test-cred-456'))

    expect(integrationsClient.useQuery).toHaveBeenCalledWith(
      'get',
      '/integrations',
      { params: { query: { management_credential_id: 'test-cred-456' } } },
      { enabled: true }
    )
  })

  it('disables query when credential is null', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    renderHook(() => useCredentialIntegrationCheck(null))

    expect(integrationsClient.useQuery).toHaveBeenCalledWith(
      'get',
      '/integrations',
      { params: { query: { management_credential_id: '' } } },
      { enabled: false }
    )
  })
})
