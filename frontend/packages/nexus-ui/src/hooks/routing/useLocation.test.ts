import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useLocation } from './useLocation'

vi.mock('@tanstack/react-router', async () => vi.importActual('@tanstack/react-router'))

describe('useLocation', () => {
  it('returns the current pathname as a string', async () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useLocation(), { wrapper })
    await waitFor(() => expect(result.current).toBe('/workflows'))
  })
})
