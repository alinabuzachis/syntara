import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useNodeUpdates } from './useNodeUpdates'

describe('useNodeUpdates', () => {
  const mockSetNodes = vi.fn()
  const mockSetEdges = vi.fn()
  const mockOnNewNodesAdded = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
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

  it('returns refs for tracking', () => {
    const { result } = renderHook(() =>
      useNodeUpdates({
        initialNodes: [],
        initialEdges: [],
        isInitialized: false,
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
      })
    )

    expect(result.current.previousNodeIdsRef).toBeDefined()
    expect(result.current.newlyAddedNodeIdsRef).toBeDefined()
  })

  it('sets initial nodes when not initialized', () => {
    const initialNodes = [{ id: 'node-1', data: {} }] as never[]

    renderHook(() =>
      useNodeUpdates({
        initialNodes,
        initialEdges: [],
        isInitialized: false,
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
      })
    )

    expect(mockSetNodes).toHaveBeenCalledWith(initialNodes)
  })

  it('tracks new nodes when added', () => {
    const { result, rerender } = renderHook(
      ({ initialNodes }) =>
        useNodeUpdates({
          initialNodes,
          initialEdges: [],
          isInitialized: true,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          onNewNodesAdded: mockOnNewNodesAdded,
        }),
      { initialProps: { initialNodes: [{ id: 'node-1', data: {} }] as never[] } }
    )

    // After initial render, previousNodeIdsRef is empty, so node-1 is considered new
    // Clear any initial calls
    mockOnNewNodesAdded.mockClear()

    // Update the ref manually to simulate that node-1 is already known
    result.current.previousNodeIdsRef.current = new Set(['node-1'])

    // Add a new node
    rerender({
      initialNodes: [
        { id: 'node-1', data: {} },
        { id: 'node-2', data: {} },
      ] as never[],
    })

    expect(result.current.newlyAddedNodeIdsRef.current.has('node-2')).toBe(true)
    expect(mockOnNewNodesAdded).toHaveBeenCalledWith(['node-2'])
  })

  it('handles node deletion', () => {
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        return updater([
          { id: 'node-1', position: { x: 10, y: 20 } },
          { id: 'node-2', position: { x: 30, y: 40 } },
        ])
      }
    })

    const { rerender } = renderHook(
      ({ initialNodes }) =>
        useNodeUpdates({
          initialNodes,
          initialEdges: [],
          isInitialized: true,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
        }),
      {
        initialProps: {
          initialNodes: [
            { id: 'node-1', data: {} },
            { id: 'node-2', data: {} },
          ] as never[],
        },
      }
    )

    // Remove a node
    rerender({ initialNodes: [{ id: 'node-1', data: {} }] as never[] })

    expect(mockSetNodes).toHaveBeenCalled()
  })

  it('preserves existing node positions on update', () => {
    let capturedNodes: unknown[] = []
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedNodes = updater([
          { id: 'node-1', data: { old: true }, position: { x: 100, y: 200 }, measured: { width: 50 } },
        ])
      }
      return capturedNodes
    })

    const { rerender } = renderHook(
      ({ initialNodes }) =>
        useNodeUpdates({
          initialNodes,
          initialEdges: [],
          isInitialized: true,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
        }),
      { initialProps: { initialNodes: [{ id: 'node-1', data: { old: true } }] as never[] } }
    )

    // Update node data
    rerender({ initialNodes: [{ id: 'node-1', data: { old: false } }] as never[] })

    // Position should be preserved
    const node = capturedNodes.find((n) => (n as { id: string }).id === 'node-1') as {
      position: { x: number; y: number }
    }
    expect(node?.position).toEqual({ x: 100, y: 200 })
  })

  it('preserves placeholder nodes not in initialNodes', () => {
    // This test verifies that nodes not in initialNodes (like placeholders) are preserved
    // The hook preserves them in the setNodes updater logic
    const prevNodes = [
      { id: 'node-1', data: {}, position: { x: 0, y: 0 } },
      { id: 'placeholder-node-1', type: 'placeholder', position: { x: 100, y: 100 } },
    ]
    let capturedNodes: unknown[] = []
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedNodes = updater(prevNodes)
      }
      return capturedNodes
    })

    // First render to set up initial state
    const { rerender } = renderHook(
      ({ initialNodes }) =>
        useNodeUpdates({
          initialNodes,
          initialEdges: [],
          isInitialized: true,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
        }),
      { initialProps: { initialNodes: [{ id: 'node-1', data: { old: true } }] as never[] } }
    )

    // Update node data (triggers the preserveNodes logic)
    rerender({ initialNodes: [{ id: 'node-1', data: { old: false } }] as never[] })

    // Placeholder should be preserved
    const placeholder = capturedNodes.find((n) => (n as { id: string }).id === 'placeholder-node-1')
    expect(placeholder).toBeDefined()
  })

  it('does not update when nothing changed', () => {
    const initialNodes = [{ id: 'node-1', type: 'task', data: { name: 'Test' } }] as never[]

    const { rerender } = renderHook(
      ({ initialNodes }) =>
        useNodeUpdates({
          initialNodes,
          initialEdges: [],
          isInitialized: true,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
        }),
      { initialProps: { initialNodes } }
    )

    mockSetNodes.mockClear()

    // Same nodes, same data
    rerender({ initialNodes })

    // Should skip update
    expect(mockSetNodes).not.toHaveBeenCalled()
  })

  it('merges new edges when nodes are added', () => {
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        return updater([{ id: 'edge-1' }])
      }
    })

    const { rerender } = renderHook(
      ({ initialNodes, initialEdges }) =>
        useNodeUpdates({
          initialNodes,
          initialEdges,
          isInitialized: true,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
        }),
      {
        initialProps: {
          initialNodes: [{ id: 'node-1', data: {} }] as never[],
          initialEdges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }] as never[],
        },
      }
    )

    // Add node with new edge
    rerender({
      initialNodes: [
        { id: 'node-1', data: {} },
        { id: 'node-2', data: {} },
      ] as never[],
      initialEdges: [
        { id: 'edge-1', source: 'node-1', target: 'node-2' },
        { id: 'edge-2', source: 'node-2', target: 'node-3' },
      ] as never[],
    })

    expect(mockSetEdges).toHaveBeenCalled()
  })

  it('handles node deletion with position preservation', () => {
    let capturedNodes: unknown[] = []
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedNodes = updater([
          { id: 'node-1', data: {}, position: { x: 10, y: 20 }, measured: { width: 100 } },
          { id: 'node-2', data: {}, position: { x: 30, y: 40 }, measured: { width: 100 } },
        ])
      }
      return capturedNodes
    })

    const { result, rerender } = renderHook(
      ({ initialNodes }) =>
        useNodeUpdates({
          initialNodes,
          initialEdges: [],
          isInitialized: true,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
        }),
      {
        initialProps: {
          initialNodes: [
            { id: 'node-1', data: {} },
            { id: 'node-2', data: {} },
          ] as never[],
        },
      }
    )

    // Set up the previous node IDs
    result.current.previousNodeIdsRef.current = new Set(['node-1', 'node-2'])

    // Remove node-2
    rerender({ initialNodes: [{ id: 'node-1', data: {} }] as never[] })

    expect(mockSetNodes).toHaveBeenCalled()
    // The remaining node should keep its position
    const remainingNode = capturedNodes.find((n) => (n as { id: string }).id === 'node-1')
    expect(remainingNode).toBeDefined()
    expect((remainingNode as { position: { x: number; y: number } }).position).toEqual({ x: 10, y: 20 })
  })

  it('handles data-only changes preserving positions', () => {
    let capturedNodes: unknown[] = []
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedNodes = updater([
          { id: 'node-1', data: { name: 'old' }, position: { x: 50, y: 60 }, measured: { width: 100 } },
        ])
      }
      return capturedNodes
    })

    const { result, rerender } = renderHook(
      ({ initialNodes }) =>
        useNodeUpdates({
          initialNodes,
          initialEdges: [],
          isInitialized: true,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
        }),
      { initialProps: { initialNodes: [{ id: 'node-1', data: { name: 'old' } }] as never[] } }
    )

    // Set up the previous node IDs (same nodes, just data changing)
    result.current.previousNodeIdsRef.current = new Set(['node-1'])

    // Change only the data
    rerender({ initialNodes: [{ id: 'node-1', data: { name: 'new' } }] as never[] })

    // Position should be preserved
    const node = capturedNodes.find((n) => (n as { id: string }).id === 'node-1')
    expect((node as { position: { x: number; y: number } }).position).toEqual({ x: 50, y: 60 })
  })

  it('skips already tracked new nodes', () => {
    const { result, rerender } = renderHook(
      ({ initialNodes }) =>
        useNodeUpdates({
          initialNodes,
          initialEdges: [],
          isInitialized: true,
          setNodes: mockSetNodes,
          setEdges: mockSetEdges,
          onNewNodesAdded: mockOnNewNodesAdded,
        }),
      { initialProps: { initialNodes: [{ id: 'node-1', data: {} }] as never[] } }
    )

    // Set up as if node-1 is known and node-2 is already being tracked
    result.current.previousNodeIdsRef.current = new Set(['node-1'])
    result.current.newlyAddedNodeIdsRef.current = new Set(['node-2'])

    mockOnNewNodesAdded.mockClear()

    // Add node-2 (but it's already tracked)
    rerender({
      initialNodes: [
        { id: 'node-1', data: {} },
        { id: 'node-2', data: {} },
      ] as never[],
    })

    // Should skip because node-2 is already tracked
    expect(mockOnNewNodesAdded).not.toHaveBeenCalled()
  })
})
