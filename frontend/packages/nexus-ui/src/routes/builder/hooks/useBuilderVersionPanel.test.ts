import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useBuilderVersionPanel } from './useBuilderVersionPanel'

const mockRestoreDialogOpen = vi.fn()
const mockRestoreDialogClose = vi.fn()
const mockRefetch = vi.fn().mockResolvedValue({})
const mockExportVersion = vi.fn()
const mockOpenInNewWindow = vi.fn()
const mockPublishVersion = vi.fn()
const mockHandleExitVersionView = vi.fn()
const mockHandleConfirmRestore = vi.fn()

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: () => ({ isDirty: false }),
}))

vi.mock('../../../providers/alerts', () => ({
  useAlerts: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('../../../hooks/useDialogState', () => ({
  useDialogState: () => ({
    isOpen: false,
    item: null,
    open: vi.fn(),
    close: vi.fn(),
  }),
}))

vi.mock('./useBuilderVersionHistory', () => ({
  useBuilderVersionHistory: () => ({
    filteredVersions: [],
    statusFilter: [],
    setStatusFilter: vi.fn(),
    exportVersion: mockExportVersion,
    openInNewWindow: mockOpenInNewWindow,
    publishVersion: mockPublishVersion,
    isViewingVersion: false,
    viewedVersionDate: null,
    viewedVersionStatus: null,
    handleExitVersionView: mockHandleExitVersionView,
    handleConfirmRestore: mockHandleConfirmRestore,
    restoreDialog: {
      isOpen: false,
      item: null,
      open: mockRestoreDialogOpen,
      close: mockRestoreDialogClose,
    },
    restoreDialogTitle: '',
    restoreMutation: { isPending: false },
    versionsQuery: { refetch: mockRefetch },
  }),
}))

function createParams(overrides: Record<string, unknown> = {}) {
  return {
    workflowId: 'wf-1',
    isNew: false,
    workflow: undefined,
    viewingVersion: null as number | null,
    versionHistoryOpen: false,
    dispatch: vi.fn(),
    handleSaveWorkflow: vi.fn().mockResolvedValue(true),
    workflowName: 'Test Workflow',
    expandAllEvent: new EventTarget(),
    baseHandleToggleVersionHistory: vi.fn(),
    ...overrides,
  }
}

describe('useBuilderVersionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns isViewingVersion from inner hook', () => {
    const { result } = renderHook(() => useBuilderVersionPanel(createParams()))

    expect(result.current.isViewingVersion).toBe(false)
  })

  it('handleToggleVersionHistory calls base handler', () => {
    const baseHandleToggleVersionHistory = vi.fn()
    const { result } = renderHook(() => useBuilderVersionPanel(createParams({ baseHandleToggleVersionHistory })))

    act(() => {
      result.current.handleToggleVersionHistory()
    })

    expect(baseHandleToggleVersionHistory).toHaveBeenCalledTimes(1)
  })

  it('handleToggleVersionHistory refetches when opening', () => {
    const { result } = renderHook(() => useBuilderVersionPanel(createParams({ versionHistoryOpen: false })))

    act(() => {
      result.current.handleToggleVersionHistory()
    })

    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('handleToggleVersionHistory does not refetch when closing', () => {
    const { result } = renderHook(() => useBuilderVersionPanel(createParams({ versionHistoryOpen: true })))

    act(() => {
      result.current.handleToggleVersionHistory()
    })

    expect(mockRefetch).not.toHaveBeenCalled()
  })

  it('openRestoreDialogForCurrentVersion is undefined when not viewing a version', () => {
    const { result } = renderHook(() => useBuilderVersionPanel(createParams()))

    expect(result.current.openRestoreDialogForCurrentVersion).toBeUndefined()
  })

  it('versionSidePanel.show is true when conditions are met', () => {
    const { result } = renderHook(() =>
      useBuilderVersionPanel(createParams({ isNew: false, workflowId: 'wf-1', versionHistoryOpen: true }))
    )

    expect(result.current.versionSidePanel.show).toBe(true)
  })

  it('versionSidePanel.show is false when workflow is new', () => {
    const { result } = renderHook(() => useBuilderVersionPanel(createParams({ isNew: true, versionHistoryOpen: true })))

    expect(result.current.versionSidePanel.show).toBe(false)
  })

  it('versionSidePanel.show is false when workflowId is null', () => {
    const { result } = renderHook(() =>
      useBuilderVersionPanel(createParams({ workflowId: null, versionHistoryOpen: true }))
    )

    expect(result.current.versionSidePanel.show).toBe(false)
  })

  it('versionSidePanel.show is false when versionHistoryOpen is false', () => {
    const { result } = renderHook(() => useBuilderVersionPanel(createParams({ versionHistoryOpen: false })))

    expect(result.current.versionSidePanel.show).toBe(false)
  })

  it('saveBeforeViewDialog starts closed', () => {
    const { result } = renderHook(() => useBuilderVersionPanel(createParams()))

    expect(result.current.versionSidePanel.saveBeforeViewDialog.isOpen).toBe(false)
  })

  it('onSelectVersion dispatches SET_VIEWING_VERSION when not dirty', () => {
    const dispatch = vi.fn()
    const { result } = renderHook(() => useBuilderVersionPanel(createParams({ dispatch })))

    act(() => {
      result.current.versionSidePanel.onSelectVersion(5)
    })

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_VIEWING_VERSION', payload: 5 })
  })

  it('restoreDialog state is exposed in versionSidePanel', () => {
    const { result } = renderHook(() => useBuilderVersionPanel(createParams()))

    expect(result.current.versionSidePanel.restoreDialog.isOpen).toBe(false)
    expect(result.current.versionSidePanel.restoreDialog.isLoading).toBe(false)
  })
})
