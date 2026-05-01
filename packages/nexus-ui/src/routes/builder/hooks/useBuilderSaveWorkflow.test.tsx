import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, type MockedFunction } from 'vitest'

import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import { detachPromise } from '../../../utils/detachPromise'

import type { UseBuilderSaveWorkflowParams } from './useBuilderSaveWorkflow'
import { useBuilderSaveWorkflow } from './useBuilderSaveWorkflow'

type CreateWorkflow = UseBuilderSaveWorkflowParams['createWorkflow']
type UpdateWorkflow = UseBuilderSaveWorkflowParams['updateWorkflow']

const validateWorkflowMock = vi.hoisted(() =>
  vi.fn(() => ({
    valid: true,
    errors: [] as { message: string }[],
    warnings: [] as { message: string }[],
  }))
)

vi.mock('../utils/validation', () => ({
  validateWorkflow: validateWorkflowMock,
}))

const getStateMock = vi.hoisted(() => vi.fn(() => ({ edges: [] })))

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: { getState: getStateMock },
}))

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
    workflowTags: [],
    isEnabled: true,
    workflowId: null,
    isNew: true,
    selectedProject: null,
    workflowsListResources: undefined,
    queryClient: {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as unknown as UseBuilderSaveWorkflowParams['queryClient'],
    setLocation: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    markClean: vi.fn(),
    createWorkflow: vi.fn(),
    updateWorkflow: vi.fn(),
    ...overrides,
  }
}

describe('useBuilderSaveWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    validateWorkflowMock.mockReturnValue({ valid: true, errors: [], warnings: [] })
  })

  it('returns false and shows error when there is no current workflow', async () => {
    const showError = vi.fn()
    const { result } = renderHook(() => useBuilderSaveWorkflow(buildParams({ currentWorkflow: null, showError })))

    await expect(result.current()).resolves.toBe(false)
    expect(showError).toHaveBeenCalledWith({ title: 'Validation failed', description: 'No workflow to save' })
  })

  it('returns false and shows error when validation fails', async () => {
    validateWorkflowMock.mockReturnValueOnce({
      valid: false,
      errors: [{ message: 'bad' }],
      warnings: [],
    })
    const showError = vi.fn()
    const { result } = renderHook(() => useBuilderSaveWorkflow(buildParams({ showError })))

    await expect(result.current()).resolves.toBe(false)
    expect(showError).toHaveBeenCalledWith({
      title: 'Validation failed',
      description: expect.stringContaining('bad') as unknown as string,
    })
  })

  it('updates existing workflow with patch payload', async () => {
    const updateWorkflow = vi.fn((...args: Parameters<UpdateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.())
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
      is_enabled: true,
      labels: {},
    })
    expect(markClean).toHaveBeenCalled()
    expect(showSuccess).toHaveBeenCalledWith({ title: 'Workflow saved', description: 'Workflow updated successfully' })
    expect(invalidateQueries).toHaveBeenCalled()
  })

  it('creates workflow in one call without labels when there are no tags', async () => {
    const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.({ id: 'new-wf-id' }))
    }) as MockedFunction<CreateWorkflow>
    const setLocation = vi.fn()
    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(buildParams({ createWorkflow, setLocation, workflowTags: [] }))
    )

    await expect(result.current()).resolves.toBe(true)

    expect(createWorkflow).toHaveBeenCalledTimes(1)
    const [{ body }] = createWorkflow.mock.calls[0]
    expect(body.labels).toBeUndefined()
    expect(setLocation).toHaveBeenCalledWith('/workflow-builder/new-wf-id')
  })

  it('creates workflow in one call with labels when tags are present', async () => {
    const createWorkflow = vi.fn((...args: Parameters<CreateWorkflow>) => {
      detachPromise(args[1]?.onSuccess?.({ id: 'id-2' }))
    }) as MockedFunction<CreateWorkflow>
    const { result } = renderHook(() =>
      useBuilderSaveWorkflow(buildParams({ createWorkflow, workflowTags: ['env', 'team'] }))
    )

    await expect(result.current()).resolves.toBe(true)

    const [{ body }] = createWorkflow.mock.calls[0]
    expect(body.labels).toEqual({ env: '', team: '' })
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
      detachPromise(args[1]?.onSuccess?.())
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
})
