import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useNodePositioning } from './useNodePositioning'

describe('useNodePositioning', () => {
  const mockSetNodes = vi.fn()
  const mockGetViewport = vi.fn(() => ({ x: 0, y: 0, zoom: 1 }))
  const mockUpdateNode = vi.fn()
  const mockContainerRef = { current: { clientWidth: 1000 } as HTMLDivElement }
  const newlyAddedNodeIdsRef = { current: new Set<string>() }

  const defaultParams = {
    nodes: [] as never[],
    edges: [] as never[],
    isInitialized: true,
    newlyAddedNodeIdsRef,
    containerRef: mockContainerRef,
    setNodes: mockSetNodes,
    getViewport: mockGetViewport,
    updateNode: mockUpdateNode,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    newlyAddedNodeIdsRef.current = new Set()
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        return updater([])
      }
    })
  })

  it('does nothing when no newly added nodes', () => {
    renderHook(() => useNodePositioning(defaultParams))

    expect(mockSetNodes).not.toHaveBeenCalled()
  })

  it('does nothing when not initialized', () => {
    newlyAddedNodeIdsRef.current.add('node-1')

    renderHook(() =>
      useNodePositioning({
        ...defaultParams,
        isInitialized: false,
      })
    )

    expect(mockSetNodes).not.toHaveBeenCalled()
  })

  it('positions regular nodes on right side of viewport', () => {
    const nodes = [
      { id: 'node-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } },
    ] as never[]
    newlyAddedNodeIdsRef.current.add('node-1')

    let capturedNodes: unknown[] = []
    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        capturedNodes = updater(nodes)
      }
    })

    renderHook(() =>
      useNodePositioning({
        ...defaultParams,
        nodes,
      })
    )

    expect(mockSetNodes).toHaveBeenCalled()
    const positionedNode = capturedNodes.find((n) => (n as { id: string }).id === 'node-1') as {
      position: { x: number; y: number }
    }
    expect(positionedNode?.position.x).toBeGreaterThan(0)
  })

  it('positions loop nodes on left side of viewport', () => {
    const nodes = [
      { id: 'loop-1', type: 'loop', position: { x: 0, y: 0 }, measured: { width: 240, height: 100 } },
      { id: 'body-1', type: 'task', position: { x: 340, y: 0 }, measured: { width: 100, height: 50 } },
    ] as never[]
    const edges = [{ id: 'e1', source: 'loop-1', target: 'body-1', sourceHandle: 'loop' }] as never[]

    newlyAddedNodeIdsRef.current.add('loop-1')
    newlyAddedNodeIdsRef.current.add('body-1')

    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        updater(nodes)
      }
    })

    renderHook(() =>
      useNodePositioning({
        ...defaultParams,
        nodes,
        edges,
      })
    )

    expect(mockSetNodes).toHaveBeenCalled()
  })

  it('removes node from tracking after positioning', () => {
    const nodes = [
      { id: 'node-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } },
    ] as never[]
    newlyAddedNodeIdsRef.current.add('node-1')

    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        updater(nodes)
      }
    })

    renderHook(() =>
      useNodePositioning({
        ...defaultParams,
        nodes,
      })
    )

    expect(newlyAddedNodeIdsRef.current.has('node-1')).toBe(false)
  })

  it('skips nodes that are not measured', () => {
    const nodes = [{ id: 'node-1', type: 'task', position: { x: 0, y: 0 } }] as never[]
    newlyAddedNodeIdsRef.current.add('node-1')

    renderHook(() =>
      useNodePositioning({
        ...defaultParams,
        nodes,
      })
    )

    // Should not be processed (no measured property)
    expect(newlyAddedNodeIdsRef.current.has('node-1')).toBe(true)
  })

  it('skips nodes that already have position', () => {
    const nodes = [
      { id: 'node-1', type: 'task', position: { x: 100, y: 100 }, measured: { width: 100, height: 50 } },
    ] as never[]
    newlyAddedNodeIdsRef.current.add('node-1')

    renderHook(() =>
      useNodePositioning({
        ...defaultParams,
        nodes,
      })
    )

    // Should not be processed (already has position)
    expect(newlyAddedNodeIdsRef.current.has('node-1')).toBe(true)
  })

  it('uses window.innerWidth when container is not available', () => {
    const nodes = [
      { id: 'node-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } },
    ] as never[]
    newlyAddedNodeIdsRef.current.add('node-1')

    mockSetNodes.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        updater(nodes)
      }
    })

    renderHook(() =>
      useNodePositioning({
        ...defaultParams,
        nodes,
        containerRef: { current: null },
      })
    )

    expect(mockSetNodes).toHaveBeenCalled()
  })
})
