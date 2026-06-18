import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { PendingImportData } from '../useWorkflowImportExport'

import { useBuilderImportHandlers, type UseBuilderImportHandlersParams } from './useBuilderImportHandlers'

const mockReplaceWorkflowContent = vi.fn()

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: () => ({ replaceWorkflowContent: mockReplaceWorkflowContent }),
  },
}))

vi.mock('../../../utils/apiErrors', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'Unknown error'),
}))

const mockPendingImport = {
  workflowDef: {
    name: 'Imported Workflow',
    schema_version: '2.0.0' as const,
    workflow: { activities: [] },
    triggers: [],
  },
  edges: [],
  nodePositions: {},
  name: 'Imported Workflow',
  description: 'A test workflow',
} satisfies PendingImportData

function createParams(overrides: Partial<UseBuilderImportHandlersParams> = {}): UseBuilderImportHandlersParams {
  return {
    dispatch: vi.fn(),
    markDirty: vi.fn(),
    selectedProject: { id: 'proj-1' },
    createWorkflow: vi.fn(),
    setLocation: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useBuilderImportHandlers', () => {
  describe('handleImportCurrent', () => {
    it('does nothing when pendingImport is null', () => {
      const params = createParams()
      const { result } = renderHook(() => useBuilderImportHandlers(params, null, vi.fn()))

      act(() => result.current.handleImportCurrent())

      expect(mockReplaceWorkflowContent).not.toHaveBeenCalled()
    })

    it('applies import to canvas and clears pending state', () => {
      const params = createParams()
      const setPendingImport = vi.fn()
      const { result } = renderHook(() => useBuilderImportHandlers(params, mockPendingImport, setPendingImport))

      act(() => result.current.handleImportCurrent())

      expect(mockReplaceWorkflowContent).toHaveBeenCalled()
      expect(params.markDirty).toHaveBeenCalled()
      expect(setPendingImport).toHaveBeenCalledWith(null)
    })
  })

  describe('handleImportNew', () => {
    it('does nothing when pendingImport is null', () => {
      const params = createParams()
      const { result } = renderHook(() => useBuilderImportHandlers(params, null, vi.fn()))

      act(() => result.current.handleImportNew())

      expect(params.createWorkflow).not.toHaveBeenCalled()
    })

    it('shows error when no project is selected', () => {
      const params = createParams({ selectedProject: null })
      const { result } = renderHook(() => useBuilderImportHandlers(params, mockPendingImport, vi.fn()))

      act(() => result.current.handleImportNew())

      expect(params.showError).toHaveBeenCalledWith({
        title: 'Project required',
        description: 'Select a project to import this workflow.',
      })
      expect(params.createWorkflow).not.toHaveBeenCalled()
    })

    it('calls createWorkflow with correct payload', () => {
      const params = createParams()
      const { result } = renderHook(() => useBuilderImportHandlers(params, mockPendingImport, vi.fn()))

      act(() => result.current.handleImportNew())

      expect(params.createWorkflow).toHaveBeenCalledOnce()
      const body = vi.mocked(params.createWorkflow).mock.calls[0][0].body
      expect(body).toMatchObject({
        name: 'Imported Workflow',
        description: 'A test workflow',
        project_id: 'proj-1',
      })
    })

    it('uses fallback name when import has no name', () => {
      const params = createParams()
      const noNameImport = { ...mockPendingImport, name: '' }
      const { result } = renderHook(() => useBuilderImportHandlers(params, noNameImport, vi.fn()))

      act(() => result.current.handleImportNew())

      expect(params.createWorkflow).toHaveBeenCalledOnce()
      const body = vi.mocked(params.createWorkflow).mock.calls[0][0].body
      expect(body).toMatchObject({ name: 'imported-workflow' })
    })

    it('navigates and shows success on create success', () => {
      const params = createParams()
      const setPendingImport = vi.fn()
      const { result } = renderHook(() => useBuilderImportHandlers(params, mockPendingImport, setPendingImport))

      act(() => result.current.handleImportNew())

      const createCall = vi.mocked(params.createWorkflow).mock.calls[0]
      const onSuccess = createCall[1]?.onSuccess as (data: { id?: string }) => void
      act(() => onSuccess({ id: 'new-wf-1' }))

      expect(setPendingImport).toHaveBeenCalledWith(null)
      expect(params.showSuccess).toHaveBeenCalledWith({
        title: 'Workflow imported',
        description: 'Created "Imported Workflow"',
      })
      expect(params.setLocation).toHaveBeenCalledWith('/workflow-builder/new-wf-1')
    })

    it('shows error on create failure', () => {
      const params = createParams()
      const { result } = renderHook(() => useBuilderImportHandlers(params, mockPendingImport, vi.fn()))

      act(() => result.current.handleImportNew())

      const createCall = vi.mocked(params.createWorkflow).mock.calls[0]
      const onError = createCall[1]?.onError as (error: unknown) => void
      act(() => onError(new Error('Network failure')))

      expect(params.showError).toHaveBeenCalledWith({
        title: 'Import failed',
        description: 'Network failure',
      })
    })
  })

  describe('clearPendingImport', () => {
    it('sets pending import to null', () => {
      const setPendingImport = vi.fn()
      const { result } = renderHook(() => useBuilderImportHandlers(createParams(), mockPendingImport, setPendingImport))

      act(() => result.current.clearPendingImport())

      expect(setPendingImport).toHaveBeenCalledWith(null)
    })
  })
})
