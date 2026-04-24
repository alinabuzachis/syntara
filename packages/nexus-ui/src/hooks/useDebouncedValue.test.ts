import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello'))
    expect(result.current).toBe('hello')
  })

  it('does not update the value before the delay', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })
    await act(() => vi.advanceTimersByTime(299))

    expect(result.current).toBe('a')
  })

  it('updates the value after the default delay', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })
    await act(() => vi.advanceTimersByTime(300))

    expect(result.current).toBe('b')
  })

  it('respects a custom delay', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 500), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })
    await act(() => vi.advanceTimersByTime(499))
    expect(result.current).toBe('a')

    await act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('b')
  })

  it('resets the timer when value changes rapidly', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })
    await act(() => vi.advanceTimersByTime(200))

    rerender({ value: 'c' })
    await act(() => vi.advanceTimersByTime(200))

    expect(result.current).toBe('a')

    await act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe('c')
  })
})
