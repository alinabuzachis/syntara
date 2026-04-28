import { SortByDirection } from '@patternfly/react-table'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { AlertProvider } from '../../components/alerts'

import { accessClient } from './accessClient'
import type { PermissionRow } from './types'
import { useAssignmentsData } from './useAssignmentsData'

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

// Reactive wouter mock: useLocation and useSearch share state so that
// navigate() updates both the path and the search string.
const mockUrl = { current: '/access-management/assignments', listeners: new Set<() => void>() }
function setMockUrl(url: string) {
  mockUrl.current = url
  mockUrl.listeners.forEach((l) => l())
}

vi.mock('wouter', async () => {
  const React = await import('react')
  function useMockUrl() {
    const [, rerender] = React.useState(0)
    React.useEffect(() => {
      const listener = () => rerender((n) => n + 1)
      mockUrl.listeners.add(listener)
      return () => {
        mockUrl.listeners.delete(listener)
      }
    }, [])
    return mockUrl.current
  }
  return {
    useLocation: () => {
      const url = useMockUrl()
      const path = url.split('?')[0]
      return [path, setMockUrl] as const
    },
    useSearch: () => {
      const url = useMockUrl()
      const idx = url.indexOf('?')
      return idx >= 0 ? url.slice(idx) : ''
    },
    useSearchParams: () => React.useState(new URLSearchParams()),
  }
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

// ── Test data ────────────────────────────────────────────────────────────────

const mockProjects = [
  {
    id: 'p1',
    name: 'Project Alpha',
    description: null,
    labels: {},
    is_default: true,
  },
  {
    id: 'p2',
    name: 'Project Beta',
    description: null,
    labels: {},
    is_default: false,
  },
]

const mockAllAssignments = [
  {
    id: 'pr1',
    principal_id: 'u1',
    principal_name: 'alice',
    principal_type: 'user',
    role_name: 'Admin',
    project_id: 'p1',
    project_name: 'Project Alpha',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sur1',
    principal_id: 'u2',
    principal_name: 'bob',
    principal_type: 'user',
    role_name: 'Viewer',
    project_id: null,
    project_name: null,
    created_at: null,
  },
  {
    id: 'pgr1',
    principal_id: 'g1',
    principal_name: 'Devs',
    principal_type: 'group',
    role_name: 'Editor',
    project_id: 'p1',
    project_name: 'Project Alpha',
    created_at: null,
  },
  {
    id: 'sgr1',
    principal_id: 'g2',
    principal_name: 'Ops',
    principal_type: 'group',
    role_name: 'Admin',
    project_id: null,
    project_name: null,
    created_at: null,
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockMutationReturn = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  data: null,
  reset: vi.fn(),
  isIdle: true,
  isSuccess: false,
  failureCount: 0,
  failureReason: null,
  context: undefined,
  submittedAt: 0,
  variables: undefined,
  status: 'idle' as const,
  isPaused: false,
}

function setupDefaultMocks() {
  const mockRefetch = vi.fn().mockResolvedValue({})
  vi.mocked(accessClient.useQuery).mockImplementation((_method: string, path: string) => {
    if (path === '/projects') {
      return {
        data: mockProjects,
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: mockRefetch,
      } as never
    }
    if (path === '/role-assignments') {
      return {
        data: { resources: mockAllAssignments, total: mockAllAssignments.length, next: null },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: mockRefetch,
      } as never
    }
    return {
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
    } as never
  })
  vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn as never)
  return mockRefetch
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAssignmentsData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    mockUrl.current = '/access-management/assignments'
  })

  describe('buildPermissionRows', () => {
    it('builds rows from unified role assignments', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      expect(result.current.allRows).toHaveLength(4)
    })

    it('maps project-scoped user role correctly', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const projectRole = result.current.allRows.find((r) => r.id === 'pr1')
      expect(projectRole).toMatchObject({
        principalType: 'user',
        principalId: 'u1',
        principalName: 'alice',
        assignmentName: 'Admin',
        scopeType: 'project',
        scopeName: 'Project Alpha',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'project-role-assignments',
      })
    })

    it('maps project-scoped group role correctly', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const groupRole = result.current.allRows.find((r) => r.id === 'pgr1')
      expect(groupRole).toMatchObject({
        principalType: 'group',
        principalId: 'g1',
        principalName: 'Devs',
        assignmentName: 'Editor',
        scopeType: 'project',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'project-role-assignments',
      })
    })

    it('maps system-scoped user role correctly', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const sysUserRole = result.current.allRows.find((r) => r.id === 'sur1')
      expect(sysUserRole).toMatchObject({
        principalType: 'user',
        principalId: 'u2',
        principalName: 'bob',
        assignmentName: 'Viewer',
        scopeType: 'system',
        scopeName: 'System',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'role-assignments',
      })
    })

    it('maps system-scoped group role correctly', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const sysGroupRole = result.current.allRows.find((r) => r.id === 'sgr1')
      expect(sysGroupRole).toMatchObject({
        principalType: 'group',
        principalId: 'g2',
        principalName: 'Ops',
        assignmentName: 'Admin',
        scopeType: 'system',
        scopeName: 'System',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'role-assignments',
      })
    })

    it('uses project_name from response for scope name', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const row = result.current.allRows.find((r) => r.id === 'pr1')
      expect(row?.scopeName).toBe('Project Alpha')
    })

    it('falls back to project_id when project_name is missing', () => {
      vi.mocked(accessClient.useQuery).mockImplementation((_method: string, path: string) => {
        if (path === '/role-assignments') {
          return {
            data: {
              resources: [
                {
                  id: 'x1',
                  principal_id: 'u1',
                  principal_name: 'alice',
                  principal_type: 'user',
                  role_name: 'Admin',
                  project_id: 'unknown-proj',
                  project_name: null,
                },
              ],
              total: 1,
              next: null,
            },
            isPending: false,
            isError: false,
            error: null,
            isFetching: false,
            refetch: vi.fn(),
          } as never
        }
        return { data: [], isPending: false, isError: false, error: null, isFetching: false, refetch: vi.fn() } as never
      })
      vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn as never)

      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const row = result.current.allRows.find((r) => r.id === 'x1')
      expect(row?.scopeName).toBe('unknown-proj')
    })

    it('returns empty rows when no data is available', () => {
      vi.mocked(accessClient.useQuery).mockReturnValue({
        data: undefined,
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)
      vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn as never)

      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      expect(result.current.allRows).toHaveLength(0)
    })
  })

  describe('projects', () => {
    it('returns projects from query data', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      expect(result.current.projects).toEqual(mockProjects)
    })

    it('returns empty array when no projects exist', () => {
      vi.mocked(accessClient.useQuery).mockReturnValue({
        data: undefined,
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)
      vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn as never)

      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      expect(result.current.projects).toEqual([])
    })
  })

  describe('applyFilters', () => {
    it('initially has no active filters', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      expect(result.current.hasActiveFilters).toBe(false)
      expect(result.current.sortedRows).toHaveLength(4)
    })

    it('filters by name (case-insensitive)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.handleFilterChange([{ key: 'name', value: 'ALICE' }])
      })

      expect(result.current.hasActiveFilters).toBe(true)
      expect(result.current.sortedRows).toHaveLength(1)
      expect(result.current.sortedRows[0].principalName).toBe('alice')
    })

    it('filters by type (user)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.handleFilterChange([{ key: 'type', value: 'user' }])
      })

      expect(result.current.sortedRows).toHaveLength(2)
      expect(result.current.sortedRows.every((r) => r.principalType === 'user')).toBe(true)
    })

    it('filters by type (group)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.handleFilterChange([{ key: 'type', value: 'group' }])
      })

      expect(result.current.sortedRows).toHaveLength(2)
      expect(result.current.sortedRows.every((r) => r.principalType === 'group')).toBe(true)
    })

    it('filters by scope (system)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.handleFilterChange([{ key: 'scope', value: 'system' }])
      })

      expect(result.current.sortedRows).toHaveLength(2)
      expect(result.current.sortedRows.every((r) => r.scopeType === 'system')).toBe(true)
    })

    it('filters by scope (project)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.handleFilterChange([{ key: 'scope', value: 'project' }])
      })

      expect(result.current.sortedRows).toHaveLength(2)
      expect(result.current.sortedRows.every((r) => r.scopeType === 'project')).toBe(true)
    })

    it('filters by project id', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.handleFilterChange([{ key: 'project', value: 'p1' }])
      })

      expect(result.current.sortedRows).toHaveLength(2)
      expect(result.current.sortedRows.every((r) => r.projectId === 'p1')).toBe(true)
    })

    it('applies multiple filters (AND logic)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.handleFilterChange([
          { key: 'type', value: 'user' },
          { key: 'project', value: 'p1' },
        ])
      })

      expect(result.current.sortedRows).toHaveLength(1)
      expect(result.current.sortedRows[0].principalName).toBe('alice')
    })

    it('clears all filters', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.handleFilterChange([{ key: 'name', value: 'alice' }])
      })
      expect(result.current.sortedRows).toHaveLength(1)

      act(() => {
        result.current.handleFilterChange([])
      })
      expect(result.current.sortedRows).toHaveLength(4)
      expect(result.current.hasActiveFilters).toBe(false)
    })

    it('passes through rows for unknown filter keys', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.handleFilterChange([{ key: 'unknown-key', value: 'anything' }])
      })

      expect(result.current.sortedRows).toHaveLength(4)
    })
  })

  describe('sortRows', () => {
    it('returns unsorted rows when no sort is active', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      expect(result.current.sortedRows).toHaveLength(4)
    })

    it('sorts by principal name ascending (column 0)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const sortParams = result.current.getSortParams(0)!
      act(() => {
        sortParams.onSort!({} as React.MouseEvent, 0, SortByDirection.asc, {} as never)
      })

      const names = result.current.sortedRows.map((r) => r.principalName)
      expect(names).toEqual(['alice', 'bob', 'Devs', 'Ops'])
    })

    it('sorts by principal name descending (column 0)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const sortParams = result.current.getSortParams(0)!
      act(() => {
        sortParams.onSort!({} as React.MouseEvent, 0, SortByDirection.desc, {} as never)
      })

      const names = result.current.sortedRows.map((r) => r.principalName)
      expect(names).toEqual(['Ops', 'Devs', 'bob', 'alice'])
    })

    it('sorts by type (column 1)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const sortParams = result.current.getSortParams(1)!
      act(() => {
        sortParams.onSort!({} as React.MouseEvent, 1, SortByDirection.asc, {} as never)
      })

      const types = result.current.sortedRows.map((r) => r.principalType)
      // 'group' comes before 'user' alphabetically
      expect(types).toEqual(['group', 'group', 'user', 'user'])
    })

    it('sorts by role name (column 2)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const sortParams = result.current.getSortParams(2)!
      act(() => {
        sortParams.onSort!({} as React.MouseEvent, 2, SortByDirection.asc, {} as never)
      })

      const roles = result.current.sortedRows.map((r) => r.assignmentName)
      expect(roles).toEqual(['Admin', 'Admin', 'Editor', 'Viewer'])
    })

    it('sorts by scope name (column 3)', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const sortParams = result.current.getSortParams(3)!
      act(() => {
        sortParams.onSort!({} as React.MouseEvent, 3, SortByDirection.asc, {} as never)
      })

      const scopes = result.current.sortedRows.map((r) => r.scopeName)
      expect(scopes).toEqual(['Project Alpha', 'Project Alpha', 'System', 'System'])
    })

    it('getSortParams returns correct sortBy structure', () => {
      setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const params = result.current.getSortParams(2)!
      expect(params.columnIndex).toBe(2)
      expect(params.sortBy.defaultDirection).toBe('asc')
    })
  })

  describe('refetchAll', () => {
    it('calls refetch on the all-role-assignments query', () => {
      const mockRefetch = setupDefaultMocks()
      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      act(() => {
        result.current.refetchAll()
      })

      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe('handleDelete', () => {
    it('deletes project-roles assignment', () => {
      const mockDeleteMutate = vi.fn()
      setupDefaultMocks()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockDeleteMutate,
      } as never)

      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const row: PermissionRow = {
        id: 'pr1',
        principalType: 'user',
        principalId: 'u1',
        principalName: 'alice',
        assignmentType: 'role',
        assignmentName: 'Admin',
        scopeType: 'project',
        scopeName: 'Project Alpha',
        projectId: 'p1',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'project-role-assignments',
      }

      const onSettled = vi.fn()
      act(() => {
        result.current.handleDelete(row, onSettled)
      })

      expect(mockDeleteMutate).toHaveBeenCalled()
      const callArgs = mockDeleteMutate.mock.calls[0]
      expect(callArgs[0]).toEqual({
        params: { path: { project_id: 'p1', assignment_id: 'pr1' } },
      })
    })

    it('deletes project-group-roles assignment', () => {
      const mockDeleteMutate = vi.fn()
      setupDefaultMocks()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockDeleteMutate,
      } as never)

      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const row: PermissionRow = {
        id: 'pgr1',
        principalType: 'group',
        principalId: 'g1',
        principalName: 'Devs',
        assignmentType: 'role',
        assignmentName: 'Editor',
        scopeType: 'project',
        scopeName: 'Project Alpha',
        projectId: 'p1',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'project-role-assignments',
      }

      act(() => {
        result.current.handleDelete(row, vi.fn())
      })

      expect(mockDeleteMutate).toHaveBeenCalled()
      const callArgs = mockDeleteMutate.mock.calls[0]
      expect(callArgs[0]).toEqual({
        params: { path: { project_id: 'p1', assignment_id: 'pgr1' } },
      })
    })

    it('deletes user-role-assignments assignment', () => {
      const mockDeleteMutate = vi.fn()
      setupDefaultMocks()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockDeleteMutate,
      } as never)

      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const row: PermissionRow = {
        id: 'sur1',
        principalType: 'user',
        principalId: 'u2',
        principalName: 'bob',
        assignmentType: 'role',
        assignmentName: 'Viewer',
        scopeType: 'system',
        scopeName: 'System',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'role-assignments',
      }

      act(() => {
        result.current.handleDelete(row, vi.fn())
      })

      expect(mockDeleteMutate).toHaveBeenCalled()
      const callArgs = mockDeleteMutate.mock.calls[0]
      expect(callArgs[0]).toEqual({
        params: { path: { assignment_id: 'sur1' } },
      })
    })

    it('deletes group-role-assignments assignment', () => {
      const mockDeleteMutate = vi.fn()
      setupDefaultMocks()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockDeleteMutate,
      } as never)

      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const row: PermissionRow = {
        id: 'sgr1',
        principalType: 'group',
        principalId: 'g2',
        principalName: 'Ops',
        assignmentType: 'role',
        assignmentName: 'Admin',
        scopeType: 'system',
        scopeName: 'System',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'role-assignments',
      }

      act(() => {
        result.current.handleDelete(row, vi.fn())
      })

      expect(mockDeleteMutate).toHaveBeenCalled()
      const callArgs = mockDeleteMutate.mock.calls[0]
      expect(callArgs[0]).toEqual({
        params: { path: { assignment_id: 'sgr1' } },
      })
    })

    it('passes onSettled callback to mutation', () => {
      const mockDeleteMutate = vi.fn()
      setupDefaultMocks()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockDeleteMutate,
      } as never)

      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const onSettled = vi.fn()
      const row: PermissionRow = {
        id: 'sur1',
        principalType: 'user',
        principalId: 'u2',
        principalName: 'bob',
        assignmentType: 'role',
        assignmentName: 'Viewer',
        scopeType: 'system',
        scopeName: 'System',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'role-assignments',
      }

      act(() => {
        result.current.handleDelete(row, onSettled)
      })

      const callbacks = mockDeleteMutate.mock.calls[0][1] as {
        onSuccess: () => void
        onError: (err: unknown) => void
        onSettled: () => void
      }
      expect(callbacks.onSettled).toBe(onSettled)
    })

    it('early-returns with onSettled when project-role-assignments row has no projectId', () => {
      const mockDeleteMutate = vi.fn()
      setupDefaultMocks()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockDeleteMutate,
      } as never)

      const { result } = renderHook(() => useAssignmentsData(), { wrapper })

      const row: PermissionRow = {
        id: 'pr-missing',
        principalType: 'user',
        principalId: 'u1',
        principalName: 'alice',
        assignmentType: 'role',
        assignmentName: 'Admin',
        scopeType: 'project',
        scopeName: 'Project Alpha',
        roleDescription: null,
        rolePolicies: [],
        sourceEndpoint: 'project-role-assignments',
      }

      const onSettled = vi.fn()
      act(() => {
        result.current.handleDelete(row, onSettled)
      })

      expect(onSettled).toHaveBeenCalled()
      expect(mockDeleteMutate).not.toHaveBeenCalled()
    })
  })
})
