import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useLocation } from './useLocation'
import { useNavigate } from './useNavigate'

describe('useNavigate', () => {
  it('programmatic navigation changes the current path', async () => {
    const wrapper = createTestRouter('/')
    const { result } = renderHook(() => ({ navigate: useNavigate(), location: useLocation() }), { wrapper })

    await waitFor(() => expect(result.current.location).toBe('/'))

    act(() => {
      result.current.navigate('/workflows')
    })

    await waitFor(() => {
      expect(result.current.location).toBe('/workflows')
    })
  })

  it('navigates with replace option without error and changes the current path', async () => {
    const wrapper = createTestRouter('/')
    const { result } = renderHook(() => ({ navigate: useNavigate(), location: useLocation() }), { wrapper })

    await waitFor(() => expect(result.current.location).toBe('/'))

    act(() => {
      result.current.navigate('/executions', { replace: true })
    })

    await waitFor(() => {
      expect(result.current.location).toBe('/executions')
    })
  })
})
