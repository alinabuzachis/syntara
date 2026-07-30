import { EdgeHandleEnum } from '@syntara/contracts'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { usePendingEdgeManagement } from './usePendingEdgeManagement'

// Mock dependencies
vi.mock('../utils/workflowToGraph', () => ({
  markerEnd: 'url(#arrow)',
}))

describe('usePendingEdgeManagement', () => {
  const mockSetNodes = vi.fn()
  const mockSetEdges = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSetNodes.mockImplementation((updater: ((nodes: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        return updater([])
      }
    })
    mockSetEdges.mockImplementation((updater: ((edges: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        return updater([])
      }
    })
  })

  it('does nothing when not initialized', () => {
    renderHook(() =>
      usePendingEdgeManagement({
        pendingEdge: { sourceNodeId: 'node-1', x: 100, y: 50 },
        isInitialized: false,
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
      })
    )

    expect(mockSetNodes).not.toHaveBeenCalled()
  })

  it('creates pending node and edge when pendingEdge is set', () => {
    // The hook calls setNodes and setEdges multiple times
    // We need to track all calls
    const nodesCalls: unknown[][] = []
    const edgesCalls: unknown[][] = []

    mockSetNodes.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        const result = updater([])
        nodesCalls.push(result)
        return result
      }
    })
    mockSetEdges.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        const result = updater([])
        edgesCalls.push(result)
        return result
      }
    })

    renderHook(() =>
      usePendingEdgeManagement({
        pendingEdge: { sourceNodeId: 'node-1', x: 100, y: 50 },
        isInitialized: true,
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
      })
    )

    // Check that setNodes was called (creates pending target node)
    expect(mockSetNodes).toHaveBeenCalled()
    // Check that setEdges was called (creates pending edge)
    expect(mockSetEdges).toHaveBeenCalled()

    // Check pending node created in one of the calls
    const allNodes = nodesCalls.flat()
    expect(allNodes.some((n) => (n as { id: string }).id === 'pending-target-node-1')).toBe(true)
    // Check pending edge created in one of the calls
    const allEdges = edgesCalls.flat()
    expect(allEdges.some((e) => (e as { id: string }).id === 'pending-node-1')).toBe(true)
  })

  it('cleans up pending nodes and edges when pendingEdge is cleared', () => {
    let capturedNodes: unknown[] = []
    let capturedEdges: unknown[] = []

    mockSetNodes.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        capturedNodes = updater([{ id: 'pending-target-node-1', type: 'placeholder' }])
      }
    })
    mockSetEdges.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        capturedEdges = updater([{ id: 'pending-node-1', type: 'default' }])
      }
    })

    renderHook(() =>
      usePendingEdgeManagement({
        pendingEdge: null,
        isInitialized: true,
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
      })
    )

    // Pending nodes should be filtered out
    expect(capturedNodes.every((n) => !(n as { id: string }).id.startsWith('pending-target-'))).toBe(true)
    // Pending edges should be filtered out
    expect(capturedEdges.every((e) => !(e as { id: string }).id.startsWith('pending-'))).toBe(true)
  })

  it('uses condition handle for button edge ID', () => {
    let capturedEdges: unknown[] = []

    mockSetEdges.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        capturedEdges = updater([{ id: 'button-node-1-true', type: 'buttonEdge' }])
      }
    })

    renderHook(() =>
      usePendingEdgeManagement({
        pendingEdge: { sourceNodeId: 'node-1', sourceHandle: 'true', x: 100, y: 50 },
        isInitialized: true,
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
      })
    )

    // Button edge should be filtered out
    expect(capturedEdges.some((e) => (e as { id: string }).id === 'button-node-1-true')).toBe(false)
  })

  it('uses approval handle for button edge ID', () => {
    let capturedEdges: unknown[] = []

    mockSetEdges.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        capturedEdges = updater([{ id: 'button-node-1-approved', type: 'buttonEdge' }])
      }
    })

    renderHook(() =>
      usePendingEdgeManagement({
        pendingEdge: { sourceNodeId: 'node-1', sourceHandle: EdgeHandleEnum.APPROVED, x: 100, y: 50 },
        isInitialized: true,
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
      })
    )

    // Button edge should be filtered out
    expect(capturedEdges.some((e) => (e as { id: string }).id === 'button-node-1-approved')).toBe(false)
  })

  it('removes source placeholder node', () => {
    let lastCapturedNodes: unknown[] = []

    mockSetNodes.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        lastCapturedNodes = updater([
          { id: 'placeholder-node-1', type: 'placeholder' },
          { id: 'other-node', type: 'task' },
        ])
      }
    })

    renderHook(() =>
      usePendingEdgeManagement({
        pendingEdge: { sourceNodeId: 'node-1', x: 100, y: 50 },
        isInitialized: true,
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
      })
    )

    // Last call should filter out placeholder
    expect(lastCapturedNodes.some((n) => (n as { id: string }).id === 'placeholder-node-1')).toBe(false)
  })
})
