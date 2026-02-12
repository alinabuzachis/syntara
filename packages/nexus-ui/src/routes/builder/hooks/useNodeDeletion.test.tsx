import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { useNodeDeletion } from './useNodeDeletion'

// Mock dependencies
const mockBatchRemoveNodesAndEdges = vi.fn()
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStoreActions: () => ({
    batchRemoveNodesAndEdges: mockBatchRemoveNodesAndEdges,
  }),
}))

vi.mock('../../../constants', () => ({
  FlowNodeType: {
    TRIGGER: 'trigger',
    PLACEHOLDER: 'placeholder',
    LOOP: 'loop',
  },
}))

vi.mock('../utils/EdgeFactory', () => ({
  EdgeFactory: {
    createEdge: vi.fn((params) => ({
      id: `${params.source}-${params.target}`,
      ...params,
    })),
  },
}))

describe('useNodeDeletion', () => {
  const mockSetNodes = vi.fn()
  const mockSetEdges = vi.fn()
  const mockOnNodesDeleted = vi.fn()
  const mockOnAddNodeFromEdge = vi.fn()
  const mockIsDeletingRef = { current: false }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockIsDeletingRef.current = false
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        return updater([])
      }
    })
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        return updater([])
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns onNodesDelete handler', () => {
    const { result } = renderHook(() =>
      useNodeDeletion({
        nodes: [],
        edges: [],
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        isDeletingRef: mockIsDeletingRef,
      })
    )

    expect(result.current.onNodesDelete).toBeDefined()
  })

  it('sets isDeletingRef to true during deletion', () => {
    const { result } = renderHook(() =>
      useNodeDeletion({
        nodes: [{ id: 'node-1', type: 'task' }] as never[],
        edges: [],
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        isDeletingRef: mockIsDeletingRef,
      })
    )

    act(() => {
      result.current.onNodesDelete([{ id: 'node-1', type: 'task' }] as never[])
    })

    expect(mockIsDeletingRef.current).toBe(true)
  })

  it('calls batchRemoveNodesAndEdges with node IDs', () => {
    const { result } = renderHook(() =>
      useNodeDeletion({
        nodes: [{ id: 'node-1', type: 'task' }] as never[],
        edges: [],
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        isDeletingRef: mockIsDeletingRef,
      })
    )

    act(() => {
      result.current.onNodesDelete([{ id: 'node-1', type: 'task' }] as never[])
    })

    expect(mockBatchRemoveNodesAndEdges).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeIds: ['node-1'],
      })
    )
  })

  it('handles trigger node deletion', () => {
    const { result } = renderHook(() =>
      useNodeDeletion({
        nodes: [{ id: 'trigger-0', type: 'trigger' }] as never[],
        edges: [],
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        isDeletingRef: mockIsDeletingRef,
      })
    )

    act(() => {
      result.current.onNodesDelete([{ id: 'trigger-0', type: 'trigger' }] as never[])
    })

    expect(mockBatchRemoveNodesAndEdges).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerIndices: [0],
      })
    )
  })

  it('notifies parent of deleted nodes', () => {
    const { result } = renderHook(() =>
      useNodeDeletion({
        nodes: [{ id: 'node-1', type: 'task' }] as never[],
        edges: [],
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        isDeletingRef: mockIsDeletingRef,
        onNodesDeleted: mockOnNodesDeleted,
      })
    )

    act(() => {
      result.current.onNodesDelete([{ id: 'node-1', type: 'task' }] as never[])
    })

    expect(mockOnNodesDeleted).toHaveBeenCalledWith(['node-1'])
  })

  it('resets isDeletingRef after timeout', () => {
    const { result } = renderHook(() =>
      useNodeDeletion({
        nodes: [{ id: 'node-1', type: 'task' }] as never[],
        edges: [],
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        isDeletingRef: mockIsDeletingRef,
      })
    )

    act(() => {
      result.current.onNodesDelete([{ id: 'node-1', type: 'task' }] as never[])
    })

    expect(mockIsDeletingRef.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(mockIsDeletingRef.current).toBe(false)
  })

  it('excludes placeholder nodes from activity IDs', () => {
    const { result } = renderHook(() =>
      useNodeDeletion({
        nodes: [{ id: 'placeholder-1', type: 'placeholder' }] as never[],
        edges: [],
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        isDeletingRef: mockIsDeletingRef,
      })
    )

    act(() => {
      result.current.onNodesDelete([{ id: 'placeholder-1', type: 'placeholder' }] as never[])
    })

    expect(mockBatchRemoveNodesAndEdges).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeIds: [], // Placeholder should not be in nodeIds
      })
    )
  })

  it('handles loop reconnection when last loop body node is deleted', () => {
    const nodes = [
      { id: 'loop-1', type: 'loop' },
      { id: 'task-1', type: 'task' },
      { id: 'task-2', type: 'task' },
    ] as never[]

    const edges = [
      { id: 'e1', source: 'loop-1', target: 'task-1', sourceHandle: 'loop' },
      { id: 'e2', source: 'task-1', target: 'task-2' },
      { id: 'e3', source: 'task-2', target: 'loop-1', targetHandle: 'end' },
    ]

    const { result } = renderHook(() =>
      useNodeDeletion({
        nodes,
        edges,
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        isDeletingRef: mockIsDeletingRef,
        onAddNodeFromEdge: mockOnAddNodeFromEdge,
      })
    )

    act(() => {
      result.current.onNodesDelete([{ id: 'task-2', type: 'task' }] as never[])
    })

    // Should create reconnection edge from task-1 back to loop-1
    expect(mockBatchRemoveNodesAndEdges).toHaveBeenCalledWith(
      expect.objectContaining({
        edges: expect.arrayContaining([
          expect.objectContaining({
            source: 'task-1',
            target: 'loop-1',
            targetHandle: 'end',
          }),
        ]),
      })
    )
  })
})
