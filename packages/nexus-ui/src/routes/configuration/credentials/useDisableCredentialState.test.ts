import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { act, createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { credentialsClient } from '../../../client'

import type { Credential } from './credentialConstants'
import { useDisableCredentialState } from './useDisableCredentialState'

vi.mock('../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn(),
  },
}))

const mockCredential: Credential = {
  id: 'cred-1',
  name: 'Test Credential',
  description: '',
  credential_type_id: 'type-1',
  inputs: {},
  enabled: true,
  labels: {},
  created_by: 'user-1',
  project_id: 'proj-1',
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useDisableCredentialState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock: query disabled (no credential selected)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useQuery).mockReturnValue({ data: undefined, error: null, isPending: false } as any)
  })

  it('has initial state with credentialToDisable null, affectedWorkflows empty, workflowsFetchError false', () => {
    const { result } = renderHook(() => useDisableCredentialState(), { wrapper: createWrapper() })

    expect(result.current.credentialToDisable).toBeNull()
    expect(result.current.affectedWorkflows).toEqual([])
    expect(result.current.workflowsFetchError).toBe(false)
  })

  it('sets credentialToDisable when openDisableDialog is called', () => {
    const { result } = renderHook(() => useDisableCredentialState(), { wrapper: createWrapper() })

    act(() => {
      result.current.openDisableDialog(mockCredential)
    })

    expect(result.current.credentialToDisable).toEqual(mockCredential)
  })

  it('returns affectedWorkflows from query data', () => {
    const mockWorkflows = [
      { id: 'wf-1', name: 'Workflow 1' },
      { id: 'wf-2', name: 'Workflow 2' },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useQuery).mockReturnValue({ data: mockWorkflows, error: null, isPending: false } as any)

    const { result } = renderHook(() => useDisableCredentialState(), { wrapper: createWrapper() })

    act(() => {
      result.current.openDisableDialog(mockCredential)
    })

    expect(result.current.affectedWorkflows).toEqual(mockWorkflows)
    expect(result.current.workflowsFetchError).toBe(false)
  })

  it('sets workflowsFetchError when query has error', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: undefined,
      error: new Error('Server error'),
      isPending: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { result } = renderHook(() => useDisableCredentialState(), { wrapper: createWrapper() })

    act(() => {
      result.current.openDisableDialog(mockCredential)
    })

    expect(result.current.workflowsFetchError).toBe(true)
    expect(result.current.affectedWorkflows).toEqual([])
  })

  it('resets credentialToDisable when closeDisableDialog is called', () => {
    const { result } = renderHook(() => useDisableCredentialState(), { wrapper: createWrapper() })

    act(() => {
      result.current.openDisableDialog(mockCredential)
    })
    expect(result.current.credentialToDisable).toEqual(mockCredential)

    act(() => {
      result.current.closeDisableDialog()
    })
    expect(result.current.credentialToDisable).toBeNull()
  })

  it('passes credential_id to useQuery params', () => {
    const { result } = renderHook(() => useDisableCredentialState(), { wrapper: createWrapper() })

    act(() => {
      result.current.openDisableDialog(mockCredential)
    })

    // Verify useQuery was called with the credential ID in the path params
    expect(credentialsClient.useQuery).toHaveBeenCalledWith(
      'get',
      '/credentials/{credential_id}/workflows',
      expect.objectContaining({
        params: { path: { credential_id: 'cred-1' } },
      }),
      expect.objectContaining({ enabled: true })
    )
  })

  it('disables query when no credential is selected', () => {
    renderHook(() => useDisableCredentialState(), { wrapper: createWrapper() })

    expect(credentialsClient.useQuery).toHaveBeenCalledWith(
      'get',
      '/credentials/{credential_id}/workflows',
      expect.anything(),
      expect.objectContaining({ enabled: false })
    )
  })
})
