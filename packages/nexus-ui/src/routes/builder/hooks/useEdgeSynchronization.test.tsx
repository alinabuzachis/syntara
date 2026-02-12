import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useEdgeSynchronization } from './useEdgeSynchronization'

// Mock dependencies
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: () => ({
      syncConvergeNodeBranches: vi.fn(),
      reorderActivitiesFromEdges: vi.fn(),
    }),
  },
}))

vi.mock('../utils/filterHelpers', () => ({
  isButtonEdge: (edge: { type?: string; id?: string }) => edge.type === 'buttonEdge' || edge.id?.startsWith('button-'),
}))

describe('useEdgeSynchronization', () => {
  const mockSetStoredEdges = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when not initialized', () => {
    const edges = [{ id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' }]

    renderHook(() =>
      useEdgeSynchronization({
        edges: edges as never[],
        isInitialized: false,
        setStoredEdges: mockSetStoredEdges,
      })
    )

    expect(mockSetStoredEdges).not.toHaveBeenCalled()
  })

  it('skips first sync to avoid setting isDirty', () => {
    const edges = [{ id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' }]

    renderHook(() =>
      useEdgeSynchronization({
        edges: edges as never[],
        isInitialized: true,
        setStoredEdges: mockSetStoredEdges,
      })
    )

    expect(mockSetStoredEdges).not.toHaveBeenCalled()
  })

  it('filters out button edges', () => {
    const edges = [
      { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' },
      { id: 'button-node-1', source: 'node-1', target: 'placeholder', type: 'buttonEdge' },
    ]

    const { rerender } = renderHook(
      ({ edges }) =>
        useEdgeSynchronization({
          edges: edges as never[],
          isInitialized: true,
          setStoredEdges: mockSetStoredEdges,
        }),
      { initialProps: { edges } }
    )

    // Trigger second render with changed edges including a button edge to filter
    const newEdges = [
      { id: 'edge-2', source: 'node-2', target: 'node-3', type: 'default' },
      { id: 'button-node-2', source: 'node-2', target: 'placeholder', type: 'buttonEdge' },
    ]
    rerender({ edges: newEdges })

    expect(mockSetStoredEdges).toHaveBeenCalled()
    const calledWith = mockSetStoredEdges.mock.calls[0][0]
    // Verify button edges were filtered out
    expect(calledWith.every((e: { id: string }) => !e.id.startsWith('button-'))).toBe(true)
  })

  it('filters out placeholder edges', () => {
    const edges = [
      { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' },
      { id: 'edge-2', source: 'placeholder-1', target: 'node-2', type: 'default' },
      { id: 'edge-3', source: 'node-1', target: 'placeholder-2', type: 'default' },
    ]

    const { rerender } = renderHook(
      ({ edges }) =>
        useEdgeSynchronization({
          edges: edges as never[],
          isInitialized: true,
          setStoredEdges: mockSetStoredEdges,
        }),
      { initialProps: { edges } }
    )

    // Trigger change with edges including placeholders to filter
    const newEdges = [
      { id: 'edge-new', source: 'node-3', target: 'node-4', type: 'default' },
      { id: 'edge-placeholder', source: 'placeholder-x', target: 'node-5', type: 'default' },
    ]
    rerender({ edges: newEdges })

    expect(mockSetStoredEdges).toHaveBeenCalled()
    const calledWith = mockSetStoredEdges.mock.calls[0][0]
    // Verify placeholder edges were filtered out
    expect(
      calledWith.every(
        (e: { source: string; target: string }) =>
          !e.source.startsWith('placeholder') && !e.target.startsWith('placeholder')
      )
    ).toBe(true)
  })

  it('returns refs for testing', () => {
    const edges = [{ id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' }]

    const { result } = renderHook(() =>
      useEdgeSynchronization({
        edges: edges as never[],
        isInitialized: true,
        setStoredEdges: mockSetStoredEdges,
      })
    )

    expect(result.current.lastEdgesSignatureRef).toBeDefined()
    expect(result.current.isSyncingRef).toBeDefined()
  })

  it('does not sync when edges have not changed', () => {
    const edges = [{ id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' }]

    const { rerender } = renderHook(
      ({ edges }) =>
        useEdgeSynchronization({
          edges: edges as never[],
          isInitialized: true,
          setStoredEdges: mockSetStoredEdges,
        }),
      { initialProps: { edges } }
    )

    // First pass (isFirstSync = true, sets signature)
    // Second pass with same edges
    rerender({ edges })

    // Still should not have been called (first sync skipped, second had no changes)
    expect(mockSetStoredEdges).not.toHaveBeenCalled()
  })
})
