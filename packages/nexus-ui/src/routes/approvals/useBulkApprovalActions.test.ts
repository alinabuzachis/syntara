import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useBulkApprovalActions } from './useBulkApprovalActions'

// Type for batch approval response
type BatchApprovalResponse = {
  total_success: number
  total_failed: number
  results: unknown[]
}

// Type for mutation callbacks
type MutationCallbacks = {
  onSuccess: (response: BatchApprovalResponse) => void
  onError: (error: Error) => void
  onSettled: () => void
}

// Mock the approvalsClient
vi.mock('../../client', () => ({
  approvalsClient: {
    useMutation: vi.fn(),
  },
}))

// Mock the alerts provider
const mockShowAlert = vi.fn()
vi.mock('../../providers/alerts', () => ({
  useAlerts: () => ({ showAlert: mockShowAlert }),
}))

describe('useBulkApprovalActions', () => {
  const mockApprovalIds = new Set(['approval-1', 'approval-2'])

  const mockOnSuccess = vi.fn()
  let mockMutate: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockMutate = vi.fn()

    const { approvalsClient } = await import('../../client')
    vi.mocked(approvalsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isSuccess: false,
      isError: false,
      data: undefined,
      error: null,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      variables: undefined,
      context: undefined,
      failureCount: 0,
      failureReason: null,
      isIdle: true,
      isPaused: false,
      status: 'idle',
      submittedAt: 0,
    })
  })

  it('initializes with closed dialogs', () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    expect(result.current.bulkApproveDialogOpen).toBe(false)
    expect(result.current.bulkRejectDialogOpen).toBe(false)
  })

  it('opens approve dialog', () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.setBulkApproveDialogOpen(true)
    })

    expect(result.current.bulkApproveDialogOpen).toBe(true)
  })

  it('opens reject dialog', () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.setBulkRejectDialogOpen(true)
    })

    expect(result.current.bulkRejectDialogOpen).toBe(true)
  })

  it('handles bulk approve with note', () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.handleBulkApprove('Test note')
    })

    expect(mockMutate).toHaveBeenCalledWith(
      {
        body: {
          decisions: [
            { approval_id: 'approval-1', status: 'approved', notes: 'Test note' },
            { approval_id: 'approval-2', status: 'approved', notes: 'Test note' },
          ],
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function) as MutationCallbacks['onSuccess'],
        onError: expect.any(Function) as MutationCallbacks['onError'],
        onSettled: expect.any(Function) as MutationCallbacks['onSettled'],
      }) as MutationCallbacks
    )
  })

  it('handles bulk approve without note', () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.handleBulkApprove(null)
    })

    expect(mockMutate).toHaveBeenCalledWith(
      {
        body: {
          decisions: [
            { approval_id: 'approval-1', status: 'approved', notes: null },
            { approval_id: 'approval-2', status: 'approved', notes: null },
          ],
        },
      },
      expect.any(Object)
    )
  })

  it('handles bulk reject with note', () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.handleBulkReject('Rejection reason')
    })

    expect(mockMutate).toHaveBeenCalledWith(
      {
        body: {
          decisions: [
            { approval_id: 'approval-1', status: 'rejected', notes: 'Rejection reason' },
            { approval_id: 'approval-2', status: 'rejected', notes: 'Rejection reason' },
          ],
        },
      },
      expect.any(Object)
    )
  })

  it('calls onSuccess and shows success alert when all approvals succeed', async () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.handleBulkApprove('Test note')
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    act(() => {
      callbacks.onSuccess({ total_success: 2, total_failed: 0, results: [] })
    })

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledTimes(1)
      expect(mockShowAlert).toHaveBeenCalledWith({
        title: 'Approvals submitted',
        description: 'Successfully approved 2 approvals.',
        variant: 'success',
        autoDismiss: true,
      })
    })
  })

  it('shows singular message for single approval success', async () => {
    const singleApprovalId = new Set(['approval-1'])
    const { result } = renderHook(() => useBulkApprovalActions(singleApprovalId, mockOnSuccess))

    act(() => {
      result.current.handleBulkApprove(null)
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    act(() => {
      callbacks.onSuccess({ total_success: 1, total_failed: 0, results: [] })
    })

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith({
        title: 'Approvals submitted',
        description: 'Successfully approved 1 approval.',
        variant: 'success',
        autoDismiss: true,
      })
    })
  })

  it('shows warning alert for partial success', async () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.handleBulkApprove(null)
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    act(() => {
      callbacks.onSuccess({ total_success: 1, total_failed: 1, results: [] })
    })

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledTimes(1)
      expect(mockShowAlert).toHaveBeenCalledWith({
        title: 'Partial success',
        description: 'Approved 1 approval, but 1 failed. Check the list and try again.',
        variant: 'warning',
        autoDismiss: false,
      })
    })
  })

  it('shows error alert on mutation failure', async () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.handleBulkApprove(null)
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    const error = new Error('Network error')

    act(() => {
      callbacks.onError(error)
    })

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith({
        title: 'Bulk approval failed',
        description: 'An error occurred while approving the selected items. Please try again.',
        variant: 'danger',
        autoDismiss: false,
      })
    })
  })

  it('closes approve dialog on success', async () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.setBulkApproveDialogOpen(true)
    })

    expect(result.current.bulkApproveDialogOpen).toBe(true)

    act(() => {
      result.current.handleBulkApprove(null)
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    act(() => {
      callbacks.onSuccess({ total_success: 2, total_failed: 0, results: [] })
    })

    await waitFor(() => {
      expect(result.current.bulkApproveDialogOpen).toBe(false)
    })
  })

  it('closes approve dialog on error (via onSettled)', async () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.setBulkApproveDialogOpen(true)
    })

    act(() => {
      result.current.handleBulkApprove(null)
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    act(() => {
      callbacks.onSettled()
    })

    await waitFor(() => {
      expect(result.current.bulkApproveDialogOpen).toBe(false)
    })
  })

  it('handles reject success with correct alert', async () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.handleBulkReject('Test reason')
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    act(() => {
      callbacks.onSuccess({ total_success: 2, total_failed: 0, results: [] })
    })

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith({
        title: 'Approvals rejected',
        description: 'Successfully rejected 2 approvals.',
        variant: 'success',
        autoDismiss: true,
      })
    })
  })

  it('closes reject dialog on success', async () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.setBulkRejectDialogOpen(true)
    })

    expect(result.current.bulkRejectDialogOpen).toBe(true)

    act(() => {
      result.current.handleBulkReject('Test reason')
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    act(() => {
      callbacks.onSuccess({ total_success: 2, total_failed: 0, results: [] })
    })

    await waitFor(() => {
      expect(result.current.bulkRejectDialogOpen).toBe(false)
    })
  })

  it('shows error alert for reject failure', async () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.handleBulkReject('Test reason')
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    const error = new Error('Server error')

    act(() => {
      callbacks.onError(error)
    })

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith({
        title: 'Bulk rejection failed',
        description: 'An error occurred while rejecting the selected items. Please try again.',
        variant: 'danger',
        autoDismiss: false,
      })
    })
  })

  it('handles unknown error type', async () => {
    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    act(() => {
      result.current.handleBulkApprove(null)
    })

    const mutateCall = mockMutate.mock.calls[0] as [unknown, MutationCallbacks]
    const callbacks = mutateCall[1]

    // getErrorMessage() handles non-Error types
    act(() => {
      callbacks.onError('Unknown error' as unknown as Error)
    })

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith({
        title: 'Bulk approval failed',
        description: 'An error occurred while approving the selected items. Please try again.',
        variant: 'danger',
        autoDismiss: false,
      })
    })
  })

  it('exposes isPending from mutation', async () => {
    const { approvalsClient } = await import('../../client')
    vi.mocked(approvalsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      isSuccess: false,
      isError: false,
      data: undefined,
      error: null,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      variables: undefined,
      context: undefined,
      failureCount: 0,
      failureReason: null,
      isIdle: false,
      isPaused: false,
      status: 'pending',
      submittedAt: Date.now(),
    })

    const { result } = renderHook(() => useBulkApprovalActions(mockApprovalIds, mockOnSuccess))

    expect(result.current.isPending).toBe(true)
  })
})
