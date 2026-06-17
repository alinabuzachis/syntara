import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useApprovalDecideGroups } from './useApprovalDecideGroups'

const mockUseAllGroups = vi.fn()

vi.mock('../../access/useAllGroups', () => ({
  useAllGroups: () => mockUseAllGroups() as unknown,
}))

describe('useApprovalDecideGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns groups from useAllGroups', () => {
    const mockGroups = [
      {
        id: '1',
        name: 'admins',
        description: 'Admins',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        is_builtin: false,
      },
      {
        id: '2',
        name: 'approvers',
        description: 'Approvers',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        is_builtin: false,
      },
    ]

    mockUseAllGroups.mockReturnValue({
      groups: mockGroups,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useApprovalDecideGroups())

    expect(result.current.groups).toEqual(mockGroups)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('returns loading state', () => {
    mockUseAllGroups.mockReturnValue({
      groups: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useApprovalDecideGroups())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.groups).toEqual([])
  })

  it('returns error state', () => {
    const mockError = new Error('Failed to fetch')

    mockUseAllGroups.mockReturnValue({
      groups: [],
      isLoading: false,
      error: mockError,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useApprovalDecideGroups())

    expect(result.current.error).toBe(mockError)
    expect(result.current.groups).toEqual([])
  })

  it('returns empty groups array when no groups exist', () => {
    mockUseAllGroups.mockReturnValue({
      groups: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useApprovalDecideGroups())

    expect(result.current.groups).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('passes through all properties from useAllGroups', () => {
    const mockGroups = [
      {
        id: '1',
        name: 'test',
        description: 'Test',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        is_builtin: true,
      },
    ]
    const mockError = new Error('Test error')

    mockUseAllGroups.mockReturnValue({
      groups: mockGroups,
      isLoading: true,
      error: mockError,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useApprovalDecideGroups())

    expect(result.current.groups).toBe(mockGroups)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBe(mockError)
  })
})
