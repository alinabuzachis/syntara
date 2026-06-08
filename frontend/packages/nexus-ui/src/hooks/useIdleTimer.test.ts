import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACTIVITY_EVENTS } from '../components/session/sessionTimeoutConstants'

import { useIdleTimer } from './useIdleTimer'

describe('useIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires onIdle after the timeout period', async () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ timeoutMs: 5000, onIdle }))

    expect(onIdle).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTime(5000))

    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('does not fire onIdle before the timeout period', async () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ timeoutMs: 5000, onIdle }))

    await act(() => vi.advanceTimersByTime(4999))

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('resets the timer on user activity', async () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ timeoutMs: 5000, onIdle }))

    await act(() => vi.advanceTimersByTime(3000))
    act(() => {
      document.dispatchEvent(new Event('mousemove'))
    })

    await act(() => vi.advanceTimersByTime(3000))
    expect(onIdle).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTime(2000))
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('listens to all configured activity events', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ timeoutMs: 5000, onIdle }))

    for (const event of ACTIVITY_EVENTS) {
      expect(addSpy).toHaveBeenCalledWith(event, expect.any(Function), { passive: true })
    }
    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    addSpy.mockRestore()
  })

  it('removes event listeners on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const onIdle = vi.fn()
    const { unmount } = renderHook(() => useIdleTimer({ timeoutMs: 5000, onIdle }))

    unmount()

    for (const event of ACTIVITY_EVENTS) {
      expect(removeSpy).toHaveBeenCalledWith(event, expect.any(Function))
    }
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    removeSpy.mockRestore()
  })

  it('does not fire onIdle when disabled', async () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ timeoutMs: 5000, onIdle, enabled: false }))

    await act(() => vi.advanceTimersByTime(10000))

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('fires onActive when activity resumes after idle', async () => {
    const onIdle = vi.fn()
    const onActive = vi.fn()
    renderHook(() => useIdleTimer({ timeoutMs: 1000, onIdle, onActive }))

    await act(() => vi.advanceTimersByTime(1000))
    expect(onIdle).toHaveBeenCalledOnce()

    act(() => {
      document.dispatchEvent(new Event('keydown'))
    })

    expect(onActive).toHaveBeenCalledOnce()
  })

  it('reset() restarts the idle timer', async () => {
    const onIdle = vi.fn()
    const { result } = renderHook(() => useIdleTimer({ timeoutMs: 5000, onIdle }))

    await act(() => vi.advanceTimersByTime(4000))
    act(() => {
      result.current.reset()
    })

    await act(() => vi.advanceTimersByTime(4000))
    expect(onIdle).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTime(1000))
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('resets the timer when tab becomes visible', async () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ timeoutMs: 5000, onIdle }))

    await act(() => vi.advanceTimersByTime(3000))

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await act(() => vi.advanceTimersByTime(3000))
    expect(onIdle).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTime(2000))
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('does not reset the timer when tab becomes hidden', async () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ timeoutMs: 5000, onIdle }))

    await act(() => vi.advanceTimersByTime(3000))

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await act(() => vi.advanceTimersByTime(2000))
    expect(onIdle).toHaveBeenCalledOnce()
  })
})
