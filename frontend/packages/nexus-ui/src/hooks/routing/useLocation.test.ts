import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useLocation } from './useLocation'

describe('useLocation', () => {
  it('returns the current path', () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useLocation(), { wrapper })

    expect(result.current[0]).toBe('/workflows')
  })

  it('navigate changes the current path', () => {
    const wrapper = createTestRouter('/')
    const { result } = renderHook(() => useLocation(), { wrapper })

    act(() => {
      result.current[1]('/executions')
    })

    expect(result.current[0]).toBe('/executions')
  })
})
