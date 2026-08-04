import { afterEach, describe, expect, it } from 'vitest'

import { useProjectStore } from './useProjectStore'

describe('useProjectStore', () => {
  afterEach(() => {
    useProjectStore.setState({ selectedProjectId: null, favoriteProjectIds: [] })
  })

  it('starts with null selectedProjectId', () => {
    expect(useProjectStore.getState().selectedProjectId).toBeNull()
  })

  it('sets selectedProjectId', () => {
    useProjectStore.getState().setSelectedProjectId('project-1')
    expect(useProjectStore.getState().selectedProjectId).toBe('project-1')
  })

  it('clears selectedProjectId when set to null', () => {
    useProjectStore.getState().setSelectedProjectId('project-1')
    useProjectStore.getState().setSelectedProjectId(null)
    expect(useProjectStore.getState().selectedProjectId).toBeNull()
  })

  it('replaces selectedProjectId when set to a new value', () => {
    useProjectStore.getState().setSelectedProjectId('project-1')
    useProjectStore.getState().setSelectedProjectId('project-2')
    expect(useProjectStore.getState().selectedProjectId).toBe('project-2')
  })

  it('starts with empty favoriteProjectIds', () => {
    expect(useProjectStore.getState().favoriteProjectIds).toEqual([])
  })

  it('toggleFavoriteProjectId adds then removes a favorite', () => {
    useProjectStore.getState().toggleFavoriteProjectId('p-1')
    expect(useProjectStore.getState().favoriteProjectIds).toEqual(['p-1'])
    useProjectStore.getState().toggleFavoriteProjectId('p-2')
    expect(useProjectStore.getState().favoriteProjectIds).toEqual(['p-1', 'p-2'])
    useProjectStore.getState().toggleFavoriteProjectId('p-1')
    expect(useProjectStore.getState().favoriteProjectIds).toEqual(['p-2'])
  })
})
