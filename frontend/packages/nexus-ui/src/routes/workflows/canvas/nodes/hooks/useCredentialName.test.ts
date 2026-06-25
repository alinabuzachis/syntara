import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn(),
  },
}))

import { credentialsClient } from '../../../../../client'

import { useCredentialName } from './useCredentialName'

const mockUseQuery = vi.mocked(credentialsClient.useQuery)

describe('useCredentialName', () => {
  it('returns undefined when credentialId is undefined', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false } as ReturnType<typeof mockUseQuery>)

    const { result } = renderHook(() => useCredentialName(undefined))

    expect(result.current).toBeUndefined()
    expect(mockUseQuery).toHaveBeenCalledWith(
      'get',
      '/credentials/{credential_id}',
      { params: { path: { credential_id: '' } } },
      { enabled: false, staleTime: 5 * 60 * 1000 }
    )
  })

  it('returns credential name when found', async () => {
    mockUseQuery.mockReturnValue({
      data: { id: 'cred-123', name: 'My OpenAI Key' },
      isPending: false,
    } as ReturnType<typeof mockUseQuery>)

    const { result } = renderHook(() => useCredentialName('cred-123'))

    await waitFor(() => {
      expect(result.current).toBe('My OpenAI Key')
    })
    expect(mockUseQuery).toHaveBeenCalledWith(
      'get',
      '/credentials/{credential_id}',
      { params: { path: { credential_id: 'cred-123' } } },
      { enabled: true, staleTime: 5 * 60 * 1000 }
    )
  })

  it('returns undefined when query returns no data', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: true } as ReturnType<typeof mockUseQuery>)

    const { result } = renderHook(() => useCredentialName('cred-456'))

    expect(result.current).toBeUndefined()
  })

  it('returns undefined when credential has no name', () => {
    mockUseQuery.mockReturnValue({
      data: { id: 'cred-789' },
      isPending: false,
    } as ReturnType<typeof mockUseQuery>)

    const { result } = renderHook(() => useCredentialName('cred-789'))

    expect(result.current).toBeUndefined()
  })
})
