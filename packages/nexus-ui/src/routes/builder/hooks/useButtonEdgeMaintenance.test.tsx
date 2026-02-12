import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { useButtonEdgeMaintenance } from './useButtonEdgeMaintenance'

// Mock dependencies
vi.mock('../../../constants', () => ({
  FlowNodeType: {
    CONDITION: 'condition',
    LOOP: 'loop',
    APPROVAL: 'approval',
    PLACEHOLDER: 'placeholder',
  },
}))

vi.mock('../utils/filterHelpers', () => ({
  filterRealNodes: (nodes: Array<{ id: string }>) =>
    nodes.filter((n) => !n.id.startsWith('placeholder-') && !n.id.startsWith('pending-')),
  filterButtonEdges: (edges: Array<{ type?: string; id?: string }>) =>
    edges.filter((e) => e.type === 'buttonEdge' || e.id?.startsWith('button-')),
}))

describe('useButtonEdgeMaintenance', () => {
  const mockSetNodes = vi.fn()
  const mockSetEdges = vi.fn()
  const mockOnAddNodeFromEdge = vi.fn()

  const defaultOptions = {
    nodes: [] as never[],
    edges: [] as never[],
    isInitialized: true,
    activeEdgeButtonNodeId: null,
    activeEdgeButtonHandle: null,
    onAddNodeFromEdge: mockOnAddNodeFromEdge,
    pendingEdge: null,
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    executionStatus: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
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

  it('returns memoized signatures', () => {
    const { result } = renderHook(() => useButtonEdgeMaintenance(defaultOptions))

    expect(result.current.realNodeIds).toBeDefined()
    expect(result.current.realEdgesSignature).toBeDefined()
    expect(result.current.buttonEdgesSignature).toBeDefined()
  })

  it('does nothing when not initialized', () => {
    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        isInitialized: false,
        nodes: [{ id: 'node-1', type: 'task', position: { x: 0, y: 0 } }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(mockSetEdges).not.toHaveBeenCalled()
  })

  it('skips when in execution mode', () => {
    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        executionStatus: 'running',
        nodes: [{ id: 'node-1', type: 'task', position: { x: 0, y: 0 } }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(mockSetEdges).not.toHaveBeenCalled()
  })

  it('creates button edge for node without outgoing edge', () => {
    let capturedEdges: unknown[] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedEdges = updater([])
      }
      return capturedEdges
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [{ id: 'node-1', type: 'task', position: { x: 100, y: 100 } }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(mockSetEdges).toHaveBeenCalled()
    const buttonEdge = capturedEdges.find((e) => (e as { id: string }).id === 'button-node-1')
    expect(buttonEdge).toBeDefined()
  })

  it('does not create button edge for node with outgoing edge', () => {
    let capturedEdges: unknown[] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedEdges = updater([{ id: 'edge-1', source: 'node-1', target: 'node-2', sourceHandle: 'source' }])
      }
      return capturedEdges
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [
          { id: 'node-1', type: 'task', position: { x: 100, y: 100 } },
          { id: 'node-2', type: 'task', position: { x: 300, y: 100 } },
        ] as never[],
        edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2', sourceHandle: 'source' }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Button edge should not be created for node-1
    const buttonEdge = capturedEdges.find((e) => (e as { id: string }).id === 'button-node-1')
    expect(buttonEdge).toBeUndefined()
  })

  it('creates button edges for condition node handles', () => {
    let capturedEdges: unknown[] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedEdges = updater([])
      }
      return capturedEdges
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [{ id: 'condition-1', type: 'condition', position: { x: 100, y: 100 } }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(mockSetEdges).toHaveBeenCalled()
    const trueEdge = capturedEdges.find((e) => (e as { id: string }).id === 'button-condition-1-true')
    const falseEdge = capturedEdges.find((e) => (e as { id: string }).id === 'button-condition-1-false')
    expect(trueEdge).toBeDefined()
    expect(falseEdge).toBeDefined()
  })

  it('creates placeholder nodes for button edges', () => {
    // Track all setNodes calls
    const nodesCalls: unknown[][] = []
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        const result = updater([{ id: 'node-1', type: 'task', position: { x: 100, y: 100 } }])
        nodesCalls.push(result)
        return result
      }
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [{ id: 'node-1', type: 'task', position: { x: 100, y: 100 } }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Check that setNodes was called
    expect(mockSetNodes).toHaveBeenCalled()

    // Look for placeholder in any of the calls
    const allNodes = nodesCalls.flat()
    const placeholder = allNodes.find((n) => (n as { id: string }).id === 'placeholder-node-1')
    expect(placeholder).toBeDefined()
  })

  it('updates active state for button edges', () => {
    // This test verifies that button edges are created with isActive state
    // based on activeEdgeButtonNodeId and activeEdgeButtonHandle

    // Track all setEdges calls
    const edgesCalls: unknown[][] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        // No existing edges - the hook should create a new button edge with isActive
        const result = updater([])
        edgesCalls.push(result)
        return result
      }
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [{ id: 'node-1', type: 'task', position: { x: 100, y: 100 } }] as never[],
        edges: [] as never[], // No existing edges
        activeEdgeButtonNodeId: 'node-1',
        activeEdgeButtonHandle: 'source',
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Check that setEdges was called
    expect(mockSetEdges).toHaveBeenCalled()

    // Look for button edge in all calls and verify active state
    const allEdges = edgesCalls.flat()
    const buttonEdge = allEdges.find((e) => (e as { id: string }).id === 'button-node-1') as {
      data: { isActive: boolean }
    }

    // The NEW button edge should have isActive: true because activeEdgeButtonNodeId and handle match
    expect(buttonEdge?.data?.isActive).toBe(true)
  })

  it('handles loop nodes with done and loop handles', () => {
    let capturedEdges: unknown[] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedEdges = updater([])
      }
      return capturedEdges
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [{ id: 'loop-1', type: 'loop', position: { x: 100, y: 100 } }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    const doneEdge = capturedEdges.find((e) => (e as { id: string }).id === 'button-loop-1-done')
    const loopEdge = capturedEdges.find((e) => (e as { id: string }).id === 'button-loop-1-loop')
    expect(doneEdge).toBeDefined()
    expect(loopEdge).toBeDefined()
  })

  it('handles approval nodes with approved and rejected handles', () => {
    let capturedEdges: unknown[] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedEdges = updater([])
      }
      return capturedEdges
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [{ id: 'approval-1', type: 'approval', position: { x: 100, y: 100 } }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    const approvedEdge = capturedEdges.find((e) => (e as { id: string }).id === 'button-approval-1-approved')
    const rejectedEdge = capturedEdges.find((e) => (e as { id: string }).id === 'button-approval-1-rejected')
    expect(approvedEdge).toBeDefined()
    expect(rejectedEdge).toBeDefined()
  })

  it('skips button edge when there is a pending edge', () => {
    let capturedEdges: unknown[] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedEdges = updater([])
      }
      return capturedEdges
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [{ id: 'node-1', type: 'task', position: { x: 100, y: 100 } }] as never[],
        pendingEdge: { sourceNodeId: 'node-1', x: 200, y: 100 },
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Button edge should not be created when there's a pending edge
    const buttonEdge = capturedEdges.find((e) => (e as { id: string }).id === 'button-node-1')
    expect(buttonEdge).toBeUndefined()
  })

  it('resets signature when edges are cleared', () => {
    const { rerender, result } = renderHook(
      ({ edges }) =>
        useButtonEdgeMaintenance({
          ...defaultOptions,
          nodes: [{ id: 'node-1', type: 'task', position: { x: 100, y: 100 } }] as never[],
          edges,
        }),
      { initialProps: { edges: [{ id: 'edge-1' }] as never[] } }
    )

    // Clear edges - hook should handle gracefully
    rerender({ edges: [] as never[] })

    // Hook should still return valid data after edges cleared
    expect(result.current.realNodeIds).toBeDefined()
    expect(result.current.realEdgesSignature).toBeDefined()
    expect(result.current.buttonEdgesSignature).toBeDefined()
  })

  it('calls setNodes to update node className', () => {
    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [{ id: 'node-1', type: 'task', position: { x: 100, y: 100 } }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Check that setNodes was called (for className updates)
    // The hook calls setNodes multiple times - once for placeholders, once for className updates
    expect(mockSetNodes).toHaveBeenCalled()
  })

  it('removes stale button edges when node gets real connection', () => {
    const edgesCalls: unknown[][] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        // Simulate existing button edge and a new real edge
        const result = updater([
          { id: 'button-node-1', type: 'buttonEdge', source: 'node-1' },
          { id: 'edge-1', source: 'node-1', target: 'node-2', sourceHandle: 'source' },
        ])
        edgesCalls.push(result)
        return result
      }
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [
          { id: 'node-1', type: 'task', position: { x: 100, y: 100 } },
          { id: 'node-2', type: 'task', position: { x: 300, y: 100 } },
        ] as never[],
        edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2', sourceHandle: 'source' }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Button edge should be removed since node has a real connection
    expect(mockSetEdges).toHaveBeenCalled()
    const allEdges = edgesCalls.flat()
    const buttonEdge = allEdges.find((e) => (e as { id: string }).id === 'button-node-1')
    expect(buttonEdge).toBeUndefined()
  })

  it('handles nodes with connected handles correctly', () => {
    // This test verifies that the hook processes nodes correctly
    // when some have connections and some don't
    const nodesCalls: unknown[][] = []
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        const result = updater([
          { id: 'node-1', type: 'task', position: { x: 100, y: 100 }, className: '' },
          { id: 'node-2', type: 'task', position: { x: 300, y: 100 }, className: '' },
        ])
        nodesCalls.push(result)
        return result
      }
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [
          { id: 'node-1', type: 'task', position: { x: 100, y: 100 } },
          { id: 'node-2', type: 'task', position: { x: 300, y: 100 } },
        ] as never[],
        edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2', sourceHandle: 'source' }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // The hook should have been called to update nodes
    expect(mockSetNodes).toHaveBeenCalled()
  })

  it('preserves pending-target nodes in node updates', () => {
    const nodesCalls: unknown[][] = []
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        const result = updater([
          { id: 'node-1', type: 'task', position: { x: 100, y: 100 } },
          { id: 'pending-target-node-1', type: 'placeholder', position: { x: 200, y: 100 } },
        ])
        nodesCalls.push(result)
        return result
      }
    })

    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [
          { id: 'node-1', type: 'task', position: { x: 100, y: 100 } },
          { id: 'pending-target-node-1', type: 'placeholder', position: { x: 200, y: 100 } },
        ] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Pending target node should be preserved
    expect(mockSetNodes).toHaveBeenCalled()
    const allNodes = nodesCalls.flat()
    const pendingNode = allNodes.find((n) => (n as { id: string }).id === 'pending-target-node-1')
    expect(pendingNode).toBeDefined()
  })

  it('handles empty real nodes gracefully', () => {
    renderHook(() =>
      useButtonEdgeMaintenance({
        ...defaultOptions,
        nodes: [{ id: 'placeholder-node-1', type: 'placeholder', position: { x: 100, y: 100 } }] as never[],
      })
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Should not throw - handles empty real nodes case
    expect(mockSetEdges).not.toHaveBeenCalled()
  })
})
