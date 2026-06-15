import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useSearch } from './useSearch'

describe('useSearch', () => {
  it('returns the search string when query params are present', () => {
    const wrapper = createTestRouter('/workflows?status=running&page=2')
    const { result } = renderHook(() => useSearch(), { wrapper })

    expect(result.current).toContain('status=running')
    expect(result.current).toContain('page=2')
  })

  it('returns an empty string when no query params are present', () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useSearch(), { wrapper })

    expect(result.current).toBe('')
  })
})
