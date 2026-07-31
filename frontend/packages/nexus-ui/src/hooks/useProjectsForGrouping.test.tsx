import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectRead } from '../routes/access/types'
import { useAllProjects } from '../routes/access/useAllProjects'

import { useProjectsForGrouping } from './useProjectsForGrouping'

vi.mock('../routes/access/useAllProjects', () => ({
  useAllProjects: vi.fn(),
}))

function project(partial: Pick<ProjectRead, 'id' | 'name'> & Partial<ProjectRead>): ProjectRead {
  return {
    description: null,
    labels: {},
    is_default: false,
    is_builtin: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('useProjectsForGrouping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns known projects and skips full fetch when not viewing all projects', () => {
    const known = [project({ id: 'p-1', name: 'Known' })]
    vi.mocked(useAllProjects).mockReturnValue({
      projects: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useProjectsForGrouping(known, false))

    expect(useAllProjects).toHaveBeenCalledWith({ enabled: false })
    expect(result.current).toEqual(known)
  })

  it('falls back to known projects while the full list is empty', () => {
    const known = [project({ id: 'p-1', name: 'Known' })]
    vi.mocked(useAllProjects).mockReturnValue({
      projects: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useProjectsForGrouping(known, true))

    expect(useAllProjects).toHaveBeenCalledWith({ enabled: true })
    expect(result.current).toEqual(known)
  })

  it('uses the full project list so names resolve beyond the selector page', () => {
    const known = [project({ id: 'p-recent', name: 'Recent' })]
    const all = [project({ id: 'p-recent', name: 'Recent' }), project({ id: 'p-old', name: 'Oldest project' })]
    vi.mocked(useAllProjects).mockReturnValue({
      projects: all,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useProjectsForGrouping(known, true))

    expect(result.current).toEqual(all)
    expect(result.current.find((p) => p.id === 'p-old')?.name).toBe('Oldest project')
  })

  it('keeps known projects that are missing from the full list', () => {
    const known = [project({ id: 'p-known-only', name: 'From selector' })]
    const all = [project({ id: 'p-all', name: 'From all' })]
    vi.mocked(useAllProjects).mockReturnValue({
      projects: all,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useProjectsForGrouping(known, true))

    expect(result.current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'p-all', name: 'From all' }),
        expect.objectContaining({ id: 'p-known-only', name: 'From selector' }),
      ])
    )
  })

  it('prefers the known project name when the full list is stale', () => {
    const known = [project({ id: 'p-1', name: 'Renamed project' })]
    const all = [project({ id: 'p-1', name: 'Stale name' }), project({ id: 'p-2', name: 'Other' })]
    vi.mocked(useAllProjects).mockReturnValue({
      projects: all,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useProjectsForGrouping(known, true))

    expect(result.current.find((p) => p.id === 'p-1')?.name).toBe('Renamed project')
    expect(result.current.find((p) => p.id === 'p-2')?.name).toBe('Other')
  })

  it('keeps is_builtin from the full list when known projects omit it', () => {
    const known = [{ id: 'p-1', name: 'Builtin' } as ProjectRead]
    const all = [project({ id: 'p-1', name: 'Builtin', is_builtin: true })]
    vi.mocked(useAllProjects).mockReturnValue({
      projects: all,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useProjectsForGrouping(known, true))

    expect(result.current.find((p) => p.id === 'p-1')?.is_builtin).toBe(true)
  })
})
