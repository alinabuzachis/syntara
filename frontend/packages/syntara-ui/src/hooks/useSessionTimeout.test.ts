import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RETURN_TO_KEY,
  SESSION_EXPIRED_KEY,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_BEFORE_MS,
} from '../components/session/sessionTimeoutConstants'

import { useSessionTimeout } from './useSessionTimeout'

const mockRefresh = vi.fn(() => Promise.resolve())
const mockLogout = vi.fn(() => Promise.resolve())

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      refresh: mockRefresh,
      logout: mockLogout,
    }),
}))

describe('useSessionTimeout', () => {
  const idleBeforeWarningMs = SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_BEFORE_MS

  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    mockRefresh.mockClear()
    mockLogout.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in the active phase', () => {
    const { result } = renderHook(() => useSessionTimeout())

    expect(result.current.phase).toBe('active')
  })

  it('transitions to warning phase after idle period', async () => {
    const { result } = renderHook(() => useSessionTimeout())

    await act(() => vi.advanceTimersByTime(idleBeforeWarningMs))

    expect(result.current.phase).toBe('warning')
  })

  it('provides a countdown in seconds during warning phase', async () => {
    const { result } = renderHook(() => useSessionTimeout())

    await act(() => vi.advanceTimersByTime(idleBeforeWarningMs))

    expect(result.current.remainingSeconds).toBe(Math.ceil(SESSION_WARNING_BEFORE_MS / 1000))
  })

  it('decrements the countdown each second', async () => {
    const { result } = renderHook(() => useSessionTimeout())

    await act(() => vi.advanceTimersByTime(idleBeforeWarningMs))
    const initial = result.current.remainingSeconds

    await act(() => vi.advanceTimersByTime(1000))

    expect(result.current.remainingSeconds).toBeLessThan(initial)
  })

  it('transitions to expired and calls logout when countdown reaches zero', async () => {
    const { result } = renderHook(() => useSessionTimeout())

    await act(() => vi.advanceTimersByTime(idleBeforeWarningMs + SESSION_WARNING_BEFORE_MS))

    expect(result.current.phase).toBe('expired')
    expect(mockLogout).toHaveBeenCalled()
  })

  it('sets sessionStorage flags on timeout logout', async () => {
    renderHook(() => useSessionTimeout())

    await act(() => vi.advanceTimersByTime(idleBeforeWarningMs + SESSION_WARNING_BEFORE_MS))

    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBe('1')
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeTruthy()
  })

  it('continueSession resets to active phase and calls refresh', async () => {
    const { result } = renderHook(() => useSessionTimeout())

    await act(() => vi.advanceTimersByTime(idleBeforeWarningMs))
    expect(result.current.phase).toBe('warning')

    act(() => {
      result.current.continueSession()
    })

    expect(result.current.phase).toBe('active')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('logOut immediately transitions to expired without setting session expired flag', async () => {
    const { result } = renderHook(() => useSessionTimeout())

    await act(() => vi.advanceTimersByTime(idleBeforeWarningMs))

    act(() => {
      result.current.logOut()
    })

    expect(result.current.phase).toBe('expired')
    expect(mockLogout).toHaveBeenCalled()
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull()
  })
})
