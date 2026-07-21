import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectAssignmentSync } from './useProjectAssignmentSync'

const mockPost = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../../client', () => ({
  integrationsFetchClient: {
    POST: (...args: unknown[]): Promise<{ error?: unknown }> => mockPost(...args) as Promise<{ error?: unknown }>,
    DELETE: (...args: unknown[]): Promise<{ error?: unknown }> => mockDelete(...args) as Promise<{ error?: unknown }>,
  },
}))

describe('useProjectAssignmentSync', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockDelete.mockReset()
  })

  it('returns empty result and makes no API calls when IDs are identical', async () => {
    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', ['p1', 'p2'], ['p1', 'p2'])

    expect(syncResult).toEqual({ added: [], removed: [], errors: [] })
    expect(mockPost).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('returns empty result when both lists are empty', async () => {
    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', [], [])

    expect(syncResult).toEqual({ added: [], removed: [], errors: [] })
    expect(mockPost).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('adds new assignments for IDs in new but not initial', async () => {
    mockPost.mockResolvedValue({ error: undefined })

    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', ['p1'], ['p1', 'p2', 'p3'])

    expect(mockPost).toHaveBeenCalledTimes(2)
    expect(mockPost).toHaveBeenCalledWith('/integrations/{integration_id}/projects/{project_id}', {
      params: { path: { integration_id: 'int-1', project_id: 'p2' } },
    })
    expect(mockPost).toHaveBeenCalledWith('/integrations/{integration_id}/projects/{project_id}', {
      params: { path: { integration_id: 'int-1', project_id: 'p3' } },
    })
    expect(mockDelete).not.toHaveBeenCalled()
    expect(syncResult.added).toEqual(['p2', 'p3'])
    expect(syncResult.removed).toEqual([])
    expect(syncResult.errors).toEqual([])
  })

  it('removes old assignments for IDs in initial but not new', async () => {
    mockDelete.mockResolvedValue({ error: undefined })

    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', ['p1', 'p2', 'p3'], ['p1'])

    expect(mockDelete).toHaveBeenCalledTimes(2)
    expect(mockDelete).toHaveBeenCalledWith('/integrations/{integration_id}/projects/{project_id}', {
      params: { path: { integration_id: 'int-1', project_id: 'p2' } },
    })
    expect(mockDelete).toHaveBeenCalledWith('/integrations/{integration_id}/projects/{project_id}', {
      params: { path: { integration_id: 'int-1', project_id: 'p3' } },
    })
    expect(mockPost).not.toHaveBeenCalled()
    expect(syncResult.removed).toEqual(['p2', 'p3'])
    expect(syncResult.added).toEqual([])
    expect(syncResult.errors).toEqual([])
  })

  it('handles mixed adds and removes', async () => {
    mockPost.mockResolvedValue({ error: undefined })
    mockDelete.mockResolvedValue({ error: undefined })

    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', ['p1', 'p2'], ['p2', 'p3'])

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/integrations/{integration_id}/projects/{project_id}', {
      params: { path: { integration_id: 'int-1', project_id: 'p3' } },
    })
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDelete).toHaveBeenCalledWith('/integrations/{integration_id}/projects/{project_id}', {
      params: { path: { integration_id: 'int-1', project_id: 'p1' } },
    })
    expect(syncResult.added).toEqual(['p3'])
    expect(syncResult.removed).toEqual(['p1'])
    expect(syncResult.errors).toEqual([])
  })

  it('records errors for rejected POST calls', async () => {
    mockPost.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', [], ['p1', 'p2'])

    expect(syncResult.added).toEqual([])
    expect(syncResult.errors).toEqual(['Failed to assign project p1', 'Failed to assign project p2'])
  })

  it('records errors for rejected DELETE calls', async () => {
    mockDelete.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', ['p1', 'p2'], [])

    expect(syncResult.removed).toEqual([])
    expect(syncResult.errors).toEqual(['Failed to unassign project p1', 'Failed to unassign project p2'])
  })

  it('records errors for fulfilled responses with error property', async () => {
    mockPost.mockResolvedValue({ error: { detail: 'Forbidden' } })
    mockDelete.mockResolvedValue({ error: { detail: 'Not found' } })

    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', ['p1'], ['p2'])

    expect(syncResult.added).toEqual([])
    expect(syncResult.removed).toEqual([])
    expect(syncResult.errors).toEqual(['Failed to assign project p2', 'Failed to unassign project p1'])
  })

  it('handles partial failures among multiple calls', async () => {
    mockPost
      .mockResolvedValueOnce({ error: undefined })
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ error: undefined })
    mockDelete.mockResolvedValue({ error: undefined })

    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', ['old-1'], ['new-1', 'new-2', 'new-3'])

    expect(syncResult.added).toEqual(['new-1', 'new-3'])
    expect(syncResult.removed).toEqual(['old-1'])
    expect(syncResult.errors).toEqual(['Failed to assign project new-2'])
  })

  it('removes all when new list is empty', async () => {
    mockDelete.mockResolvedValue({ error: undefined })

    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', ['p1', 'p2', 'p3'], [])

    expect(mockDelete).toHaveBeenCalledTimes(3)
    expect(mockPost).not.toHaveBeenCalled()
    expect(syncResult.removed).toEqual(['p1', 'p2', 'p3'])
    expect(syncResult.added).toEqual([])
    expect(syncResult.errors).toEqual([])
  })

  it('adds all when initial list is empty', async () => {
    mockPost.mockResolvedValue({ error: undefined })

    const { result } = renderHook(() => useProjectAssignmentSync())

    const syncResult = await result.current.syncAssignments('int-1', [], ['p1', 'p2'])

    expect(mockPost).toHaveBeenCalledTimes(2)
    expect(mockDelete).not.toHaveBeenCalled()
    expect(syncResult.added).toEqual(['p1', 'p2'])
    expect(syncResult.removed).toEqual([])
    expect(syncResult.errors).toEqual([])
  })
})
