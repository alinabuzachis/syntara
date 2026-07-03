import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, type MockedFunction } from 'vitest'

import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import { detachPromise } from '../../../utils/detachPromise'

import type { UseBuilderSaveWorkflowParams } from './useBuilderSaveWorkflow'
import { useBuilderSaveWorkflow } from './useBuilderSaveWorkflow'

const mockPatch = vi.fn<(...args: unknown[]) => Promise<{ data?: unknown; error?: unknown }>>()
const mockPost = vi.fn<(...args: unknown[]) => Promise<{ data?: unknown; error?: unknown }>>()

vi.mock('../../../client', () => ({
  workflowFetchClient: {
    PATCH: (...args: unknown[]) => mockPatch(...args),
    POST: (...args: unknown[]) => mockPost(...args),
  },
}))

type CreateWorkflow = UseBuilderSaveWorkflowParams['createWorkflow']
type UpdateWorkflow = UseBuilderSaveWorkflowParams['updateWorkflow']

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
      detachPromise(args[1]?.onSuccess?.({}))
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
    expect(showSuccess).not.toHaveBeenCalled()
    expect(invalidateQueries).toHaveBeenCalled()
  })

  it('creates workflow in one call without labels', async () => {
    const showSuccess = vi.fn()
    const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.({ id: 'new-wf-id' }))
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
      detachPromise(args[1]?.onSuccess?.({ id: 'id-3' }))
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
      detachPromise(args[1]?.onSuccess?.({}))
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
      detachPromise(args[1]?.onSuccess?.({ id: 'n1' }))
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

  describe('force_save retry on validation errors', () => {
    const retryableError = { code: 'WORKFLOW_DEFINITION_WARNINGS', detail: 'has warnings' }

    it('retries create with force_save on validation warning and succeeds', async () => {
      const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
        detachPromise(args[1]?.onError?.(retryableError))
      }) as MockedFunction<CreateWorkflow>
      mockPost.mockResolvedValue({ data: { id: 'forced-id' } })
      const showSuccess = vi.fn()
      const markClean = vi.fn()
      const setLocation = vi.fn()
      const invalidateQueries = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useBuilderSaveWorkflow(
          buildParams({
            createWorkflow,
            showSuccess,
            markClean,
            setLocation,
            queryClient: { invalidateQueries } as unknown as UseBuilderSaveWorkflowParams['queryClient'],
          })
        )
      )

      const savePromise = result.current()

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalled()
      })
      await expect(savePromise).resolves.toBe(true)
      expect(markClean).toHaveBeenCalled()
      expect(showSuccess).toHaveBeenCalledWith(expect.objectContaining({ title: 'Workflow created with warnings' }))
      expect(setLocation).toHaveBeenCalledWith('/workflow-builder/forced-id')
    })

    it('shows error when create force_save retry fails', async () => {
      const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
        detachPromise(args[1]?.onError?.(retryableError))
      }) as MockedFunction<CreateWorkflow>
      mockPost.mockResolvedValue({ error: { detail: 'still broken' } })
      const showError = vi.fn()

      const { result } = renderHook(() => useBuilderSaveWorkflow(buildParams({ createWorkflow, showError })))

      const savePromise = result.current()

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalled()
      })
      await expect(savePromise).resolves.toBe(false)
      expect(showError).toHaveBeenCalledWith(expect.objectContaining({ title: 'Save failed' }))
    })

    it('retries update with force_save on validation warning and succeeds', async () => {
      const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
        detachPromise(args[1]?.onError?.(retryableError))
      }) as MockedFunction<UpdateWorkflow>
      mockPatch.mockResolvedValue({})
      const showSuccess = vi.fn()
      const markClean = vi.fn()
      const invalidateQueries = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useBuilderSaveWorkflow(
          buildParams({
            workflowId: 'existing-id',
            isNew: false,
            updateWorkflow,
            showSuccess,
            markClean,
            queryClient: { invalidateQueries } as unknown as UseBuilderSaveWorkflowParams['queryClient'],
          })
        )
      )

      const savePromise = result.current()

      await waitFor(() => {
        expect(mockPatch).toHaveBeenCalled()
      })
      await expect(savePromise).resolves.toBe(true)
      expect(markClean).toHaveBeenCalled()
      expect(showSuccess).toHaveBeenCalledWith(expect.objectContaining({ title: 'Workflow saved with warnings' }))
    })

    it('shows error when update force_save retry fails', async () => {
      const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
        detachPromise(args[1]?.onError?.(retryableError))
      }) as MockedFunction<UpdateWorkflow>
      mockPatch.mockResolvedValue({ error: { detail: 'patch failed' } })
      const showError = vi.fn()

      const { result } = renderHook(() =>
        useBuilderSaveWorkflow(buildParams({ workflowId: 'w1', isNew: false, updateWorkflow, showError }))
      )

      const savePromise = result.current()

      await waitFor(() => {
        expect(mockPatch).toHaveBeenCalled()
      })
      await expect(savePromise).resolves.toBe(false)
      expect(showError).toHaveBeenCalledWith(expect.objectContaining({ title: 'Save failed' }))
    })

    it('handles exception during force_save retry', async () => {
      const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
        detachPromise(args[1]?.onError?.(retryableError))
      }) as MockedFunction<CreateWorkflow>
      mockPost.mockRejectedValue(new Error('network crash'))
      const showError = vi.fn()

      const { result } = renderHook(() => useBuilderSaveWorkflow(buildParams({ createWorkflow, showError })))

      const savePromise = result.current()

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalled()
      })
      await expect(savePromise).resolves.toBe(false)
      expect(showError).toHaveBeenCalledWith(expect.objectContaining({ title: 'Save failed' }))
    })

    it('calls onForceSaveSuccess with original error on successful retry', async () => {
      const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
        detachPromise(args[1]?.onError?.(retryableError))
      }) as MockedFunction<CreateWorkflow>
      mockPost.mockResolvedValue({ data: { id: 'id-x' } })
      const onForceSaveSuccess = vi.fn()

      const { result } = renderHook(() => useBuilderSaveWorkflow(buildParams({ createWorkflow, onForceSaveSuccess })))

      const savePromise = result.current()

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalled()
      })
      await expect(savePromise).resolves.toBe(true)
      expect(onForceSaveSuccess).toHaveBeenCalledWith(retryableError)
    })
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
      detachPromise(args[1]?.onSuccess?.({}))
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
      detachPromise(args[1]?.onSuccess?.({}))
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
      detachPromise(args[1]?.onSuccess?.({ current_version: 8 }))
    }) as MockedFunction<UpdateWorkflow>

    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(buildParams({ updateWorkflow, onVersionUpdated, workflowId: 'wf-1', isNew: false }))
    )

    await expect(result.current()).resolves.toBe(true)
    expect(onVersionUpdated).toHaveBeenCalledWith(8)
  })
})
