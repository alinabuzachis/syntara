import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useCallback, useState, type Dispatch } from 'react'

import { useDialogState } from '../../../hooks/useDialogState'
import { useAlerts } from '../../../providers/alerts'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { detachPromise } from '../../../utils/detachPromise'
import type { BuilderAction } from '../builderReducer'

import { useBuilderVersionHistory } from './useBuilderVersionHistory'

type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowReadWithVersion']

type UseBuilderVersionPanelParams = {
  workflowId: string | null
  isNew: boolean
  workflow: WorkflowWithVersion | undefined
  viewingVersion: number | null
  versionHistoryOpen: boolean
  dispatch: Dispatch<BuilderAction>
  handleSaveWorkflow: () => Promise<boolean>
  workflowName: string
  expandAllEvent: EventTarget
  baseHandleToggleVersionHistory: () => void
}

export function useBuilderVersionPanel(params: UseBuilderVersionPanelParams) {
  const {
    workflowId,
    isNew,
    workflow,
    viewingVersion,
    versionHistoryOpen,
    dispatch,
    handleSaveWorkflow,
    expandAllEvent,
    baseHandleToggleVersionHistory,
  } = params
  const { isDirty } = useWorkflowStore()
  const { showSuccess, showError } = useAlerts()

  const {
    filteredVersions,
    statusFilter,
    setStatusFilter,
    exportVersion,
    openInNewWindow,
    publishVersion,
    isViewingVersion,
    viewedVersionDate,
    viewedVersionStatus,
    viewedVersionDescription,
    viewedVersionPublishName,
    handleExitVersionView,
    handleConfirmRestore,
    restoreDialog,
    restoreDialogTitle,
    restoreMutation,
    versionsQuery,
  } = useBuilderVersionHistory({
    workflowId,
    isNew,
    workflow,
    viewingVersion,
    dispatch,
    showSuccess,
    showError,
    expandAllEvent,
  })

  const { refetch: refetchVersions } = versionsQuery

  const handleToggleVersionHistory = useCallback(() => {
    baseHandleToggleVersionHistory()
    if (!versionHistoryOpen) {
      detachPromise(refetchVersions())
    }
  }, [baseHandleToggleVersionHistory, versionHistoryOpen, refetchVersions])

  const versionPublishDialog = useDialogState<number>()

  const [pendingViewVersion, setPendingViewVersion] = useState<number | null>(null)
  const handleSelectVersion = useCallback(
    (version: number) => {
      if (isDirty && !isViewingVersion) {
        setPendingViewVersion(version)
      } else {
        dispatch({ type: 'SET_VIEWING_VERSION', payload: version })
      }
    },
    [isDirty, isViewingVersion, dispatch]
  )

  const openRestoreDialogForCurrentVersion =
    isViewingVersion && viewedVersionDate && viewingVersion !== null
      ? () => restoreDialog.open({ version: viewingVersion, dateTime: viewedVersionDate })
      : undefined

  const handleSaveBeforeView = useCallback(async (): Promise<boolean> => {
    const versionToView = pendingViewVersion
    const saved = await handleSaveWorkflow()
    setPendingViewVersion(null)
    if (saved && versionToView !== null) {
      dispatch({ type: 'SET_VIEWING_VERSION', payload: versionToView })
    }
    return saved
  }, [pendingViewVersion, handleSaveWorkflow, dispatch])

  const handleViewWithoutSaving = useCallback(() => {
    if (pendingViewVersion !== null) {
      dispatch({ type: 'SET_VIEWING_VERSION', payload: pendingViewVersion })
    }
    setPendingViewVersion(null)
  }, [pendingViewVersion, dispatch])

  const handleCancelSaveBeforeView = useCallback(() => {
    setPendingViewVersion(null)
  }, [])

  return {
    isViewingVersion,
    viewedVersionDate,
    viewedVersionStatus,
    viewedVersionDescription,
    viewedVersionPublishName,
    handleExitVersionView,
    handleToggleVersionHistory,
    openRestoreDialogForCurrentVersion,

    versionSidePanel: {
      show: !isNew && !!workflowId && versionHistoryOpen,
      filteredVersions,
      selectedVersion: viewingVersion,
      statusFilter,
      onStatusFilterChange: setStatusFilter,
      onClose: () => dispatch({ type: 'SET_VERSION_HISTORY_OPEN', payload: false }),
      onSelectVersion: handleSelectVersion,
      onRestoreVersion: (v: number, createdAt: string) => restoreDialog.open({ version: v, dateTime: createdAt }),
      onExportVersion: (v: number) => exportVersion(v),
      onOpenInNewWindow: openInNewWindow,
      onPublishVersion: (v: number) => versionPublishDialog.open(v),

      publishDialog: {
        isOpen: versionPublishDialog.isOpen,
        onClose: versionPublishDialog.close,
        onPublish: (publishName?: string, description?: string) => {
          if (versionPublishDialog.item != null) {
            publishVersion(versionPublishDialog.item, publishName, description)
            versionPublishDialog.close()
          }
        },
      },

      saveBeforeViewDialog: {
        isOpen: pendingViewVersion !== null,
        onSave: handleSaveBeforeView,
        onViewWithoutSaving: handleViewWithoutSaving,
        onCancel: handleCancelSaveBeforeView,
      },

      restoreDialog: {
        isOpen: restoreDialog.isOpen,
        title: restoreDialogTitle,
        isLoading: restoreMutation.isPending,
        onClose: restoreDialog.close,
        onConfirm: handleConfirmRestore,
      },
    },
  }
}

export type UseBuilderVersionPanelReturn = ReturnType<typeof useBuilderVersionPanel>
export type VersionSidePanelState = UseBuilderVersionPanelReturn['versionSidePanel']
