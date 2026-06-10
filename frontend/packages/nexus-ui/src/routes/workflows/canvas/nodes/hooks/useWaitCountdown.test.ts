import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivityStatus } from '../../../execution/types'

import { useWaitCountdown } from './useWaitCountdown'

describe('useWaitCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when status is undefined', () => {
    const { result } = renderHook(() => useWaitCountdown(undefined, undefined, 60))

    expect(result.current.remaining).toBeNull()
    expect(result.current.isActive).toBe(false)
  })

  it('returns null when status is completed', () => {
    const { result } = renderHook(() => useWaitCountdown('completed', '2026-01-01T00:00:00Z', 60))

    expect(result.current.remaining).toBeNull()
    expect(result.current.isActive).toBe(false)
  })

  it('returns null when startedAt is missing', () => {
    const { result } = renderHook(() => useWaitCountdown('waiting', undefined, 60))

    expect(result.current.remaining).toBeNull()
    expect(result.current.isActive).toBe(false)
  })

  it('returns null when duration is zero', () => {
    const { result } = renderHook(() => useWaitCountdown('waiting', '2026-01-01T00:00:00Z', 0))

    expect(result.current.remaining).toBeNull()
    expect(result.current.isActive).toBe(false)
  })

  it('shows countdown when waiting with valid startedAt and duration', () => {
    const now = new Date('2026-01-01T00:00:30Z').getTime()
    vi.setSystemTime(now)

    const startedAt = '2026-01-01T00:00:00Z'
    const duration = 90 // 90 seconds total, 60 remaining

    const { result } = renderHook(() => useWaitCountdown('waiting', startedAt, duration))

    expect(result.current.isActive).toBe(true)
    expect(result.current.remaining).toBe('00:01:00')
  })

  it('shows countdown for running status', () => {
    const now = new Date('2026-01-01T00:00:00Z').getTime()
    vi.setSystemTime(now)

    const startedAt = '2026-01-01T00:00:00Z'
    const duration = 3661 // 1h 1m 1s

    const { result } = renderHook(() => useWaitCountdown('running', startedAt, duration))

    expect(result.current.isActive).toBe(true)
    expect(result.current.remaining).toBe('01:01:01')
  })

  it('formats with days for durations > 24h', () => {
    const now = new Date('2026-01-01T00:00:00Z').getTime()
    vi.setSystemTime(now)

    const startedAt = '2026-01-01T00:00:00Z'
    const duration = 90000 // 1d 1h 0m 0s

    const { result } = renderHook(() => useWaitCountdown('waiting', startedAt, duration))

    expect(result.current.isActive).toBe(true)
    expect(result.current.remaining).toBe('1d 01:00:00')
  })

  it('shows 00:00:00 when time has elapsed', () => {
    const now = new Date('2026-01-01T00:02:00Z').getTime()
    vi.setSystemTime(now)

    const startedAt = '2026-01-01T00:00:00Z'
    const duration = 60 // already past

    const { result } = renderHook(() => useWaitCountdown('waiting', startedAt, duration))

    expect(result.current.remaining).toBe('00:00:00')
  })

  it('ticks down every second', () => {
    const now = new Date('2026-01-01T00:00:00Z').getTime()
    vi.setSystemTime(now)

    const startedAt = '2026-01-01T00:00:00Z'
    const duration = 5

    const { result } = renderHook(() => useWaitCountdown('waiting', startedAt, duration))

    expect(result.current.remaining).toBe('00:00:05')

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.remaining).toBe('00:00:04')
  })

  it('clears countdown when status changes to terminal', () => {
    const now = new Date('2026-01-01T00:00:00Z').getTime()
    vi.setSystemTime(now)

    const { result, rerender } = renderHook(
      ({ status }: { status: ActivityStatus }) => useWaitCountdown(status, '2026-01-01T00:00:00Z', 60),
      { initialProps: { status: 'waiting' as ActivityStatus } }
    )

    expect(result.current.isActive).toBe(true)

    rerender({ status: 'completed' })

    expect(result.current.remaining).toBeNull()
    expect(result.current.isActive).toBe(false)
  })
})
