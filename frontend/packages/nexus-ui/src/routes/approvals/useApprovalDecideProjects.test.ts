import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAllPermissions } from '../access/useAllPermissions'

import { useApprovalDecideProjects } from './useApprovalDecideProjects'

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../access/useAllPermissions', () => ({
  useAllPermissions: vi.fn(),
}))

function mockPermissions(
  permissions: Record<string, unknown>[],
  overrides: { isLoading?: boolean; error?: Error | null } = {}
) {
  vi.mocked(useAllPermissions).mockReturnValue({
    permissions: permissions as ReturnType<typeof useAllPermissions>['permissions'],
    isLoading: overrides.isLoading ?? false,
    error: overrides.error ?? null,
    refetch: vi.fn() as ReturnType<typeof useAllPermissions>['refetch'],
  })
}

describe('useApprovalDecideProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with isLoading true and empty permission sets', () => {
    mockPermissions([], { isLoading: true })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set())
    expect(result.current.canReadProjectNames).toEqual(new Set())
  })

  it('detects system-level approval:decide permission', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'system',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(true)
    expect(result.current.canDecideProjectNames).toEqual(new Set())
    expect(result.current.isLoading).toBe(false)
  })

  it('detects system-level permission when scope is undefined', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(true)
  })

  it('detects system-level permission when project is null', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
        project: null,
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(true)
  })

  it('extracts project-scoped approval:decide permissions', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'project',
        project: 'test-project-1',
      },
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'project',
        project: 'test-project-2',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set(['test-project-1', 'test-project-2']))
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores project-scoped permissions without project field', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'project',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set())
  })

  it('ignores permissions with effect deny', () => {
    mockPermissions([
      {
        effect: 'deny',
        actions: ['approval:decide'],
        scope: 'system',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
  })

  it('ignores permissions without decide action', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['read', 'write'],
        scope: 'system',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
  })

  it('handles mixed system and project permissions', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'system',
      },
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'project',
        project: 'test-project',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(true)
    expect(result.current.canDecideProjectNames).toEqual(new Set(['test-project']))
  })

  it('handles permissions with multiple actions including decide', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['read', 'approval:decide', 'write'],
        scope: 'project',
        project: 'multi-action-project',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideProjectNames).toEqual(new Set(['multi-action-project']))
  })

  it('handles empty permissions array', () => {
    mockPermissions([])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set())
  })

  it('exposes error from query', () => {
    const testError = new Error('Network error')
    mockPermissions([], { error: testError })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.error).toBe(testError)
  })

  it('updates when permissions data changes', async () => {
    mockPermissions([], { isLoading: true })

    const { result, rerender } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.isLoading).toBe(true)

    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'project',
        project: 'project-1',
      },
    ])

    rerender()

    await waitFor(() => {
      expect(result.current.canDecideProjectNames).toEqual(new Set(['project-1']))
    })

    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'system',
      },
    ])

    rerender()

    await waitFor(() => {
      expect(result.current.canDecideAllProjects).toBe(true)
    })
  })

  it('deduplicates project names', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'project',
        project: 'duplicate-project',
      },
      {
        effect: 'allow',
        actions: ['decide', 'read'],
        scope: 'project',
        project: 'duplicate-project',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideProjectNames.size).toBe(1)
    expect(result.current.canDecideProjectNames).toEqual(new Set(['duplicate-project']))
  })

  it('extracts read project names but does not expose canReadAllProjects', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:read'],
        scope: 'system',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canReadProjectNames).toEqual(new Set())
    expect(result.current).not.toHaveProperty('canReadAllProjects')
  })

  it('extracts project-scoped approval:read permissions', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:read'],
        scope: 'project',
        project: 'read-project-1',
      },
      {
        effect: 'allow',
        actions: ['approval:read'],
        scope: 'project',
        project: 'read-project-2',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canReadProjectNames).toEqual(new Set(['read-project-1', 'read-project-2']))
  })

  it('ignores deny effect for approval:read', () => {
    mockPermissions([
      {
        effect: 'deny',
        actions: ['approval:read'],
        scope: 'system',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canReadProjectNames).toEqual(new Set())
  })

  it('handles mixed read and decide permissions across scopes', () => {
    mockPermissions([
      {
        effect: 'allow',
        actions: ['approval:decide'],
        scope: 'project',
        project: 'decide-only',
      },
      {
        effect: 'allow',
        actions: ['approval:read'],
        scope: 'project',
        project: 'read-only',
      },
      {
        effect: 'allow',
        actions: ['approval:read'],
        scope: 'system',
      },
    ])

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set(['decide-only']))
    expect(result.current.canReadProjectNames).toEqual(new Set(['read-only']))
  })
})
