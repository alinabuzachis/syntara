import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createTestRouter } from '../../test/createTestRouter'

import { useParams } from './useParams'

describe('useParams', () => {
  it('extracts a single typed param from the matching route', () => {
    const wrapper = createTestRouter('/workflows/abc-123', '/workflows/:workflowId')
    const { result } = renderHook(() => useParams<{ workflowId: string }>(), { wrapper })

    expect(result.current.workflowId).toBe('abc-123')
  })

  it('extracts multiple typed params from the matching route', () => {
    const wrapper = createTestRouter('/users/42/groups/7', '/users/:userId/groups/:groupId')
    const { result } = renderHook(() => useParams<{ userId: string; groupId: string }>(), { wrapper })

    expect(result.current.userId).toBe('42')
    expect(result.current.groupId).toBe('7')
  })
})
