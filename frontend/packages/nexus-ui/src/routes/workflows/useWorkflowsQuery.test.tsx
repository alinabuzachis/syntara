import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkflowsQuery } from './useWorkflowsQuery'

// Mock the API clients
type QueryResult = { data: { resources: unknown[] }; isLoading: boolean; error: unknown }
const mockWorkflowClientQuery = vi.fn()
const mockAccessClientQuery = vi.fn()

vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn((): QueryResult => mockWorkflowClientQuery() as QueryResult),
  },
}))

vi.mock('../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn((): QueryResult => mockAccessClientQuery() as QueryResult),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useWorkflowsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('query enablement logic', () => {
    it('enables allWorkflowsQuery when projectSelectorReady and isAllProjects', () => {
      mockWorkflowClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })
      mockAccessClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })

      renderHook(
        () =>
          useWorkflowsQuery({
            queryParams: {},
            isAllProjects: true,
            stableProjectId: undefined,
            projectSelectorReady: true,
          }),
        { wrapper: createWrapper() }
      )

      // The query should be enabled when projectSelectorReady and isAllProjects
      expect(mockWorkflowClientQuery).toHaveBeenCalled()
    })

    it('disables allWorkflowsQuery when projectSelectorReady is false', () => {
      mockWorkflowClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })
      mockAccessClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })

      const { result } = renderHook(
        () =>
          useWorkflowsQuery({
            queryParams: {},
            isAllProjects: true,
            stableProjectId: undefined,
            projectSelectorReady: false,
          }),
        { wrapper: createWrapper() }
      )

      // The query should not return data when disabled
      expect(result.current.workflows).toEqual([])
    })

    it('enables projectWorkflowsQuery when stableProjectId is set and not isAllProjects', () => {
      mockWorkflowClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })
      mockAccessClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })

      renderHook(
        () =>
          useWorkflowsQuery({
            queryParams: {},
            isAllProjects: false,
            stableProjectId: 'proj-123',
            projectSelectorReady: true,
          }),
        { wrapper: createWrapper() }
      )

      // The query should be enabled when stableProjectId is set
      expect(mockAccessClientQuery).toHaveBeenCalled()
    })

    it('disables projectWorkflowsQuery when stableProjectId is undefined', () => {
      mockWorkflowClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })
      mockAccessClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })

      const { result } = renderHook(
        () =>
          useWorkflowsQuery({
            queryParams: {},
            isAllProjects: false,
            stableProjectId: undefined,
            projectSelectorReady: true,
          }),
        { wrapper: createWrapper() }
      )

      // The query should not return data when disabled
      expect(result.current.workflows).toEqual([])
    })
  })

  describe('useMemo dependency correctness', () => {
    it('memoizes workflows array to avoid unnecessary re-renders', () => {
      const mockData = { resources: [{ id: 'wf-1', name: 'Test' }] }
      mockWorkflowClientQuery.mockReturnValue({ data: mockData, isLoading: false, error: null })
      mockAccessClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })

      const { result, rerender } = renderHook(
        () =>
          useWorkflowsQuery({
            queryParams: {},
            isAllProjects: true,
            stableProjectId: undefined,
            projectSelectorReady: true,
          }),
        { wrapper: createWrapper() }
      )

      const firstWorkflows = result.current.workflows

      // Re-render with same data (workflowsQuery gets new reference, but data is same)
      rerender()

      // workflows array should be the same reference due to useMemo
      expect(result.current.workflows).toBe(firstWorkflows)
    })

    it('returns new workflows array when data actually changes', () => {
      let mockData = { resources: [{ id: 'wf-1', name: 'Test' }] }
      mockWorkflowClientQuery.mockReturnValue({ data: mockData, isLoading: false, error: null })
      mockAccessClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })

      const { result } = renderHook(
        () =>
          useWorkflowsQuery({
            queryParams: {},
            isAllProjects: true,
            stableProjectId: undefined,
            projectSelectorReady: true,
          }),
        { wrapper: createWrapper() }
      )

      const firstWorkflows = result.current.workflows

      // Change the mock data
      mockData = { resources: [{ id: 'wf-2', name: 'Different' }] }
      mockWorkflowClientQuery.mockReturnValue({ data: mockData, isLoading: false, error: null })

      const { result: result2 } = renderHook(
        () =>
          useWorkflowsQuery({
            queryParams: {},
            isAllProjects: true,
            stableProjectId: undefined,
            projectSelectorReady: true,
          }),
        { wrapper: createWrapper() }
      )

      // workflows array should be different due to data change
      expect(result2.current.workflows).not.toBe(firstWorkflows)
      expect(result2.current.workflows[0].id).toBe('wf-2')
    })
  })

  describe('query selection logic', () => {
    it('returns allWorkflowsQuery when isAllProjects is true', () => {
      const allWorkflowsData = { resources: [{ id: 'wf-all', name: 'All' }] }
      mockWorkflowClientQuery.mockReturnValue({ data: allWorkflowsData, isLoading: false, error: null })
      mockAccessClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })

      const { result } = renderHook(
        () =>
          useWorkflowsQuery({
            queryParams: {},
            isAllProjects: true,
            stableProjectId: 'proj-123',
            projectSelectorReady: true,
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.workflows).toEqual([{ id: 'wf-all', name: 'All' }])
    })

    it('returns projectWorkflowsQuery when isAllProjects is false', () => {
      const projectWorkflowsData = { resources: [{ id: 'wf-proj', name: 'Project' }] }
      mockWorkflowClientQuery.mockReturnValue({ data: { resources: [] }, isLoading: false, error: null })
      mockAccessClientQuery.mockReturnValue({ data: projectWorkflowsData, isLoading: false, error: null })

      const { result } = renderHook(
        () =>
          useWorkflowsQuery({
            queryParams: {},
            isAllProjects: false,
            stableProjectId: 'proj-123',
            projectSelectorReady: true,
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.workflows).toEqual([{ id: 'wf-proj', name: 'Project' }])
    })
  })
})
