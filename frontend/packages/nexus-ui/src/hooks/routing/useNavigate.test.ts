import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useLocation } from './useLocation'
import { useNavigate } from './useNavigate'

describe('useNavigate', () => {
  it('programmatic navigation changes the current path', () => {
    const wrapper = createTestRouter('/')
    const { result } = renderHook(() => ({ navigate: useNavigate(), location: useLocation() }), { wrapper })

    act(() => {
      result.current.navigate('/workflows')
    })

    expect(result.current.location[0]).toBe('/workflows')
  })

  it('navigates with replace option without error and changes the current path', () => {
    const wrapper = createTestRouter('/')
    const { result } = renderHook(() => ({ navigate: useNavigate(), location: useLocation() }), { wrapper })

    act(() => {
      result.current.navigate('/executions', { replace: true })
    })

    expect(result.current.location[0]).toBe('/executions')
  })
})
