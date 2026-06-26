import type { Approval } from '@ansible/nexus-contracts'
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useExecutionApprovalPanel } from './useExecutionApprovalPanel'

const mockApproval: Approval = {
  id: 'approval-1',
  project_id: 'project-1',
  name: 'Test Approval',
  status: 'pending',
  execution_id: 'exec-1',
  approval_node_id: 'node-1',
  created_at: '2026-01-01T00:00:00Z',
  next_step_approved: { id: 'step-a', name: 'Approved Step', type: 'task' },
  workflow_context: {
    workflow_version_id: 'wfv-1',
    workflow_name: 'Test Workflow',
    inputs: {},
  },
}

const mockFetchForNode = vi.fn()
const mockSetPendingApproval = vi.fn()
const mockClearPendingApproval = vi.fn()

vi.mock('./useFetchApprovalForUrlParam', () => ({
  useFetchApprovalForUrlParam: vi.fn(() => undefined),
}))

vi.mock('./useAutoApprovalDetection', () => ({
  useAutoApprovalDetection: vi.fn(),
}))

function makeNodeClick(pendingApproval: Approval | null = null) {
  return {
    fetchForNode: mockFetchForNode,
    setPendingApproval: mockSetPendingApproval,
    clearPendingApproval: mockClearPendingApproval,
    pendingApproval,
    selectedNodeId: null,
    setSelectedNodeId: vi.fn(),
    isFetching: false,
    nodeExecution: undefined,
  } as never
}

describe('useExecutionApprovalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with panel closed', () => {
    const { result } = renderHook(() => useExecutionApprovalPanel('exec-1', '', makeNodeClick(), undefined))
    expect(result.current.panelOpen).toBe(false)
  })

  it('opens panel via open()', () => {
    const { result } = renderHook(() => useExecutionApprovalPanel('exec-1', '', makeNodeClick(), undefined))

    act(() => result.current.open())
    expect(result.current.panelOpen).toBe(true)
  })

  it('closes panel via close()', () => {
    const { result } = renderHook(() => useExecutionApprovalPanel('exec-1', '', makeNodeClick(), undefined))

    act(() => result.current.open())
    expect(result.current.panelOpen).toBe(true)

    act(() => result.current.close())
    expect(result.current.panelOpen).toBe(false)
  })

  it('dismiss() closes panel and clears pending approval', () => {
    const { result } = renderHook(() => useExecutionApprovalPanel('exec-1', '', makeNodeClick(), undefined))

    act(() => result.current.open())
    act(() => result.current.dismiss())

    expect(result.current.panelOpen).toBe(false)
    expect(mockClearPendingApproval).toHaveBeenCalledOnce()
  })

  it('opens panel when URL approval is fetched', async () => {
    const { useFetchApprovalForUrlParam } = await import('./useFetchApprovalForUrlParam')
    vi.mocked(useFetchApprovalForUrlParam).mockReturnValue(mockApproval)

    const { result } = renderHook(() =>
      useExecutionApprovalPanel('exec-1', '?approval=approval-1', makeNodeClick(), undefined)
    )

    expect(result.current.panelOpen).toBe(true)
    expect(mockSetPendingApproval).toHaveBeenCalledWith(mockApproval)
  })

  it('auto-detection callback opens panel', async () => {
    const { useAutoApprovalDetection } = await import('./useAutoApprovalDetection')

    let capturedCallback: ((a: Approval) => void) | undefined
    vi.mocked(useAutoApprovalDetection).mockImplementation((opts: { onApprovalDetected: (a: Approval) => void }) => {
      capturedCallback = opts.onApprovalDetected
    })

    const { result } = renderHook(() => useExecutionApprovalPanel('exec-1', '', makeNodeClick(), undefined))

    expect(capturedCallback).toBeDefined()
    act(() => capturedCallback!(mockApproval))

    expect(result.current.panelOpen).toBe(true)
    expect(mockSetPendingApproval).toHaveBeenCalledWith(mockApproval)
  })

  it('returns approvalMessage from workflow definition', () => {
    const nodeClick = makeNodeClick(mockApproval)
    const wfDef = {
      nodes: [{ id: 'node-1', config: { prompt: 'Deploy to production?' } }],
    }

    const { result } = renderHook(() => useExecutionApprovalPanel('exec-1', '', nodeClick, wfDef))

    expect(result.current.approvalMessage).toBe('Deploy to production?')
  })

  it('returns undefined approvalMessage when no matching node', () => {
    const nodeClick = makeNodeClick(mockApproval)
    const wfDef = {
      nodes: [{ id: 'other-node', config: { prompt: 'Something else' } }],
    }

    const { result } = renderHook(() => useExecutionApprovalPanel('exec-1', '', nodeClick, wfDef))

    expect(result.current.approvalMessage).toBeUndefined()
  })

  it('returns undefined approvalMessage when no workflow definition', () => {
    const { result } = renderHook(() => useExecutionApprovalPanel('exec-1', '', makeNodeClick(mockApproval), undefined))

    expect(result.current.approvalMessage).toBeUndefined()
  })
})
