import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useWorkflowImportExport } from './useWorkflowImportExport'

const mockShowError = vi.fn()
const mockDispatch = vi.fn()
const mockMarkDirty = vi.fn()
const mockDownload = vi.fn()
const mockParseWorkflowFile = vi.fn<(...args: unknown[]) => Record<string, unknown>>()
const mockValidateFileSize = vi.fn()
const mockLoadDefinition = vi.fn<() => { workflowDef: Record<string, unknown>; edges: unknown[] }>()
const mockBuildDefinition = vi.fn<(...args: unknown[]) => Record<string, unknown>>()
const mockReplaceWorkflowContent = vi.fn()
const mockGetState = vi.fn<() => Record<string, unknown>>()

vi.mock('../../providers/alerts', () => ({
  useAlerts: () => ({ showError: mockShowError }),
}))

vi.mock('../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: () => mockGetState(),
  },
}))

vi.mock('../../utils/apiErrors', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'Unknown error'),
}))

vi.mock('../../utils/downloadWorkflowExport', () => ({
  downloadWorkflowDefinition: (...args: unknown[]) => mockDownload(...args) as void,
  parseWorkflowFile: (...args: unknown[]) => mockParseWorkflowFile(...args),
  validateFileSize: (...args: unknown[]) => mockValidateFileSize(...args) as void,
}))

vi.mock('./utils/parseImportedDefinition', () => ({
  parseImportedDefinition: () => mockLoadDefinition(),
}))

vi.mock('./utils/workflowDefinitionBuilder', () => ({
  buildWorkflowDefinition: (...args: unknown[]) => mockBuildDefinition(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetState.mockReturnValue({
    currentWorkflow: null,
    edges: [],
    replaceWorkflowContent: mockReplaceWorkflowContent,
  })
})

describe('useWorkflowImportExport', () => {
  function renderImportExportHook() {
    return renderHook(() => useWorkflowImportExport({ dispatch: mockDispatch, markDirty: mockMarkDirty }))
  }

  describe('handleExport', () => {
    it('closes kebab when no current workflow', () => {
      const { result } = renderImportExportHook()

      act(() => result.current.handleExport())

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_KEBAB_OPEN', payload: false })
      expect(mockDownload).not.toHaveBeenCalled()
    })

    it('exports and closes kebab on success', () => {
      mockGetState.mockReturnValue({
        currentWorkflow: {
          name: 'Test',
          description: 'desc',
          workflow: { activities: [] },
          triggers: [],
        },
        edges: [],
      })
      mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })

      const { result } = renderImportExportHook()

      act(() => result.current.handleExport())

      expect(mockBuildDefinition).toHaveBeenCalled()
      expect(mockDownload).toHaveBeenCalled()
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_KEBAB_OPEN', payload: false })
    })

    it('shows error toast and closes kebab on failure', () => {
      mockGetState.mockReturnValue({
        currentWorkflow: {
          name: 'Test',
          workflow: { activities: [] },
          triggers: [],
        },
        edges: [],
      })
      mockBuildDefinition.mockImplementation(() => {
        throw new Error('Build failed')
      })

      const { result } = renderImportExportHook()

      act(() => result.current.handleExport())

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Export failed',
        description: 'Build failed',
      })
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_KEBAB_OPEN', payload: false })
    })
  })

  describe('handleImportFile', () => {
    function createFileChangeEvent(file: File | null) {
      return {
        target: {
          files: file ? [file] : [],
          value: 'some-path',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>
    }

    it('does nothing when no file selected', () => {
      const { result } = renderImportExportHook()

      act(() => result.current.handleImportFile(createFileChangeEvent(null)))

      expect(mockValidateFileSize).not.toHaveBeenCalled()
    })

    it('imports file and dispatches name/description', async () => {
      const definition = {
        name: 'Imported',
        description: 'A workflow',
        triggers: [],
        nodes: [],
        edges: [],
      }
      mockValidateFileSize.mockReturnValue(undefined)
      mockParseWorkflowFile.mockReturnValue(definition)
      mockLoadDefinition.mockReturnValue({ workflowDef: {}, edges: [] })
      mockGetState.mockReturnValue({ replaceWorkflowContent: mockReplaceWorkflowContent })

      const file = new File([JSON.stringify(definition)], 'test.json', { type: 'application/json' })
      const { result } = renderImportExportHook()

      act(() => result.current.handleImportFile(createFileChangeEvent(file)))

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_WORKFLOW_NAME', payload: 'Imported' })
      })
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_WORKFLOW_DESCRIPTION', payload: 'A workflow' })
      expect(mockMarkDirty).toHaveBeenCalled()
    })

    it('truncates name over 255 characters with toast', async () => {
      const longName = 'x'.repeat(300)
      const definition = { name: longName, triggers: [], nodes: [], edges: [] }
      mockValidateFileSize.mockReturnValue(undefined)
      mockParseWorkflowFile.mockReturnValue(definition)
      mockLoadDefinition.mockReturnValue({ workflowDef: {}, edges: [] })
      mockGetState.mockReturnValue({ replaceWorkflowContent: mockReplaceWorkflowContent })

      const file = new File(['{}'], 'test.json')
      const { result } = renderImportExportHook()

      act(() => result.current.handleImportFile(createFileChangeEvent(file)))

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith({
          type: 'SET_WORKFLOW_NAME',
          payload: 'x'.repeat(255),
        })
      })
      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Import note',
        description: 'Workflow name was truncated to 255 characters',
      })
    })

    it('shows error toast on import failure', async () => {
      mockValidateFileSize.mockImplementation(() => {
        throw new Error('File is too large')
      })

      const file = new File(['{}'], 'test.json')
      const { result } = renderImportExportHook()

      act(() => result.current.handleImportFile(createFileChangeEvent(file)))

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith({
          title: 'Import failed',
          description: 'File is too large',
        })
      })
    })
  })

  it('returns a ref for the file input', () => {
    const { result } = renderImportExportHook()

    expect(result.current.importFileRef).toBeDefined()
    expect(result.current.importFileRef.current).toBeNull()
  })
})
