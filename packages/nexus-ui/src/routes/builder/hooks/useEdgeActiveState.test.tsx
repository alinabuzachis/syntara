import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useEdgeActiveState } from './useEdgeActiveState'

// Mock dependencies
vi.mock('../utils/workflowToGraph', () => ({
  markerEnd: 'url(#arrow)',
}))

describe('useEdgeActiveState', () => {
  const mockSetEdges = vi.fn()
  const mockOnAddNodeFromEdge = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        return updater([])
      }
    })
  })

  it('does nothing when not initialized', () => {
    renderHook(() =>
      useEdgeActiveState({
        isInitialized: false,
        activeEdgeId: null,
        activeEdgeButtonNodeId: null,
        activeEdgeButtonHandle: null,
        onAddNodeFromEdge: mockOnAddNodeFromEdge,
        setEdges: mockSetEdges,
      })
    )

    // First effect runs but second should skip
    expect(mockSetEdges).toHaveBeenCalled()
  })

  it('updates default edges with onAddNode and markerEnd', () => {
    // Track all calls to setEdges
    const calls: unknown[][] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        const result = updater([{ id: 'edge-1', type: 'default', data: {} }])
        calls.push(result)
        return result
      }
    })

    renderHook(() =>
      useEdgeActiveState({
        isInitialized: true,
        activeEdgeId: null,
        activeEdgeButtonNodeId: null,
        activeEdgeButtonHandle: null,
        onAddNodeFromEdge: mockOnAddNodeFromEdge,
        setEdges: mockSetEdges,
      })
    )

    // First effect updates default edges
    const firstCall = calls[0]
    expect(firstCall).toHaveLength(1)
    expect((firstCall[0] as { markerEnd: string }).markerEnd).toBe('url(#arrow)')
  })

  it('sets isActive true when activeEdgeId matches', () => {
    // Track all calls to setEdges
    const calls: unknown[][] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        const result = updater([{ id: 'edge-1', type: 'default', data: {} }])
        calls.push(result)
        return result
      }
    })

    renderHook(() =>
      useEdgeActiveState({
        isInitialized: true,
        activeEdgeId: 'edge-1',
        activeEdgeButtonNodeId: null,
        activeEdgeButtonHandle: null,
        onAddNodeFromEdge: mockOnAddNodeFromEdge,
        setEdges: mockSetEdges,
      })
    )

    // First effect updates default edges with isActive
    const firstCall = calls[0]
    expect((firstCall[0] as { data: { isActive: boolean } }).data.isActive).toBe(true)
  })

  it('updates loop edge types', () => {
    // Track all calls to setEdges
    const calls: unknown[][] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        const result = updater([
          { id: 'edge-1', type: 'loopBack', data: {} },
          { id: 'edge-2', type: 'loopOutgoing', data: {} },
          { id: 'edge-3', type: 'loopDone', data: {} },
        ])
        calls.push(result)
        return result
      }
    })

    renderHook(() =>
      useEdgeActiveState({
        isInitialized: true,
        activeEdgeId: null,
        activeEdgeButtonNodeId: null,
        activeEdgeButtonHandle: null,
        onAddNodeFromEdge: mockOnAddNodeFromEdge,
        setEdges: mockSetEdges,
      })
    )

    // First effect updates loop edges with markerEnd
    const firstCall = calls[0]
    expect(firstCall).toHaveLength(3)
    firstCall.forEach((edge) => {
      expect((edge as { markerEnd: string }).markerEnd).toBe('url(#arrow)')
    })
  })

  it('updates button edge active state', () => {
    // Track all calls to setEdges
    const calls: unknown[][] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        const result = updater([{ id: 'button-node-1', type: 'buttonEdge', source: 'node-1', data: {} }])
        calls.push(result)
        return result
      }
    })

    renderHook(() =>
      useEdgeActiveState({
        isInitialized: true,
        activeEdgeId: null,
        activeEdgeButtonNodeId: 'node-1',
        activeEdgeButtonHandle: 'source',
        onAddNodeFromEdge: mockOnAddNodeFromEdge,
        setEdges: mockSetEdges,
      })
    )

    // Second effect updates button edges - find it by looking at all calls
    // The second call should be from the button edge effect
    const secondCall = calls[1]
    const buttonEdge = secondCall?.find((e) => (e as { type: string }).type === 'buttonEdge') as {
      data: { isActive: boolean }
    }
    expect(buttonEdge?.data?.isActive).toBe(true)
  })

  it('handles specific handles for condition nodes', () => {
    // Track all calls to setEdges
    const calls: unknown[][] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        const result = updater([
          { id: 'button-node-1-true', type: 'buttonEdge', source: 'node-1', sourceHandle: 'true', data: {} },
        ])
        calls.push(result)
        return result
      }
    })

    renderHook(() =>
      useEdgeActiveState({
        isInitialized: true,
        activeEdgeId: null,
        activeEdgeButtonNodeId: 'node-1',
        activeEdgeButtonHandle: 'true',
        onAddNodeFromEdge: mockOnAddNodeFromEdge,
        setEdges: mockSetEdges,
      })
    )

    // Second effect updates button edges
    const secondCall = calls[1]
    const buttonEdge = secondCall?.[0] as { data: { isActive: boolean } }
    expect(buttonEdge?.data?.isActive).toBe(true)
  })

  it('does not set active for mismatched specific handle', () => {
    // Track all calls to setEdges
    const calls: unknown[][] = []
    mockSetEdges.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        const result = updater([
          { id: 'button-node-1-true', type: 'buttonEdge', source: 'node-1', sourceHandle: 'true', data: {} },
        ])
        calls.push(result)
        return result
      }
    })

    renderHook(() =>
      useEdgeActiveState({
        isInitialized: true,
        activeEdgeId: null,
        activeEdgeButtonNodeId: 'node-1',
        activeEdgeButtonHandle: 'false', // Mismatched
        onAddNodeFromEdge: mockOnAddNodeFromEdge,
        setEdges: mockSetEdges,
      })
    )

    // Second effect updates button edges
    const secondCall = calls[1]
    const buttonEdge = secondCall?.[0] as { data: { isActive: boolean } }
    expect(buttonEdge?.data?.isActive).toBe(false)
  })
})
