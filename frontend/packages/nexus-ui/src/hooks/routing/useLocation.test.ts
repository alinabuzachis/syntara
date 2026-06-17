import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useLocation } from './useLocation'

describe('useLocation', () => {
  it('returns the current pathname as a string', () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useLocation(), { wrapper })

    expect(result.current).toBe('/workflows')
  })
})
