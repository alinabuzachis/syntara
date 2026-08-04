import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useParams } from './useParams'

vi.mock('@tanstack/react-router', async () => vi.importActual('@tanstack/react-router'))

describe('useParams', () => {
  it('extracts a single typed param from the matching route', async () => {
    const wrapper = createTestRouter('/workflows/abc-123', '/workflows/:workflowId')
    const { result } = renderHook(() => useParams<{ workflowId: string }>(), { wrapper })
    await waitFor(() => expect(result.current.workflowId).toBe('abc-123'))
  })

  it('extracts multiple typed params from the matching route', async () => {
    const wrapper = createTestRouter('/users/42/groups/7', '/users/:userId/groups/:groupId')
    const { result } = renderHook(() => useParams<{ userId: string; groupId: string }>(), { wrapper })
    await waitFor(() => expect(result.current.userId).toBe('42'))
    await waitFor(() => expect(result.current.groupId).toBe('7'))
  })

  it('returns undefined for a named param that does not exist on the current route', async () => {
    const wrapper = createTestRouter('/workflows')
    const { result } = renderHook(() => useParams<{ workflowId?: string }>(), { wrapper })
    await waitFor(() => expect(result.current.workflowId).toBeUndefined())
  })
})
