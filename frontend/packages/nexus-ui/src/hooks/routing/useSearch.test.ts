import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useSearch } from './useSearch'

vi.mock('@tanstack/react-router', async () => vi.importActual('@tanstack/react-router'))

describe('useSearch', () => {
  it('returns the search string when query params are present', async () => {
    const wrapper = createTestRouter('/workflows?status=running&page=2')
    const { result } = renderHook(() => useSearch(), { wrapper })
    await waitFor(() => expect(result.current).toContain('status=running'))
    expect(result.current).toContain('page=2')
  })

  it('returns an empty string when no query params are present', async () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useSearch(), { wrapper })
    await waitFor(() => expect(result.current).toBe(''))
  })

  it('strips a lone trailing question mark when query string is empty', async () => {
    const wrapper = createTestRouter('/workflows?')
    const { result } = renderHook(() => useSearch(), { wrapper })
    await waitFor(() => expect(result.current).toBe(''))
  })
})
