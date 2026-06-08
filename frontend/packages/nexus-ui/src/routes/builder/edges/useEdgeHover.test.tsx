import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { useEdgeHover, useEdgeSourceHandle } from './useEdgeHover'

// Mock @xyflow/react
const mockGetEdge = vi.fn()
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    getEdge: mockGetEdge,
  }),
}))

describe('useEdgeHover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with isHovered and isEdgeHovered as false', () => {
    const { result } = renderHook(() => useEdgeHover())
    expect(result.current.isHovered).toBe(false)
    expect(result.current.isEdgeHovered).toBe(false)
  })

  it('sets isHovered and isEdgeHovered to true on edge mouse enter', () => {
    const { result } = renderHook(() => useEdgeHover())

    act(() => {
      result.current.handleEdgeMouseEnter()
    })

    expect(result.current.isHovered).toBe(true)
    expect(result.current.isEdgeHovered).toBe(true)
  })

  it('sets isEdgeHovered to false immediately on mouse leave', () => {
    const { result } = renderHook(() => useEdgeHover())

    act(() => {
      result.current.handleEdgeMouseEnter()
    })

    act(() => {
      result.current.handleEdgeMouseLeave()
    })

    expect(result.current.isEdgeHovered).toBe(false)
    expect(result.current.isHovered).toBe(true) // Still true until timeout
  })

  it('sets isHovered to false after timeout on mouse leave', () => {
    const { result } = renderHook(() => useEdgeHover())

    act(() => {
      result.current.handleEdgeMouseEnter()
    })

    act(() => {
      result.current.handleEdgeMouseLeave()
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current.isHovered).toBe(false)
  })

  it('cancels timeout when re-entering edge', () => {
    const { result } = renderHook(() => useEdgeHover())

    act(() => {
      result.current.handleEdgeMouseEnter()
    })

    act(() => {
      result.current.handleEdgeMouseLeave()
    })

    // Re-enter before timeout
    act(() => {
      vi.advanceTimersByTime(100)
      result.current.handleEdgeMouseEnter()
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current.isHovered).toBe(true)
  })

  it('handles button mouse enter same as edge', () => {
    const { result } = renderHook(() => useEdgeHover())

    act(() => {
      result.current.handleButtonMouseEnter()
    })

    expect(result.current.isHovered).toBe(true)
    expect(result.current.isEdgeHovered).toBe(true)
  })

  it('handles button mouse leave same as edge', () => {
    const { result } = renderHook(() => useEdgeHover())

    act(() => {
      result.current.handleButtonMouseEnter()
    })

    act(() => {
      result.current.handleButtonMouseLeave()
    })

    expect(result.current.isEdgeHovered).toBe(false)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current.isHovered).toBe(false)
  })
})

describe('useEdgeSourceHandle', () => {
  it('returns sourceHandle from edge', () => {
    mockGetEdge.mockReturnValue({ sourceHandle: 'handle-1' })

    const { result } = renderHook(() => useEdgeSourceHandle('edge-1'))

    expect(result.current).toBe('handle-1')
    expect(mockGetEdge).toHaveBeenCalledWith('edge-1')
  })

  it('returns undefined when edge has no sourceHandle', () => {
    mockGetEdge.mockReturnValue({ id: 'edge-1' })

    const { result } = renderHook(() => useEdgeSourceHandle('edge-1'))

    expect(result.current).toBeUndefined()
  })

  it('returns undefined when edge not found', () => {
    mockGetEdge.mockReturnValue(undefined)

    const { result } = renderHook(() => useEdgeSourceHandle('edge-1'))

    expect(result.current).toBeUndefined()
  })
})
