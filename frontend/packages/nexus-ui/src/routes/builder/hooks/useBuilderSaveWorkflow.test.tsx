import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, type MockedFunction } from 'vitest'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import { detachPromise } from '../../../utils/detachPromise'

import type { UseBuilderSaveWorkflowParams } from './useBuilderSaveWorkflow'
import { useBuilderSaveWorkflow } from './useBuilderSaveWorkflow'

type CreateWorkflow = UseBuilderSaveWorkflowParams['createWorkflow']
type UpdateWorkflow = UseBuilderSaveWorkflowParams['updateWorkflow']
type CreateResponse = Parameters<NonNullable<NonNullable<Parameters<CreateWorkflow>[1]>['onSuccess']>>[0]
type UpdateResponse = Parameters<NonNullable<NonNullable<Parameters<UpdateWorkflow>[1]>['onSuccess']>>[0]

const baseCreateResponse: CreateResponse = {
  id: 'test-id',
  name: 'test-wf',
  current_version: 1,
  is_enabled: true,
  created_by: 'user-1',
  project_id: 'proj-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const baseUpdateResponse: UpdateResponse = {
  ...baseCreateResponse,
  version: {
    id: 'ver-1',
    workflow_id: 'test-id',
    version: 1,
    schema_version: '2.0.0',
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    workflow_definition: { schema_version: '2.0.0', name: 'test-wf', triggers: [], nodes: [], edges: [] },
  },
}

function createResponse(overrides: Partial<CreateResponse> = {}): CreateResponse {
  return { ...baseCreateResponse, ...overrides }
}

function updateResponse(overrides: Partial<UpdateResponse> = {}): UpdateResponse {
  return { ...baseUpdateResponse, ...overrides }
}

function minimalWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    schema_version: '2.0.0',
    name: 'test-wf',
    description: 'd',
    workflow: { activities: [] },
    ...overrides,
  }
}

function buildParams(overrides: Partial<UseBuilderSaveWorkflowParams> = {}): UseBuilderSaveWorkflowParams {
  return {
    currentWorkflow: minimalWorkflow(),
    workflowName: 'test-wf',
    workflowDescription: 'd',
    workflowId: null,
    isNew: true,
    /** Create path requires a project; tests that assert missing-project behavior override with `null`. */
    selectedProject: { id: 'default-test-project' },
    workflowsListResources: undefined,
    queryClient: {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as unknown as UseBuilderSaveWorkflowParams['queryClient'],
    setLocation: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    markClean: vi.fn(),
    expectedVersion: null,
    createWorkflow: vi.fn(),
    updateWorkflow: vi.fn(),
    ...overrides,
  }
}

describe('useBuilderSaveWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkflowStore.setState({
      currentWorkflow: minimalWorkflow({
        workflow: {
          activities: [{ type: 'script', id: 'script3', name: 'Orphan Script', parameters: {} }],
        },
      }),
    })
  })

  it('returns false and shows error when there is no current workflow', async () => {
    const showError = vi.fn()
    const { result } = renderHook(() => useBuilderSaveWorkflow(buildParams({ currentWorkflow: null, showError })))

    await expect(result.current()).resolves.toBe(false)
    expect(showError).toHaveBeenCalledWith({ title: 'Save failed', description: 'No workflow to save' })
  })

  it('returns false and shows danger toast when create path has no project', async () => {
    const showError = vi.fn()
    const onMissingProjectForCreate = vi.fn()
    const createWorkflow = vi.fn()
    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          showError,
          onMissingProjectForCreate,
          isNew: true,
          selectedProject: null,
          workflowId: null,
          createWorkflow,
        })
      )
    )

    await expect(result.current()).resolves.toBe(false)
    expect(showError).toHaveBeenCalledWith({
      title: 'Project required',
      description: 'Select a project to save this workflow.',
    })
    expect(onMissingProjectForCreate).toHaveBeenCalledOnce()
    expect(createWorkflow).not.toHaveBeenCalled()
  })

  it('updates existing workflow with patch payload', async () => {
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(updateResponse()))
    }) as MockedFunction<UpdateWorkflow>
    const markClean = vi.fn()
    const showSuccess = vi.fn()
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          workflowId: 'existing-id',
          isNew: false,
          updateWorkflow,
          markClean,
          showSuccess,
          queryClient: { invalidateQueries } as unknown as UseBuilderSaveWorkflowParams['queryClient'],
        })
      )
    )

    await expect(result.current()).resolves.toBe(true)

    expect(updateWorkflow).toHaveBeenCalledTimes(1)
    const [vars] = updateWorkflow.mock.calls[0]
    expect(vars.params.path.workflow_id).toBe('existing-id')
    expect(vars.body).toMatchObject({
      name: 'test-wf',
      description: 'd',
    })
    expect(vars.body).not.toHaveProperty('labels')
    expect(markClean).toHaveBeenCalled()
    expect(showSuccess).toHaveBeenCalledWith(expect.objectContaining({ title: 'Workflow saved' }))
    expect(invalidateQueries).toHaveBeenCalled()
  })

  it('creates workflow in one call without labels', async () => {
    const showSuccess = vi.fn()
    const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(createResponse({ id: 'new-wf-id' })))
    }) as MockedFunction<CreateWorkflow>
    const setLocation = vi.fn()
    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(buildParams({ createWorkflow, setLocation, showSuccess }))
    )

    await expect(result.current()).resolves.toBe(true)

    expect(showSuccess).toHaveBeenCalledWith({ title: 'Workflow created', description: 'test-wf has been saved.' })
    expect(createWorkflow).toHaveBeenCalledTimes(1)
    const [{ body }] = createWorkflow.mock.calls[0]
    expect(body.labels).toBeUndefined()
    expect(setLocation).toHaveBeenCalledWith('/workflow-builder/new-wf-id')
  })

  it('includes project_id on create when isNew and selectedProject are set', async () => {
    const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(createResponse({ id: 'id-3' })))
    }) as MockedFunction<CreateWorkflow>
    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          createWorkflow,
          selectedProject: { id: 'proj-99' },
        })
      )
    )

    await expect(result.current()).resolves.toBe(true)

    const [{ body }] = createWorkflow.mock.calls[0]
    expect(body.project_id).toBe('proj-99')
  })

  it('shows create error and resolves false when create fails', async () => {
    const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
      detachPromise(args[1]?.onError?.(new Error('network')))
    }) as MockedFunction<CreateWorkflow>
    const showError = vi.fn()
    const { result } = renderHook(() => useBuilderSaveWorkflow(buildParams({ createWorkflow, showError })))

    await expect(result.current()).resolves.toBe(false)
    expect(showError).toHaveBeenCalledWith({
      title: 'Create failed',
      description: expect.stringContaining('Failed to create workflow') as unknown as string,
    })
  })

  it('does not call create when update path is used', async () => {
    const createWorkflow = vi.fn() as MockedFunction<CreateWorkflow>
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(updateResponse()))
    }) as MockedFunction<UpdateWorkflow>
    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          workflowId: 'w1',
          isNew: false,
          createWorkflow,
          updateWorkflow,
        })
      )
    )

    await expect(result.current()).resolves.toBe(true)
    expect(createWorkflow).not.toHaveBeenCalled()
  })

  it('applies default name when new workflow still uses default name', async () => {
    const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(createResponse({ id: 'n1' })))
    }) as MockedFunction<CreateWorkflow>
    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          createWorkflow,
          workflowName: 'new-workflow',
          isNew: true,
          workflowsListResources: [{ name: 'new-workflow' }, { name: 'other' }],
        })
      )
    )

    await expect(result.current()).resolves.toBe(true)

    const [{ body }] = createWorkflow.mock.calls[0]
    expect(body.name).toBe('new-workflow-1')
  })

  it('shows error and resolves false when create returns a validation warning', async () => {
    const validationError = { code: 'WORKFLOW_DEFINITION_WARNINGS', detail: 'has warnings' }
    const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
      detachPromise(args[1]?.onError?.(validationError))
    }) as MockedFunction<CreateWorkflow>
    const showError = vi.fn()

    const { result } = renderHook(() => useBuilderSaveWorkflow(buildParams({ createWorkflow, showError })))

    await expect(result.current()).resolves.toBe(false)
    expect(showError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Create failed',
        description: expect.stringContaining('has warnings') as unknown as string,
      })
    )
  })

  it('shows error and resolves false when update returns a validation warning', async () => {
    const validationError = { code: 'WORKFLOW_DEFINITION_WARNINGS', detail: 'has warnings' }
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(args[1]?.onError?.(validationError))
    }) as MockedFunction<UpdateWorkflow>
    const showError = vi.fn()

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(buildParams({ workflowId: 'w1', isNew: false, updateWorkflow, showError }))
    )

    await expect(result.current()).resolves.toBe(false)
    expect(showError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Update failed',
        description: expect.stringContaining('has warnings') as unknown as string,
      })
    )
  })

  it('shows "saved with warnings", syncs version, and fires onSaveWithValidationIssues when has_validation_issues is true', async () => {
    const showSuccess = vi.fn()
    const onSaveWithValidationIssues = vi.fn()
    const onVersionUpdated = vi.fn()
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(updateResponse({ has_validation_issues: true, current_version: 4 })))
    }) as MockedFunction<UpdateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          workflowId: 'w1',
          isNew: false,
          updateWorkflow,
          showSuccess,
          onSaveWithValidationIssues,
          onVersionUpdated,
        })
      )
    )

    await expect(result.current()).resolves.toBe(true)
    expect(showSuccess).toHaveBeenCalledWith(expect.objectContaining({ title: 'Workflow saved with warnings' }))
    expect(onSaveWithValidationIssues).toHaveBeenCalledOnce()
    // Prevents false "Run conflict / saved by another user" after our own warnings save
    expect(onVersionUpdated).toHaveBeenCalledWith(4)
  })

  it('applies inline validation_result findings on save-with-warnings instead of re-validating', async () => {
    const onSaveWithValidationIssues = vi.fn()
    const onValidationFindings = vi.fn()
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(
        args[1]?.onSuccess?.(
          updateResponse({
            has_validation_issues: true,
            current_version: 3,
            validation_result: {
              is_valid: false,
              error_count: 1,
              warning_count: 0,
              findings: [
                {
                  severity: 'error',
                  category: 'orphaned_node',
                  message: "Node 'script3' is unreachable from any trigger",
                  node_id: 'script3',
                },
              ],
            },
          })
        )
      )
    }) as MockedFunction<UpdateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          workflowId: 'w1',
          isNew: false,
          updateWorkflow,
          onSaveWithValidationIssues,
          onValidationFindings,
        })
      )
    )

    await expect(result.current()).resolves.toBe(true)
    expect(onValidationFindings).toHaveBeenCalledWith([
      expect.objectContaining({
        message: 'Step "Orphan Script" is unreachable from any trigger',
        nodeId: 'script3',
        nodeName: 'Orphan Script',
        severity: 'error',
      }),
    ])
    expect(onSaveWithValidationIssues).not.toHaveBeenCalled()
  })

  it('surfaces validation_result findings in the update-failed toast and callback', async () => {
    const showError = vi.fn()
    const onValidationFindings = vi.fn()
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(
        args[1]?.onError?.({
          code: 'WORKFLOW_DEFINITION_INVALID',
          detail: 'The workflow definition failed validation',
          validation_result: {
            findings: [
              {
                message: "Node 'script3' is unreachable from any trigger",
                node_id: 'script3',
                severity: 'error',
              },
            ],
          },
        })
      )
    }) as MockedFunction<UpdateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          workflowId: 'w1',
          isNew: false,
          updateWorkflow,
          showError,
          onValidationFindings,
        })
      )
    )

    await expect(result.current()).resolves.toBe(false)
    expect(showError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Update failed',
        description: expect.stringContaining(
          'Step "Orphan Script" is unreachable from any trigger'
        ) as unknown as string,
      })
    )
    expect(onValidationFindings).toHaveBeenCalledWith([
      expect.objectContaining({
        message: 'Step "Orphan Script" is unreachable from any trigger',
        nodeId: 'script3',
        nodeName: 'Orphan Script',
      }),
    ])
  })

  it('unwraps openapi-fetch cause wrappers when extracting validation findings on save error', async () => {
    const showError = vi.fn()
    const onValidationFindings = vi.fn()
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(
        args[1]?.onError?.({
          cause: {
            code: 'WORKFLOW_DEFINITION_INVALID',
            detail: 'The workflow definition failed validation',
            validation_result: {
              findings: [{ message: 'Step is not connected', node_id: 'script3', severity: 'error' }],
            },
          },
        })
      )
    }) as MockedFunction<UpdateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          workflowId: 'w1',
          isNew: false,
          updateWorkflow,
          showError,
          onValidationFindings,
        })
      )
    )

    await expect(result.current()).resolves.toBe(false)
    expect(showError).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('Step is not connected') as unknown as string,
      })
    )
    expect(onValidationFindings).toHaveBeenCalledOnce()
  })

  it('shows "created with warnings" when new workflow has validation issues', async () => {
    const showSuccess = vi.fn()
    const onSaveWithValidationIssues = vi.fn()
    const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(createResponse({ id: 'new-id', has_validation_issues: true })))
    }) as MockedFunction<CreateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({
          createWorkflow,
          showSuccess,
          onSaveWithValidationIssues,
        })
      )
    )

    await expect(result.current()).resolves.toBe(true)
    expect(showSuccess).toHaveBeenCalledWith(expect.objectContaining({ title: 'Workflow created with warnings' }))
    expect(onSaveWithValidationIssues).toHaveBeenCalledOnce()
  })
})

describe('version conflict detection', () => {
  it('calls onConflict when server returns WORKFLOW_VERSION_CONFLICT', async () => {
    const onConflict = vi.fn()
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      args[1]?.onError?.({
        code: 'WORKFLOW_VERSION_CONFLICT',
        current_version: 5,
        expected_version: 3,
        created_by_username: 'alice',
        created_at: '2026-01-01',
      })
    }) as MockedFunction<UpdateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(
        buildParams({ updateWorkflow, onConflict, expectedVersion: 3, workflowId: 'wf-1', isNew: false })
      )
    )

    await expect(result.current()).resolves.toBe(false)
    expect(onConflict).toHaveBeenCalledOnce()
    expect(onConflict).toHaveBeenCalledWith(
      expect.objectContaining({ currentVersion: 5, expectedVersion: 3, createdByUsername: 'alice' })
    )
  })

  it('sends expected_version in patch body when provided', async () => {
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(updateResponse()))
    }) as MockedFunction<UpdateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(buildParams({ updateWorkflow, expectedVersion: 7, workflowId: 'wf-1', isNew: false }))
    )

    await expect(result.current()).resolves.toBe(true)
    const [{ body }] = updateWorkflow.mock.calls[0]
    expect(body.expected_version).toBe(7)
  })

  it('uses expectedVersionOverride instead of loadedVersion when provided', async () => {
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(updateResponse()))
    }) as MockedFunction<UpdateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(buildParams({ updateWorkflow, expectedVersion: 7, workflowId: 'wf-1', isNew: false }))
    )

    await expect(result.current({ expectedVersionOverride: 10 })).resolves.toBe(true)
    const [{ body }] = updateWorkflow.mock.calls[0]
    expect(body.expected_version).toBe(10)
  })

  it('calls onVersionUpdated with new version after successful save', async () => {
    const onVersionUpdated = vi.fn()
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.(updateResponse({ current_version: 8 })))
    }) as MockedFunction<UpdateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(buildParams({ updateWorkflow, onVersionUpdated, workflowId: 'wf-1', isNew: false }))
    )

    await expect(result.current()).resolves.toBe(true)
    expect(onVersionUpdated).toHaveBeenCalledWith(8)
  })
})
