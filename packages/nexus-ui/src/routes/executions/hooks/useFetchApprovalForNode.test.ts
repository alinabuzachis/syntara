import { act, renderHook } from '@testing-library/react'

import { approvalsClient } from '../../../client'

import { useFetchApprovalForNode } from './useFetchApprovalForNode'

vi.mock('../../../client', () => ({
  approvalsClient: {
    useQuery: vi.fn(),
  },
}))

const mockApproval = {
  id: 'approval-1',
  approval_node_id: 'node-abc',
  status: 'pending',
  name: 'Test Approval',
  execution_id: 'exec-1',
}

const mockApprovalOther = {
  id: 'approval-2',
  approval_node_id: 'node-xyz',
  status: 'pending',
  name: 'Other Approval',
  execution_id: 'exec-1',
}

describe('useFetchApprovalForNode', () => {
  const mockRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(approvalsClient.useQuery).mockReturnValue({
      refetch: mockRefetch,
      data: null,
      isPending: false,
      error: null,
      isError: false,
    } as never)
  })

  it('returns null approval initially', () => {
    const { result } = renderHook(() => useFetchApprovalForNode('exec-1'))

    expect(result.current.approval).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('fetches and returns matching approval for node', async () => {
    mockRefetch.mockResolvedValue({
      data: { resources: [mockApproval, mockApprovalOther] },
    })

    const { result } = renderHook(() => useFetchApprovalForNode('exec-1'))

    let fetchedApproval: unknown
    await act(async () => {
      fetchedApproval = await result.current.fetchForNode('node-abc')
    })

    expect(fetchedApproval).toEqual(mockApproval)
    expect(result.current.approval).toEqual(mockApproval)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns null when no matching approval found', async () => {
    mockRefetch.mockResolvedValue({
      data: { resources: [mockApprovalOther] },
    })

    const { result } = renderHook(() => useFetchApprovalForNode('exec-1'))

    let fetchedApproval: unknown
    await act(async () => {
      fetchedApproval = await result.current.fetchForNode('nonexistent-node')
    })

    expect(fetchedApproval).toBeNull()
    expect(result.current.approval).toBeNull()
  })

  it('returns null when no approvals exist', async () => {
    mockRefetch.mockResolvedValue({
      data: { resources: [] },
    })

    const { result } = renderHook(() => useFetchApprovalForNode('exec-1'))

    let fetchedApproval: unknown
    await act(async () => {
      fetchedApproval = await result.current.fetchForNode('node-abc')
    })

    expect(fetchedApproval).toBeNull()
  })

  it('clears the approval state', async () => {
    mockRefetch.mockResolvedValue({
      data: { resources: [mockApproval] },
    })

    const { result } = renderHook(() => useFetchApprovalForNode('exec-1'))

    await act(async () => {
      await result.current.fetchForNode('node-abc')
    })

    expect(result.current.approval).toEqual(mockApproval)

    act(() => {
      result.current.clear()
    })

    expect(result.current.approval).toBeNull()
  })

  it('resets isLoading when fetch fails', async () => {
    mockRefetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useFetchApprovalForNode('exec-1'))

    await act(async () => {
      await expect(result.current.fetchForNode('node-abc')).rejects.toThrow('Network error')
    })

    expect(result.current.isLoading).toBe(false)
  })

  it('queries with correct execution_id and pending status', () => {
    renderHook(() => useFetchApprovalForNode('exec-42'))

    expect(approvalsClient.useQuery).toHaveBeenCalledWith('get', '/approvals', {
      params: {
        query: {
          execution_id: 'exec-42',
          status: 'pending',
        },
      },
      enabled: false,
    })
  })
})
