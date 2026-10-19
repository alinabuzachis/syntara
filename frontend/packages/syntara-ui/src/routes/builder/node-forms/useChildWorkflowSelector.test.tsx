import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkflowsQuery } from '../../workflows/useWorkflowsQuery'

import { InvocationSchemaFetchError, useChildWorkflowSelector } from './useChildWorkflowSelector'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../../../client', () => ({ workflowFetchClient: { GET: mocks.get } }))
vi.mock('../../workflows/useWorkflowsQuery', () => ({ useWorkflowsQuery: vi.fn() }))

const testWorkflows = [
  {
    id: 'workflow-1',
    name: 'Eligible workflow',
    current_version: 8,
    published_version_number: 4,
    is_enabled: true,
    project_id: 'project-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'workflow-2',
    name: 'No trigger workflow',
    current_version: 2,
    published_version_number: 2,
    is_enabled: true,
    project_id: 'project-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'workflow-3',
    name: 'Unpublished workflow',
    current_version: 1,
    published_version_number: null,
    is_enabled: true,
    project_id: 'project-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useChildWorkflowSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useWorkflowsQuery).mockReturnValue({
      workflowsQuery: { isLoading: false, isError: false },
      workflows: testWorkflows,
    } as never)
    mocks.get.mockImplementation((_path: string, options: { params: { path: { workflow_id: string } } }) => {
      const workflowId = options.params.path.workflow_id
      if (workflowId === 'workflow-2') {
        return Promise.resolve({
          data: {
            workflow_id: workflowId,
            published_version_id: 'version-2',
            published_version: 2,
            is_eligible: false,
            triggers: [],
          },
          response: new Response(),
        })
      }

      return Promise.resolve({
        data: {
          workflow_id: workflowId,
          published_version_id: 'version-4',
          published_version: 4,
          is_eligible: true,
          triggers: [{ trigger_node_id: 'sub-trigger', name: 'Subworkflow Trigger', input_schema: {} }],
        },
        response: new Response(),
      })
    })
  })

  it('shows only published workflows with eligible Subworkflow Triggers in the same project', async () => {
    const { result } = renderHook(
      () => useChildWorkflowSelector({ projectId: 'project-1', selectedWorkflowId: null }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.options).toHaveLength(1))

    expect(result.current.options[0]).toMatchObject({ value: 'workflow-1', label: 'Eligible workflow (v4)' })
    expect(useWorkflowsQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryParams: { is_enabled: true },
        isAllProjects: false,
        stableProjectId: 'project-1',
        projectSelectorReady: true,
      })
    )
  })

  it('loads the schema for a previously selected workflow even if it is absent from the list', async () => {
    const { result } = renderHook(
      () => useChildWorkflowSelector({ projectId: 'project-1', selectedWorkflowId: 'workflow-private' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.selectedSchema?.workflow_id).toBe('workflow-private'))
    expect(mocks.get).toHaveBeenCalledWith('/workflows/{workflow_id}/invocation-schema', {
      params: { path: { workflow_id: 'workflow-private' } },
    })
  })

  it('preserves the HTTP status for authorization handling', async () => {
    mocks.get.mockImplementation((_path: string, options: { params: { path: { workflow_id: string } } }) =>
      Promise.resolve({
        error: { detail: 'Forbidden' },
        response: new Response(null, { status: options.params.path.workflow_id === 'private' ? 403 : 404 }),
      })
    )

    const { result } = renderHook(
      () => useChildWorkflowSelector({ projectId: 'project-1', selectedWorkflowId: 'private' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.selectedSchemaError).toBeInstanceOf(InvocationSchemaFetchError))
    expect(result.current.selectedSchemaError).toMatchObject({ status: 403 })
  })
})
