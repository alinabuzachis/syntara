import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { useResizeObserver } from './useResizeObserver'

describe('useResizeObserver', () => {
  let mockObserve: ReturnType<typeof vi.fn>
  let mockDisconnect: ReturnType<typeof vi.fn>
  let mockCallback: (entries: ResizeObserverEntry[]) => void

  beforeEach(() => {
    mockObserve = vi.fn()
    mockDisconnect = vi.fn()

    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(callback: (entries: ResizeObserverEntry[]) => void) {
          mockCallback = callback
        }
        observe = mockObserve
        disconnect = mockDisconnect
        unobserve = vi.fn()
      }
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observes element when ref is set', () => {
    const element = document.createElement('div')
    const callback = vi.fn()

    renderHook(() => {
      const ref = useRef<HTMLElement>(element)
      useResizeObserver(ref, callback)
      return ref
    })

    expect(mockObserve).toHaveBeenCalledWith(element)
  })

  it('does not observe when ref is null', () => {
    const callback = vi.fn()

    renderHook(() => {
      const ref = useRef<HTMLElement>(null)
      useResizeObserver(ref, callback)
      return ref
    })

    expect(mockObserve).not.toHaveBeenCalled()
  })

  it('calls callback when resize is observed', () => {
    const element = document.createElement('div')
    const callback = vi.fn()

    renderHook(() => {
      const ref = useRef<HTMLElement>(element)
      useResizeObserver(ref, callback)
      return ref
    })

    const mockEntry = {
      target: element,
      contentRect: { width: 100, height: 200 },
    } as unknown as ResizeObserverEntry

    mockCallback([mockEntry])

    expect(callback).toHaveBeenCalledWith(mockEntry)
  })

  it('calls callback for each entry', () => {
    const element = document.createElement('div')
    const callback = vi.fn()

    renderHook(() => {
      const ref = useRef<HTMLElement>(element)
      useResizeObserver(ref, callback)
      return ref
    })

    const entry1 = { target: element } as unknown as ResizeObserverEntry
    const entry2 = { target: element } as unknown as ResizeObserverEntry

    mockCallback([entry1, entry2])

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenNthCalledWith(1, entry1)
    expect(callback).toHaveBeenNthCalledWith(2, entry2)
  })

  it('disconnects observer on unmount', () => {
    const element = document.createElement('div')
    const callback = vi.fn()

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement>(element)
      useResizeObserver(ref, callback)
      return ref
    })

    unmount()

    expect(mockDisconnect).toHaveBeenCalled()
  })
})
