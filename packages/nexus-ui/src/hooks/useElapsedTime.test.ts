import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useElapsedTime } from './useElapsedTime'

describe('useElapsedTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:01:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([null, undefined])('returns undefined when startedAt is %s', (startedAt) => {
    const { result } = renderHook(() => useElapsedTime(startedAt, null, false))
    expect(result.current.elapsedMs).toBeUndefined()
  })

  it('returns undefined when not running and no completedAt', () => {
    const { result } = renderHook(() => useElapsedTime('2024-01-01T00:00:00Z', null, false))
    expect(result.current.elapsedMs).toBeUndefined()
  })

  it('computes elapsed from startedAt to completedAt', () => {
    const { result } = renderHook(() => useElapsedTime('2024-01-01T00:00:00Z', '2024-01-01T00:00:30Z', false))
    expect(result.current.elapsedMs).toBe(30000)
  })

  it('treats epoch (1970-01-01T00:00:00Z) as a valid startedAt', () => {
    const { result } = renderHook(() => useElapsedTime('1970-01-01T00:00:00Z', '1970-01-01T00:00:30Z', false))
    expect(result.current.elapsedMs).toBe(30000)
  })

  it('computes elapsed from startedAt to now while running', () => {
    const { result } = renderHook(() => useElapsedTime('2024-01-01T00:00:00Z', null, true))
    expect(result.current.elapsedMs).toBe(60000)
  })

  it('ticks every second while running', () => {
    const { result } = renderHook(() => useElapsedTime('2024-01-01T00:00:00Z', null, true))

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.elapsedMs).toBe(63000)
  })

  it('uses completedAt and stops ticking even when isRunning is true', () => {
    const { result } = renderHook(() => useElapsedTime('2024-01-01T00:00:00Z', '2024-01-01T00:00:30Z', true))
    expect(result.current.elapsedMs).toBe(30000)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.elapsedMs).toBe(30000)
  })

  it('exposes a stable now timestamp', () => {
    const { result } = renderHook(() => useElapsedTime('2024-01-01T00:00:00Z', null, true))
    expect(result.current.now).toBeTypeOf('number')
  })
})
