import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useSearchParams } from './useSearchParams'

vi.mock('@tanstack/react-router', async () => vi.importActual('@tanstack/react-router'))

describe('useSearchParams', () => {
  it('reads search params from the URL', async () => {
    const wrapper = createTestRouter('/workflows?status=running')
    const { result } = renderHook(() => useSearchParams(), { wrapper })
    await waitFor(() => expect(result.current[0].get('status')).toBe('running'))
  })

  it('updates the URL when setSearchParams is called', async () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useSearchParams(), { wrapper })

    await waitFor(() => expect(result.current[0].toString()).toBe(''))

    act(() => {
      result.current[1](new URLSearchParams({ status: 'running' }))
    })

    await waitFor(() => {
      expect(result.current[0].get('status')).toBe('running')
    })
  })

  it('returns an empty URLSearchParams when no query string is present', async () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useSearchParams(), { wrapper })
    await waitFor(() => expect(result.current[0].toString()).toBe(''))
  })

  it('omits the query string delimiter when setSearchParams is called with empty params', async () => {
    const wrapper = createTestRouter('/workflows?status=running')
    const { result } = renderHook(() => useSearchParams(), { wrapper })

    await waitFor(() => expect(result.current[0].get('status')).toBe('running'))

    act(() => {
      result.current[1](new URLSearchParams())
    })

    await waitFor(() => expect(result.current[0].toString()).toBe(''))
  })
})
