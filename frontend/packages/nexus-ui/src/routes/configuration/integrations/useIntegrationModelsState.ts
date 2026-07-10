import { useCallback, useEffect, useRef } from 'react'

import { useUnsavedChanges } from '../../../app/useUnsavedChanges'
import { detachPromise } from '../../../utils/detachPromise'

import { useAllIntegrationModels } from './useAllIntegrationModels'
import { useItemSelection } from './useItemSelection'
import { useModelDefaultTracking } from './useModelDefaultTracking'
import { useModelSave } from './useModelSave'

export function useIntegrationModelsState(integrationId: string, isActive: boolean) {
  const { registerDirtyCheck } = useUnsavedChanges()

  const { models, isLoading, error, refetch: refetchModels } = useAllIntegrationModels(integrationId)

  const {
    enabledIds: enabledModelIds,
    enabledCount,
    allSelected,
    isDirty: selectionDirty,
    handleSelectAll,
    handleSelectItem: handleSelectModel,
    resetToServer: resetSelectionToServer,
  } = useItemSelection(models, models)

  const {
    defaultModelId,
    serverDefaultId,
    isDefaultDirty,
    handleSetDefault,
    handleRemoveDefault,
    handleSelectWithDefaultClear,
    resetDefault,
  } = useModelDefaultTracking(models, enabledModelIds, handleSelectModel)

  const { save: saveModels, isSaving } = useModelSave(integrationId)

  const isDirty = selectionDirty || isDefaultDirty

  const saveRef = useRef<() => Promise<boolean>>(null)

  useEffect(() => {
    saveRef.current = () => saveModels({ models, enabledModelIds, defaultModelId, serverDefaultId, isDefaultDirty })
  })

  const handleSave = useCallback(() => {
    detachPromise(saveRef.current?.() ?? Promise.resolve(false))
  }, [])

  const isDirtyRef = useRef(false)

  useEffect(() => {
    isDirtyRef.current = isDirty
  })

  useEffect(() => {
    return registerDirtyCheck({
      check: () => isActive && isDirtyRef.current,
      saveAndExit: () => saveRef.current?.() ?? Promise.resolve(false),
      exitWithoutSaving: () => {
        isDirtyRef.current = false
        resetSelectionToServer()
        resetDefault()
      },
      title: 'Save model changes?',
      body: 'You have unsaved changes to enabled models. Would you like to save before leaving?',
      saveLabel: 'Save model changes',
    })
  }, [registerDirtyCheck, resetSelectionToServer, resetDefault, isActive])

  return {
    models,
    isLoading,
    error,
    refetchModels,
    enabledModelIds,
    enabledCount,
    allSelected,
    isDirty,
    isSaving,
    handleSave,
    handleSelectAll,
    defaultModelId,
    handleSelectWithDefaultClear,
    handleSetDefault,
    handleRemoveDefault,
    resetSelectionToServer,
    resetDefault,
  }
}
