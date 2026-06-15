import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useSearchParams } from './useSearchParams'

describe('useSearchParams', () => {
  it('reads search params from the URL', () => {
    const wrapper = createTestRouter('/workflows?status=running')
    const { result } = renderHook(() => useSearchParams(), { wrapper })

    expect(result.current[0].get('status')).toBe('running')
  })

  it('updates the URL when setSearchParams is called', () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useSearchParams(), { wrapper })

    act(() => {
      result.current[1](new URLSearchParams({ status: 'running' }))
    })

    expect(result.current[0].get('status')).toBe('running')
  })

  it('returns an empty URLSearchParams when no query string is present', () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useSearchParams(), { wrapper })

    expect(result.current[0].toString()).toBe('')
  })
})
