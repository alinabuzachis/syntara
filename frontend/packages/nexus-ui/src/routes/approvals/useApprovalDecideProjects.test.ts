import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useApprovalDecideProjects } from './useApprovalDecideProjects'

// Mock the access client
const mockUseQuery = vi.fn()
function getMockValue(): unknown {
  return mockUseQuery()
}
vi.mock('../access/accessClient', () => ({
  accessClient: {
    useQuery: getMockValue,
  },
}))

describe('useApprovalDecideProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with isLoading true and empty permission sets', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set())
  })

  it('detects system-level approval:decide permission', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
          {
            effect: 'allow',
            actions: ['approval:decide'],
            scope: 'system',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(true)
    expect(result.current.canDecideProjectNames).toEqual(new Set())
    expect(result.current.isLoading).toBe(false)
  })

  it('detects system-level permission when scope is undefined', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
          {
            effect: 'allow',
            actions: ['approval:decide'],
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(true)
  })

  it('detects system-level permission when project is null', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
          {
            effect: 'allow',
            actions: ['approval:decide'],
            project: null,
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(true)
  })

  it('extracts project-scoped approval:decide permissions', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
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
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set(['test-project-1', 'test-project-2']))
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores project-scoped permissions without project field', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
          {
            effect: 'allow',
            actions: ['approval:decide'],
            scope: 'project',
            // Missing project field
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set())
  })

  it('ignores permissions with effect deny', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
          {
            effect: 'deny',
            actions: ['approval:decide'],
            scope: 'system',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
  })

  it('ignores permissions without decide action', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
          {
            effect: 'allow',
            actions: ['read', 'write'],
            scope: 'system',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
  })

  it('handles mixed system and project permissions', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
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
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(true)
    expect(result.current.canDecideProjectNames).toEqual(new Set(['test-project']))
  })

  it('handles permissions with multiple actions including decide', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
          {
            effect: 'allow',
            actions: ['read', 'approval:decide', 'write'],
            scope: 'project',
            project: 'multi-action-project',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideProjectNames).toEqual(new Set(['multi-action-project']))
  })

  it('handles empty permissions array', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set())
  })

  it('handles undefined data', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideAllProjects).toBe(false)
    expect(result.current.canDecideProjectNames).toEqual(new Set())
  })

  it('exposes error from query', () => {
    const testError = new Error('Network error')
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: testError,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.error).toBe(testError)
  })

  it('updates when query data changes', async () => {
    // Start with loading state
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })

    const { result, rerender } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.isLoading).toBe(true)

    // Update to first loaded state
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
          {
            effect: 'allow',
            actions: ['approval:decide'],
            scope: 'project',
            project: 'project-1',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.canDecideProjectNames).toEqual(new Set(['project-1']))
    })

    // Update to second loaded state
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
          {
            effect: 'allow',
            actions: ['approval:decide'],
            scope: 'system',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.canDecideAllProjects).toBe(true)
    })
  })

  it('deduplicates project names', () => {
    mockUseQuery.mockReturnValue({
      data: {
        permissions: [
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
        ],
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useApprovalDecideProjects())

    expect(result.current.canDecideProjectNames.size).toBe(1)
    expect(result.current.canDecideProjectNames).toEqual(new Set(['duplicate-project']))
  })
})
