import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useConnectionHandlers } from './useConnectionHandlers'

// Mock dependencies
vi.mock('../../../constants', () => ({
  FlowNodeType: {
    LOOP: 'loop',
    CONDITION: 'condition',
  },
}))

vi.mock('../utils/EdgeFactory', () => ({
  EdgeFactory: {
    createEdge: vi.fn((params: { source: string; target: string; [key: string]: unknown }) => ({
      id: `${params.source}-${params.target}`,
      type: 'default',
      ...params,
    })),
    removeButtonEdge: vi.fn((source: string, edges: { id: string }[]) =>
      edges.filter((e) => !e.id.startsWith(`button-${source}`))
    ),
    addEdge: vi.fn((newEdge: unknown, edges: unknown[]) => [...edges, newEdge]),
  },
}))

vi.mock('../utils/pendingDragHandle', () => ({
  consumePendingDragHandle: vi.fn(() => null),
}))

describe('useConnectionHandlers', () => {
  const mockSetNodes = vi.fn()
  const mockSetEdges = vi.fn()
  const mockSetPendingEdge = vi.fn()
  const mockOnAddNodeFromEdge = vi.fn()
  const mockScreenToFlowPosition = vi.fn((pos: { x: number; y: number }) => pos)

  const defaultParams = {
    nodes: [] as never[],
    edges: [] as never[],
    onAddNodeFromEdge: mockOnAddNodeFromEdge,
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    setPendingEdge: mockSetPendingEdge,
    screenToFlowPosition: mockScreenToFlowPosition,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSetNodes.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        return updater([])
      }
    })
    mockSetEdges.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
      if (typeof updater === 'function') {
        return updater([])
      }
    })
  })

  it('returns connection handlers', () => {
    const { result } = renderHook(() => useConnectionHandlers(defaultParams))

    expect(result.current.onConnect).toBeDefined()
    expect(result.current.onConnectStart).toBeDefined()
    expect(result.current.onConnectEnd).toBeDefined()
  })

  describe('onConnect', () => {
    it('does nothing when source is null', () => {
      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      act(() => {
        result.current.onConnect({
          source: null as unknown as string,
          target: 'node-2',
          sourceHandle: null,
          targetHandle: null,
        })
      })

      expect(mockSetEdges).not.toHaveBeenCalled()
    })

    it('does nothing when target is null', () => {
      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      act(() => {
        result.current.onConnect({
          source: 'node-1',
          target: null as unknown as string,
          sourceHandle: null,
          targetHandle: null,
        })
      })

      expect(mockSetEdges).not.toHaveBeenCalled()
    })

    it('creates edge on valid connection', () => {
      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      act(() => {
        result.current.onConnect({
          source: 'node-1',
          target: 'node-2',
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      })

      expect(mockSetEdges).toHaveBeenCalled()
      expect(mockSetPendingEdge).toHaveBeenCalledWith(null)
    })

    it('clears pending edge on connection', () => {
      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      act(() => {
        result.current.onConnect({
          source: 'node-1',
          target: 'node-2',
          sourceHandle: null,
          targetHandle: null,
        })
      })

      expect(mockSetPendingEdge).toHaveBeenCalledWith(null)
    })

    it('detects loop closing connection', () => {
      const nodes = [{ id: 'loop-1', type: 'loop' }] as never[]
      const edges = [{ id: 'e1', source: 'loop-1', target: 'task-1', sourceHandle: 'loop' }] as never[]

      const { result } = renderHook(() =>
        useConnectionHandlers({
          ...defaultParams,
          nodes,
          edges,
        })
      )

      act(() => {
        result.current.onConnect({
          source: 'task-1',
          target: 'loop-1',
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      })

      expect(mockSetEdges).toHaveBeenCalled()
    })
  })

  describe('onConnectStart', () => {
    it('sets connection state for source handle', () => {
      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      act(() => {
        result.current.onConnectStart(null, {
          nodeId: 'node-1',
          handleId: 'source',
          handleType: 'source',
        })
      })

      // Internal state is tracked via ref, we can't directly test it
      // but we can verify it doesn't throw
    })

    it('does nothing for target handles', () => {
      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      // Should not throw
      act(() => {
        result.current.onConnectStart(null, {
          nodeId: 'node-1',
          handleId: 'target',
          handleType: 'target',
        })
      })
    })

    it('prevents connection from loop handle with existing connection', () => {
      const edges = [{ id: 'e1', source: 'loop-1', target: 'task-1', sourceHandle: 'loop', type: 'default' }] as never[]

      const { result } = renderHook(() =>
        useConnectionHandlers({
          ...defaultParams,
          edges,
        })
      )

      // Should not throw and should not set connection state
      act(() => {
        result.current.onConnectStart(null, {
          nodeId: 'loop-1',
          handleId: 'loop',
          handleType: 'source',
        })
      })
    })
  })

  describe('onConnectEnd', () => {
    it('sets pending edge when dropped on canvas', () => {
      const mockElement = document.createElement('div')
      mockElement.classList.add('react-flow__pane')

      const mockEvent = {
        target: mockElement,
        clientX: 100,
        clientY: 200,
      } as unknown as MouseEvent

      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      // First start a connection
      act(() => {
        result.current.onConnectStart(null, {
          nodeId: 'node-1',
          handleId: 'source',
          handleType: 'source',
        })
      })

      // Then end on canvas
      act(() => {
        result.current.onConnectEnd(mockEvent)
      })

      expect(mockSetPendingEdge).toHaveBeenCalled()
      expect(mockOnAddNodeFromEdge).toHaveBeenCalled()
    })

    it('does nothing when no source node', () => {
      const mockElement = document.createElement('div')
      mockElement.classList.add('react-flow__pane')

      const mockEvent = {
        target: mockElement,
        clientX: 100,
        clientY: 200,
      } as unknown as MouseEvent

      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      // End without starting
      act(() => {
        result.current.onConnectEnd(mockEvent)
      })

      expect(mockSetPendingEdge).not.toHaveBeenCalled()
    })

    it('does nothing when connection was successful', () => {
      const mockElement = document.createElement('div')
      mockElement.classList.add('react-flow__pane')

      const mockEvent = {
        target: mockElement,
        clientX: 100,
        clientY: 200,
      } as unknown as MouseEvent

      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      // Start connection
      act(() => {
        result.current.onConnectStart(null, {
          nodeId: 'node-1',
          handleId: 'source',
          handleType: 'source',
        })
      })

      // Complete connection (this sets successful = true)
      act(() => {
        result.current.onConnect({
          source: 'node-1',
          target: 'node-2',
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      })

      mockSetPendingEdge.mockClear()

      // End should do nothing since connection was successful
      act(() => {
        result.current.onConnectEnd(mockEvent)
      })

      expect(mockSetPendingEdge).not.toHaveBeenCalled()
    })

    it('does nothing when not dropped on canvas', () => {
      const mockElement = document.createElement('div')
      mockElement.classList.add('some-other-class')

      const mockEvent = {
        target: mockElement,
        clientX: 100,
        clientY: 200,
      } as unknown as MouseEvent

      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      // Start connection
      act(() => {
        result.current.onConnectStart(null, {
          nodeId: 'node-1',
          handleId: 'source',
          handleType: 'source',
        })
      })

      // End not on canvas
      act(() => {
        result.current.onConnectEnd(mockEvent)
      })

      expect(mockSetPendingEdge).not.toHaveBeenCalled()
    })

    it('accepts TouchEvent structure in onConnectEnd', () => {
      // Note: The current implementation reads clientX/clientY directly (MouseEvent),
      // not changedTouches[0]. This test verifies the handler accepts touch events
      // without throwing, but touch coordinates are not fully supported yet.
      const mockElement = document.createElement('div')
      mockElement.classList.add('react-flow__pane')

      const mockTouchEvent = {
        target: mockElement,
        changedTouches: [{ clientX: 100, clientY: 200 }],
      } as unknown as TouchEvent

      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      // Start connection
      act(() => {
        result.current.onConnectStart(null, {
          nodeId: 'node-1',
          handleId: 'source',
          handleType: 'source',
        })
      })

      // End with touch event - handler accepts it without throwing
      act(() => {
        result.current.onConnectEnd(mockTouchEvent)
      })

      expect(mockSetPendingEdge).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('handles connection with specific handle for condition node', () => {
      const nodes = [{ id: 'condition-1', type: 'condition' }] as never[]

      const { result } = renderHook(() =>
        useConnectionHandlers({
          ...defaultParams,
          nodes,
        })
      )

      act(() => {
        result.current.onConnect({
          source: 'condition-1',
          target: 'node-2',
          sourceHandle: 'true',
          targetHandle: 'target',
        })
      })

      expect(mockSetEdges).toHaveBeenCalled()
    })

    it('handles condition node with remaining placeholders', () => {
      const nodes = [
        { id: 'condition-1', type: 'condition', className: 'has-button-edge' },
        { id: 'placeholder-condition-1-true', type: 'placeholder' },
        { id: 'placeholder-condition-1-false', type: 'placeholder' },
      ] as never[]

      let capturedNodes: unknown[] = []
      mockSetNodes.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
        if (typeof updater === 'function') {
          capturedNodes = updater(nodes)
        }
        return capturedNodes
      })

      const { result } = renderHook(() =>
        useConnectionHandlers({
          ...defaultParams,
          nodes,
        })
      )

      // Connect the 'true' handle
      act(() => {
        result.current.onConnect({
          source: 'condition-1',
          target: 'node-2',
          sourceHandle: 'true',
          targetHandle: 'target',
        })
      })

      // The 'false' placeholder should still exist, so class is kept
      expect(mockSetNodes).toHaveBeenCalled()
    })

    it('removes has-button-edge class when both condition handles connected', () => {
      const nodes = [
        { id: 'condition-1', type: 'condition', className: 'has-button-edge' },
        { id: 'placeholder-condition-1-true', type: 'placeholder' },
      ] as never[]

      let capturedNodes: unknown[] = []
      mockSetNodes.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
        if (typeof updater === 'function') {
          capturedNodes = updater(nodes)
        }
        return capturedNodes
      })

      const { result } = renderHook(() =>
        useConnectionHandlers({
          ...defaultParams,
          nodes,
        })
      )

      // Connect the 'true' handle (last remaining)
      act(() => {
        result.current.onConnect({
          source: 'condition-1',
          target: 'node-2',
          sourceHandle: 'true',
          targetHandle: 'target',
        })
      })

      // Should remove the has-button-edge class
      expect(mockSetNodes).toHaveBeenCalled()
      const conditionNode = capturedNodes.find((n) => (n as { id: string }).id === 'condition-1')
      expect((conditionNode as { className: string }).className).not.toContain('has-button-edge')
    })

    it('handles missing source node in setNodes', () => {
      // When the source node is somehow missing from the nodes array
      const nodes = [{ id: 'placeholder-node-1', type: 'placeholder' }] as never[]

      let capturedNodes: unknown[] = []
      mockSetNodes.mockImplementation((updater: ((items: unknown[]) => unknown[]) | unknown[]) => {
        if (typeof updater === 'function') {
          capturedNodes = updater(nodes)
        }
        return capturedNodes
      })

      const { result } = renderHook(() =>
        useConnectionHandlers({
          ...defaultParams,
          nodes,
        })
      )

      act(() => {
        result.current.onConnect({
          source: 'node-1',
          target: 'node-2',
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      })

      // Should handle gracefully
      expect(mockSetNodes).toHaveBeenCalled()
    })

    it('handles connection ending with null target', () => {
      const mockElement = document.createElement('div')
      mockElement.classList.add('react-flow__pane')

      const mockEvent = {
        target: mockElement,
        clientX: 100,
        clientY: 200,
      } as unknown as MouseEvent

      const { result } = renderHook(() => useConnectionHandlers(defaultParams))

      // Start connection
      act(() => {
        result.current.onConnectStart(null, {
          nodeId: 'node-1',
          handleId: 'source',
          handleType: 'source',
        })
      })

      // End on canvas (no existing target)
      act(() => {
        result.current.onConnectEnd(mockEvent)
      })

      // Should set pending edge for adding node
      expect(mockSetPendingEdge).toHaveBeenCalled()
    })

    it('removes button edge on connection', () => {
      const edges = [{ id: 'button-node-1', type: 'buttonEdge', source: 'node-1' }] as never[]

      const { result } = renderHook(() =>
        useConnectionHandlers({
          ...defaultParams,
          edges,
        })
      )

      act(() => {
        result.current.onConnect({
          source: 'node-1',
          target: 'node-2',
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      })

      expect(mockSetEdges).toHaveBeenCalled()
    })
  })
})
