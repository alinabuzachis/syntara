import type { Approval } from '@ansible/nexus-contracts'
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { FlowNodeType } from '../../../constants'
import { ACTIVITY_STATUS } from '../../builder/utils/executionState/executionHelpers'

import type { ExecutionNode } from './useExecutionApprovals'
import { isWaitingApprovalNode, useExecutionApprovals } from './useExecutionApprovals'

// Mock dependencies
vi.mock('./useFetchPendingApprovals', () => ({
  useFetchPendingApprovals: vi.fn(),
}))

vi.mock('../../../providers/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showInfo: vi.fn(),
    showError: vi.fn(),
  })),
}))

const mockApproval: Approval = {
  id: 'approval-1',
  project_id: 'test-project-1',
  approval_node_id: 'node-1',
  name: 'Test Approval',
  status: 'pending',
  execution_id: 'exec-1',
  created_at: '2026-01-01T00:00:00Z',
  next_step_approved: { id: 'step-a', name: 'Approved Step', type: 'task' },
  workflow_context: {
    workflow_version_id: 'wfv-1',
    workflow_name: 'Test Workflow',
    inputs: {},
  },
}

describe('isWaitingApprovalNode', () => {
  it('returns true for approval node with waiting status', () => {
    const node: ExecutionNode = {
      id: 'node-1',
      type: FlowNodeType.APPROVAL,
      data: {
        __executionState: { status: ACTIVITY_STATUS.WAITING },
      },
    }

    expect(isWaitingApprovalNode(node)).toBe(true)
  })

  it('returns false for non-approval node', () => {
    const node: ExecutionNode = {
      id: 'node-1',
      type: FlowNodeType.TASK,
      data: {
        __executionState: { status: ACTIVITY_STATUS.WAITING },
      },
    }

    expect(isWaitingApprovalNode(node)).toBe(false)
  })

  it('returns false for approval node without waiting status', () => {
    const node: ExecutionNode = {
      id: 'node-1',
      type: FlowNodeType.APPROVAL,
      data: {
        __executionState: { status: ACTIVITY_STATUS.COMPLETED },
      },
    }

    expect(isWaitingApprovalNode(node)).toBe(false)
  })

  it('returns false when execution state is missing', () => {
    const node: ExecutionNode = {
      id: 'node-1',
      type: FlowNodeType.APPROVAL,
      data: {},
    }

    expect(isWaitingApprovalNode(node)).toBe(false)
  })
})

describe('useExecutionApprovals', () => {
  beforeEach(async () => {
    const { useFetchPendingApprovals } = await import('./useFetchPendingApprovals')
    vi.mocked(useFetchPendingApprovals).mockReturnValue({
      approvals: [],
      isLoading: false,
      fetchApprovals: vi.fn(),
      findIndexByNodeId: vi.fn(() => -1),
      clear: vi.fn(),
    })
  })

  it('initializes with empty approvals', async () => {
    const { result } = renderHook(() => useExecutionApprovals('exec-1'))

    await waitFor(() => {
      expect(result.current.approvals).toEqual([])
      expect(result.current.currentIndex).toBe(0)
      expect(result.current.currentApproval).toBeNull()
    })
  })

  it('setApprovalsAndIndex updates state', () => {
    const { result } = renderHook(() => useExecutionApprovals('exec-1'))

    act(() => {
      result.current.setApprovalsAndIndex([mockApproval], 0)
    })

    expect(result.current.approvals).toEqual([mockApproval])
    expect(result.current.currentApproval).toEqual(mockApproval)
  })

  it('navigateToIndex clamps to valid range', () => {
    const { result } = renderHook(() => useExecutionApprovals('exec-1'))

    act(() => {
      result.current.setApprovalsAndIndex([mockApproval], 0)
    })

    act(() => {
      result.current.navigateToIndex(5) // Beyond range
    })

    expect(result.current.currentIndex).toBe(0) // Clamped to last index
  })

  it('clearApprovals resets state', () => {
    const { result } = renderHook(() => useExecutionApprovals('exec-1'))

    act(() => {
      result.current.setApprovalsAndIndex([mockApproval], 0)
    })

    act(() => {
      result.current.clearApprovals()
    })

    expect(result.current.approvals).toEqual([])
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.currentApproval).toBeNull()
  })

  it('resets state when executionId changes', () => {
    const { result, rerender } = renderHook(({ id }) => useExecutionApprovals(id), {
      initialProps: { id: 'exec-1' },
    })

    act(() => {
      result.current.setApprovalsAndIndex([mockApproval], 0)
    })

    rerender({ id: 'exec-2' })

    expect(result.current.approvals).toEqual([])
    expect(result.current.currentIndex).toBe(0)
  })

  it('handleNodeClick ignores non-waiting approval nodes', () => {
    const { result } = renderHook(() => useExecutionApprovals('exec-1'))

    const node: ExecutionNode = {
      id: 'node-1',
      type: FlowNodeType.TASK,
      data: {},
    }

    act(() => {
      result.current.handleNodeClick({} as React.MouseEvent, node)
    })

    // Node is not a waiting approval node, so no action should occur
    expect(result.current.approvals).toEqual([])
  })

  it('currentApproval is computed from approvals and currentIndex', () => {
    const { result } = renderHook(() => useExecutionApprovals('exec-1'))

    act(() => {
      result.current.setApprovalsAndIndex([mockApproval], 0)
    })

    expect(result.current.currentApproval).toBe(mockApproval)

    act(() => {
      result.current.navigateToIndex(5) // Out of bounds - clamps to last index
    })

    // Should clamp to last valid index (0 in this case)
    expect(result.current.currentApproval).toBe(mockApproval)
    expect(result.current.currentIndex).toBe(0)
  })

  it('navigateToIndex with negative index clamps to 0', () => {
    const { result } = renderHook(() => useExecutionApprovals('exec-1'))

    act(() => {
      result.current.setApprovalsAndIndex([mockApproval], 0)
    })

    act(() => {
      result.current.navigateToIndex(-1)
    })

    expect(result.current.currentIndex).toBe(0)
  })
})
